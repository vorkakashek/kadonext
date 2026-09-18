<script setup lang="ts">
import { IconDownload, IconPlayerPause, IconPlayerPlay } from '@tabler/icons-vue'
import { voiceExtension, voiceTime } from '~/utils/contactVoice'
import type { VoiceClip } from '~/utils/contactVoice'

const props = defineProps<{ clip: VoiceClip; label: string; active: boolean; disabled?: boolean }>()
const emit = defineEmits<{ play: [id: string]; pause: [id: string] }>()
const audioEl = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const current = ref(0)
const playbackError = ref(false)
const progress = computed(() => Math.min(1, current.value / Math.max(0.01, props.clip.seconds)))

async function toggle() {
  const audio = audioEl.value
  if (!audio || props.disabled) return
  if (playing.value) {
    audio.pause()
    return
  }
  playbackError.value = false
  emit('play', props.clip.id)
  try { await audio.play() } catch { playbackError.value = true; emit('pause', props.clip.id) }
}

function seek(event: Event) {
  const audio = audioEl.value
  if (!audio) return
  const time = Number((event.target as HTMLInputElement).value)
  try { audio.currentTime = time; current.value = time } catch { /* Wait for metadata. */ }
}

function paused() {
  playing.value = false
  emit('pause', props.clip.id)
}

function pauseWhenHidden() {
  if (document.hidden) audioEl.value?.pause()
}

watch(() => [props.active, props.disabled], () => {
  if (!props.active || props.disabled) audioEl.value?.pause()
})
onMounted(() => document.addEventListener('visibilitychange', pauseWhenHidden))
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', pauseWhenHidden)
  audioEl.value?.pause()
})
</script>

<template>
  <div class="voice-player">
    <audio
      ref="audioEl"
      :src="clip.url"
      preload="metadata"
      @play="playing = true"
      @pause="paused"
      @ended="paused"
      @timeupdate="current = audioEl?.currentTime ?? 0"
      @error="playbackError = true"
    />
    <button
      class="voice-player__play"
      type="button"
      :disabled="disabled"
      :aria-label="`${playing ? 'Приостановить' : 'Прослушать'}: ${label}`"
      @click="toggle"
    >
      <IconPlayerPause v-if="playing" :size="20" stroke="1.5" aria-hidden="true" />
      <IconPlayerPlay v-else :size="20" stroke="1.5" aria-hidden="true" />
    </button>
    <div class="voice-player__timeline">
      <div class="voice-player__wave" aria-hidden="true">
        <span
          v-for="(height, index) in clip.waveform"
          :key="index"
          :class="{ 'is-played': index / clip.waveform.length < progress }"
          :style="{ transform: `scaleY(${height})` }"
        />
      </div>
      <input
        type="range"
        min="0"
        :max="clip.seconds"
        step="0.1"
        :value="current"
        :disabled="disabled || playbackError"
        :aria-label="`Позиция воспроизведения: ${label}`"
        :aria-valuetext="`${voiceTime(current)} из ${voiceTime(clip.seconds)}`"
        @input="seek"
      >
    </div>
    <span class="voice-player__time">{{ voiceTime(playing || current > 0 ? current : clip.seconds) }}</span>
    <a
      class="voice-player__download"
      :href="clip.url"
      :download="`${label}.${voiceExtension(clip.blob.type)}`"
      :aria-label="`Скачать: ${label}`"
    ><IconDownload :size="18" stroke="1.5" aria-hidden="true" /></a>
    <p v-if="playbackError" class="voice-player__error" role="status">
      Не удалось воспроизвести запись. Можно скачать её и прослушать на устройстве.
    </p>
  </div>
</template>

<style scoped>
.voice-player { display: grid; grid-template-columns: 2.75rem minmax(0, 1fr) auto 2.5rem; align-items: center; gap: 0.7rem; }
.voice-player__play, .voice-player__download { display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border: 1px solid color-mix(in srgb, var(--palette-forest) 25%, transparent); border-radius: 50%; color: var(--palette-forest); background: transparent; cursor: pointer; transition: background 0.2s, color 0.2s; }
.voice-player__play:hover { color: var(--palette-sand); background: var(--palette-forest); }
.voice-player__download { width: 2.5rem; height: 2.5rem; border: 0; }
.voice-player__download:hover { background: color-mix(in srgb, var(--palette-forest) 8%, transparent); }
.voice-player__timeline { position: relative; min-width: 0; height: 2.75rem; }
.voice-player__wave { display: flex; height: 100%; gap: 3px; align-items: center; overflow: hidden; }
.voice-player__wave span { flex: 1; height: 70%; min-width: 1px; background: color-mix(in srgb, var(--palette-forest) 27%, transparent); transform-origin: center; }
.voice-player__wave span.is-played { background: var(--palette-forest); }
.voice-player__timeline input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.voice-player__timeline:focus-within, .voice-player__play:focus-visible, .voice-player__download:focus-visible { outline: 2px solid var(--palette-forest); outline-offset: 4px; }
.voice-player__time { min-width: 3.1ch; font-size: 0.85rem; font-variant-numeric: tabular-nums; color: var(--palette-moss); }
.voice-player__error { grid-column: 1 / -1; margin: 0; font-size: 0.85rem; color: var(--palette-moss); }
button:disabled { opacity: 0.4; cursor: default; }
@media (max-width: 767.98px) { .voice-player { gap: 0.45rem; } .voice-player__wave { gap: 2px; } }
@media (prefers-reduced-motion: reduce) { .voice-player__play, .voice-player__download { transition: none; } }
</style>
