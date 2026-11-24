// All sound is local. The context is unlocked in the actual click handler;
// playback starts only after the companion reaches and operates the radio.
export class FieldRadio {
  constructor(onChange) {
    this.onChange = onChange;
    this.context = null; this.buffer = null; this.loading = null;
    this.sources = []; this.wanted = false; this.playing = false; this.version = 0;
  }

  prepare() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return Promise.reject(new Error('Web Audio unavailable'));
    if (!this.context) this.context = new Audio();
    // Call resume before awaiting the file: transient user activation is short.
    const unlocked = this.context.resume();
    if (!this.loading) {
      this.loading = fetch('./audio/field-radio.mp3')
        .then(response => { if (!response.ok) throw new Error('Radio track unavailable'); return response.arrayBuffer(); })
        .then(data => this.context.decodeAudioData(data))
        .then(buffer => { this.buffer = buffer; return buffer; })
        .catch(error => { this.loading = null; throw error; });
    }
    return Promise.all([unlocked, this.loading]);
  }

  async toggle() {
    this.wanted = !this.wanted;
    const version = ++this.version;
    if (!this.wanted) { this.stop(); this.onChange(false); return; }
    try {
      await this.prepare();
      if (!this.wanted || version !== this.version) return;
      const ctx = this.context, now = ctx.currentTime;
      const master = ctx.createGain(); master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(.33, now + .24); master.connect(ctx.destination);
      const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 160;
      const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 3900; low.Q.value = .45;
      const music = ctx.createBufferSource(); music.buffer = this.buffer; music.loop = true;
      music.connect(high); high.connect(low); low.connect(master);
      const wobble = ctx.createOscillator(), depth = ctx.createGain();
      wobble.frequency.value = .31; depth.gain.value = 5;
      wobble.connect(depth); depth.connect(music.detune);
      // A quiet bed of hiss and sparse needle clicks, generated once per start.
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * .016 + (Math.random() < .00035 ? (Math.random() * 2 - 1) * .26 : 0);
      const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer; noise.loop = true;
      const noiseFilter = ctx.createBiquadFilter(); noiseFilter.type = 'lowpass'; noiseFilter.frequency.value = 6000;
      noise.connect(noiseFilter); noiseFilter.connect(master);
      for (const node of [music, wobble, noise]) node.start();
      this.sources = [music, wobble, noise]; this.master = master;
      this.graph = [master, high, low, depth, noiseFilter];
      this.playing = true; this.onChange(true);
      if (document.hidden) await ctx.suspend();
    } catch (error) {
      this.wanted = false; this.stop(); this.onChange(false, error);
    }
  }

  stop() {
    const ctx = this.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.master?.gain.cancelScheduledValues(now);
    this.master?.gain.setTargetAtTime(0, now, .035);
    const graph = this.graph || [], master = this.master;
    for (const node of this.sources) {
      node.onended = () => { node.disconnect(); for (const item of graph) item.disconnect(); master?.disconnect(); };
      node.stop(now + .16);
    }
    this.sources = []; this.graph = []; this.master = null; this.playing = false;
  }

  visibility(hidden) {
    if (!this.context) return;
    if (hidden) void this.context.suspend().catch(() => {});
    else if (this.wanted) void this.context.resume().catch(() => {});
  }

  dispose() {
    this.wanted = false; this.version++;
    this.stop(); void this.context?.close().catch(() => {});
  }
}
