import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compactVoiceWaveform, inspectVoiceSignal, voiceTime } from '../app/utils/contactVoice.ts'
import { createContactVoiceSession } from '../app/utils/contactVoiceSession.ts'

const flush = async () => { await Promise.resolve(); await Promise.resolve() }

function harness() {
  const originals = new Map()
  const install = (name, value) => { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, value, writable: true }) }
  let now = 0
  let rms = 0.03
  let permission = null
  let closedContexts = 0
  const intervals = new Set()
  const timeouts = new Map()
  const tracks = []
  const recorders = []
  const microphones = [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Test microphone' }]
  const acquire = () => {
    const track = { label: 'Test microphone', stopped: false, stop() { this.stopped = true } }
    tracks.push(track)
    return { getAudioTracks: () => [track], getTracks: () => [track] }
  }
  class FakeContext {
    state = 'running'
    resume() { return Promise.resolve() }
    close() { this.state = 'closed'; closedContexts++; return Promise.resolve() }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: data => data.fill(rms) } }
  }
  class FakeRecorder {
    constructor() { recorders.push(this) }
    static isTypeSupported(type) { return type.includes('webm') }
    mimeType = 'audio/webm'
    state = 'inactive'
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); this.onstop?.() }) }
  }
  install('window', { isSecureContext: true, AudioContext: FakeContext })
  install('document', { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} })
  install('navigator', { mediaDevices: { getUserMedia: async () => permission ? permission() : acquire(), enumerateDevices: async () => microphones, addEventListener() {}, removeEventListener() {} } })
  install('MediaRecorder', FakeRecorder)
  install('performance', { now: () => now })
  install('setInterval', fn => { intervals.add(fn); return fn })
  install('clearInterval', fn => intervals.delete(fn))
  install('setTimeout', (fn, ms) => { timeouts.set(fn, now + ms); return fn })
  install('clearTimeout', fn => timeouts.delete(fn))
  const session = createContactVoiceSession()
  session.attach()
  return {
    session, tracks, acquire,
    appendChunk: value => recorders.at(-1).ondataavailable({ data: new Blob([value], { type: 'audio/webm' }) }),
    setRms: value => { rms = value },
    setPermission: value => { permission = value },
    get closedContexts() { return closedContexts },
    advance(ms) {
      for (let passed = 0; passed < ms; passed += 100) {
        now += Math.min(100, ms - passed)
        for (const fn of [...intervals]) fn()
        for (const [fn, deadline] of [...timeouts]) if (deadline <= now) { timeouts.delete(fn); fn() }
      }
    },
    async record(ms = 1000, replacement = null) {
      await session.start(replacement)
      this.advance(ms)
      session.stop()
      await flush()
      assert.equal(session.status.value, 'idle')
    },
    async restore() {
      session.detach()
      await flush()
      session.clear()
      for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
    },
  }
}

test('available microphones populate before recording without requesting microphone access', async () => {
  const h = harness()
  let permissionRequests = 0
  h.setPermission(() => { permissionRequests++; return h.acquire() })
  try {
    await flush()
    assert.deepEqual(h.session.devices.value.map(device => device.deviceId), ['mic-1'])
    assert.equal(h.session.status.value, 'idle')
    assert.equal(permissionRequests, 0)
    assert.equal(h.tracks.length, 0)
    await h.session.refreshDevices()
    assert.equal(permissionRequests, 0)
  } finally { await h.restore() }
})

test('signal heuristic warns after ten seconds; a healthy signal suppresses pause warnings', () => {
  assert.equal(inspectVoiceSignal(Array(100).fill(0), 9, false), null)
  assert.equal(inspectVoiceSignal(Array(100).fill(0), 10, false), 'silent')
  assert.equal(inspectVoiceSignal(Array(100).fill(0.003), 10, false), 'quiet')
  assert.equal(inspectVoiceSignal(Array(100).fill(0), 30, true), null)
  assert.equal(voiceTime(90), '1:30')
  assert.equal(compactVoiceWaveform([0, 0.1, 0.03]).length, 48)
})

test('two-message limit and deletion recover a slot and time; new messages append in recording order', async () => {
  const h = harness()
  try {
    for (let i = 0; i < 2; i++) await h.record()
    assert.equal(h.session.clips.value.length, 2)
    assert.equal(h.session.totalSeconds.value, 2)
    await h.session.start()
    assert.equal(h.session.status.value, 'idle')
    assert.match(h.session.error.value, /Лимит/)
    const id = h.session.clips.value[0].id
    const survivorId = h.session.clips.value[1].id
    h.session.remove(id)
    assert.equal(h.session.clips.value.length, 1)
    assert.equal(h.session.clips.value[0].id, survivorId)
    assert.equal(h.session.remaining.value, 89)
    await h.record()
    assert.equal(h.session.clips.value.length, 2)
    assert.equal(h.session.clips.value[0].id, survivorId)
    assert.notEqual(h.session.clips.value[1].id, id)
    assert.ok(h.tracks.every(track => track.stopped))
  } finally { await h.restore() }
})

test('successful recording replaces in place automatically; cancellation preserves the original and its order', async () => {
  const h = harness()
  try {
    await h.record(2000)
    await h.record(1000)
    const original = h.session.clips.value[0]
    const second = h.session.clips.value[1]
    await h.session.start(original.id)
    h.advance(1000)
    assert.equal(h.session.clips.value[0], original)
    h.session.stop(true)
    await flush()
    assert.equal(h.session.clips.value[0], original)
    await h.session.start(original.id)
    // Invalid short recordings must also preserve the previous message.
    h.advance(100)
    h.session.stop()
    await flush()
    assert.equal(h.session.clips.value[0], original)
    await h.record(3000, original.id)
    assert.equal(h.session.clips.value.length, 2)
    assert.notEqual(h.session.clips.value[0].id, original.id)
    assert.equal(h.session.clips.value[1], second)
    assert.equal(h.session.totalSeconds.value, 4)
  } finally { await h.restore() }
})

test('automatic stop honours aggregate time; replacing a clip credits its own duration', async () => {
  const h = harness()
  try {
    await h.record(89000)
    await h.session.start()
    h.advance(1000)
    await flush()
    assert.equal(h.session.status.value, 'idle')
    assert.ok(h.session.totalSeconds.value >= 89.7 && h.session.totalSeconds.value <= 90)
    await h.session.start()
    assert.equal(h.session.status.value, 'idle')
    await h.session.start(h.session.clips.value[0].id)
    assert.equal(h.session.status.value, 'recording')
    h.session.stop(true)
    await flush()
    assert.equal(h.session.clips.value.length, 2)
  } finally { await h.restore() }
})

test('quiet or silent input is flagged; detected signal clears the warning', async () => {
  const h = harness()
  try {
    h.setRms(0)
    await h.session.start()
    h.advance(10100)
    assert.equal(h.session.warning.value, 'silent')
    h.setRms(0.03)
    h.advance(500)
    assert.equal(h.session.warning.value, null)
    h.setRms(0)
    h.advance(10100)
    assert.equal(h.session.warning.value, null)
    h.session.stop()
    await flush()
    assert.equal(h.session.clips.value[0].warning, null)
    assert.ok(h.closedContexts > 0)
  } finally { await h.restore() }
})

test('cancelled permission request cannot start recording later or leak the microphone', async () => {
  const h = harness()
  try {
    let resolve
    h.setPermission(() => new Promise(done => { resolve = done }))
    const starting = h.session.start()
    assert.equal(h.session.status.value, 'requesting')
    h.session.stop(true)
    resolve(h.acquire())
    await starting
    assert.equal(h.session.status.value, 'idle')
    assert.ok(h.tracks.every(track => track.stopped))
    h.setPermission(() => Promise.reject(new DOMException('Denied', 'NotAllowedError')))
    await h.session.start()
    assert.match(h.session.error.value, /Доступ к микрофону закрыт/)
  } finally { await h.restore() }
})

test('leaving the form retains all accumulated chunks and closes the microphone', async () => {
  const h = harness()
  try {
    await h.session.start()
    h.advance(2100)
    h.appendChunk('first')
    h.appendChunk('second')
    h.session.detach()
    await flush()
    await flush()
    assert.equal(h.session.status.value, 'idle')
    assert.equal(h.session.clips.value[0].blob.size, 16)
    assert.ok(h.tracks.every(track => track.stopped))
    h.session.attach()
    assert.equal(h.session.clips.value.length, 1)
  } finally { await h.restore() }
})
