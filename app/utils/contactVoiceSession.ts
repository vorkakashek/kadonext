import { computed, ref, shallowRef } from 'vue'
import {
  compactVoiceWaveform, inspectVoiceSignal, VOICE_MAX_BYTES, VOICE_MAX_COUNT,
  VOICE_MAX_SECONDS,
} from './contactVoice.ts'
import type { VoiceClip } from './contactVoice.ts'

export function createContactVoiceSession() {
  const clips = shallowRef<VoiceClip[]>([])
  const status = ref<'idle' | 'requesting' | 'recording' | 'stopping'>('idle')
  const supported = ref(false)
  const error = ref('')
  const notice = ref('')
  const warning = ref<'silent' | 'quiet' | null>(null)
  const level = ref(0)
  const elapsed = ref(0)
  const replacementId = ref<string | null>(null)
  const devices = shallowRef<MediaDeviceInfo[]>([])
  const deviceId = ref('')
  const deviceLabel = ref('Микрофон по умолчанию')
  const totalSeconds = computed(() => clips.value.reduce((sum, clip) => sum + clip.seconds, 0))
  const remaining = computed(() => Math.max(0, VOICE_MAX_SECONDS - totalSeconds.value))
  const busy = computed(() => status.value !== 'idle')
  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let analyser: AnalyserNode | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let consumers = 0
  let discardRecording = false
  let startedAt = 0
  let recordingBudget = 0
  let chunks: Blob[] = []
  let bytes = 0
  let waveform: number[] = []
  let recentLevels: number[] = []
  let healthySamples = 0
  let heardSignal = false
  let finalWarning: VoiceClip['warning'] = null

  function releaseMicrophone() {
    if (timer) clearInterval(timer)
    if (deadlineTimer) clearTimeout(deadlineTimer)
    timer = null
    deadlineTimer = null
    source?.disconnect()
    source = null
    analyser = null
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    const audioContext = context
    context = null
    if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {})
    level.value = 0
  }

  async function refreshDevices() {
    try {
      devices.value = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput')
      if (deviceId.value && !devices.value.some(device => device.deviceId === deviceId.value)) {
        deviceId.value = ''
        notice.value = 'Выбранный микрофон отключён. Для следующей записи используем микрофон по умолчанию.'
      }
    } catch { /* Device selection is optional; recording may still be available. */ }
  }

  function stop(discard = false) {
    if (status.value === 'requesting') {
      generation++
      releaseMicrophone()
      status.value = 'idle'
      replacementId.value = null
      return
    }
    if (status.value !== 'recording' || !recorder) return
    discardRecording = discard
    elapsed.value = (performance.now() - startedAt) / 1000
    status.value = 'stopping'
    if (recorder.state !== 'inactive') recorder.stop()
    releaseMicrophone()
  }

  function microphoneError(cause: unknown) {
    const name = cause instanceof Error ? cause.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'Доступ к микрофону закрыт. Разрешите его в настройках сайта в браузере или расскажите о проекте текстом.'
    if (name === 'NotFoundError') return 'Микрофон не найден. Подключите его или расскажите о проекте текстом.'
    if (name === 'OverconstrainedError') return 'Выбранный микрофон недоступен. Выберите другой и повторите запись.'
    if (name === 'NotReadableError') return 'Не удалось включить микрофон. Проверьте подключение и не занят ли он другим приложением.'
    return 'Не удалось начать запись. Попробуйте ещё раз или расскажите о проекте текстом.'
  }

  async function start(replaceId: string | null = null) {
    if (busy.value) return
    error.value = ''
    notice.value = ''
    if (!supported.value) {
      error.value = 'Запись недоступна в этом браузере. Откройте сайт по HTTPS (локально — через localhost) в Safari, Chrome или Firefox либо напишите текст.'
      return
    }
    const oldClip = clips.value.find(clip => clip.id === replaceId)
    if (replaceId && !oldClip) return
    recordingBudget = VOICE_MAX_SECONDS - totalSeconds.value + (oldClip?.seconds ?? 0)
    if ((!oldClip && clips.value.length >= VOICE_MAX_COUNT) || recordingBudget < 1) {
      error.value = 'Лимит записей достигнут. Удалите сообщение или перезапишите одно из существующих.'
      return
    }
    const remainingBytes = VOICE_MAX_BYTES - clips.value.reduce((sum, clip) => sum + clip.blob.size, 0) + (oldClip?.blob.size ?? 0)
    if (remainingBytes < 1024) {
      error.value = 'Записи занимают слишком много места. Удалите одно из сообщений.'
      return
    }
    const token = ++generation
    replacementId.value = replaceId
    status.value = 'requesting'
    warning.value = null
    elapsed.value = 0
    healthySamples = 0
    heardSignal = false
    finalWarning = null
    recentLevels = []
    waveform = []
    chunks = []
    bytes = 0
    discardRecording = false
    // Resume from the button gesture, before the permission prompt (iOS).
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AudioContextClass) {
        context = new AudioContextClass()
        void context.resume().catch(() => {})
      }
    } catch { context = null }
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId.value ? { deviceId: { exact: deviceId.value } } : {}),
          channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true,
        },
      })
      if (token !== generation) {
        acquired.getTracks().forEach(track => track.stop())
        return
      }
      stream = acquired
      const track = acquired.getAudioTracks()[0]
      if (!track) throw new Error('Missing audio track')
      deviceLabel.value = track.label || 'Микрофон'
      void refreshDevices()
      track.onended = () => {
        if (token !== generation || status.value !== 'recording') return
        notice.value = 'Микрофон отключился. Сохранили записанную часть — прослушайте её перед отправкой.'
        stop()
      }
      track.onmute = () => {
        if (token === generation && status.value === 'recording') notice.value = 'Микрофон временно не передаёт звук. Проверьте подключение.'
      }
      track.onunmute = () => { if (token === generation) notice.value = '' }
      if (context) {
        try {
          await context.resume()
          if (token !== generation) return
          source = context.createMediaStreamSource(acquired)
          analyser = context.createAnalyser()
          analyser.fftSize = 1024
          source.connect(analyser)
        } catch {
          if (token === generation) notice.value = 'Проверка громкости недоступна. Прослушайте сообщение после записи.'
        }
      } else {
        notice.value = 'Проверка громкости недоступна. Прослушайте сообщение после записи.'
      }
      if (token !== generation) return
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type))
      const activeRecorder = new MediaRecorder(acquired, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64000 })
      recorder = activeRecorder
      activeRecorder.ondataavailable = event => {
        if (token !== generation || !event.data.size) return
        bytes += event.data.size
        if (bytes > remainingBytes) {
          error.value = 'Запись получилась слишком большой. Попробуйте записать более короткое сообщение.'
          discardRecording = true
          stop(true)
          return
        }
        chunks.push(event.data)
      }
      activeRecorder.onerror = () => {
        if (token !== generation) return
        discardRecording = true
        error.value = 'Браузер прервал запись. Предыдущие сообщения сохранены; попробуйте ещё раз.'
        stop(true)
      }
      activeRecorder.onstop = () => {
        if (token !== generation) return
        // Tracks may also end without a button press.
        if (status.value === 'recording') elapsed.value = (performance.now() - startedAt) / 1000
        releaseMicrophone()
        recorder = null
        const blob = new Blob(chunks, { type: activeRecorder.mimeType || chunks[0]?.type || 'audio/webm' })
        chunks = []
        if (discardRecording || !blob.size || elapsed.value < 0.35 || elapsed.value > recordingBudget + 0.5) {
          if (!discardRecording) error.value = elapsed.value > recordingBudget + 0.5
            ? 'Браузер задержал остановку записи. Она превысила лимит времени — запишите сообщение ещё раз.'
            : 'Запись слишком короткая. Попробуйте ещё раз.'
          status.value = 'idle'
          replacementId.value = null
          return
        }
        const clip: VoiceClip = {
          id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob),
          seconds: Math.min(elapsed.value, recordingBudget),
          waveform: compactVoiceWaveform(waveform), warning: finalWarning,
        }
        saveClip(clip)
      }
      const data = new Float32Array(1024)
      startedAt = performance.now()
      activeRecorder.start(1000)
      status.value = 'recording'
      timer = setInterval(() => {
        if (status.value !== 'recording') return
        elapsed.value = (performance.now() - startedAt) / 1000
        if (analyser && context?.state === 'running') {
          analyser.getFloatTimeDomainData(data)
          let power = 0
          for (const sample of data) power += sample * sample
          const rms = Math.sqrt(power / data.length)
          level.value = Math.min(1, Math.sqrt(rms / 0.12))
          waveform.push(rms)
          recentLevels.push(rms)
          if (recentLevels.length > 100) recentLevels.shift()
          if (rms >= 0.012) healthySamples++
          if (healthySamples >= 3) heardSignal = true
          warning.value = inspectVoiceSignal(recentLevels, elapsed.value, heardSignal)
          if (warning.value) finalWarning = warning.value
          if (heardSignal) finalWarning = null
        }
        if (elapsed.value >= recordingBudget - 0.2) {
          stop()
        }
      }, 100)
      deadlineTimer = setTimeout(() => {
        stop()
      }, Math.max(0, recordingBudget - 0.2) * 1000)
    } catch (cause) {
      if (token !== generation) return
      error.value = microphoneError(cause)
      releaseMicrophone()
      recorder = null
      status.value = 'idle'
      replacementId.value = null
    }
  }

  function saveClip(clip: VoiceClip) {
    const index = clips.value.findIndex(item => item.id === replacementId.value)
    const updated = [...clips.value]
    if (index >= 0) {
      URL.revokeObjectURL(updated[index]!.url)
      updated[index] = clip
    } else updated.push(clip)
    clips.value = updated
    replacementId.value = null
    status.value = 'idle'
    warning.value = null
  }

  function remove(id: string) {
    if (busy.value) return
    const clip = clips.value.find(item => item.id === id)
    if (clip) URL.revokeObjectURL(clip.url)
    clips.value = clips.value.filter(item => item.id !== id)
  }

  function visibilityChanged() {
    if (document.visibilityState === 'hidden') {
      if (status.value === 'requesting') stop(true)
      else if (status.value === 'recording') {
        notice.value = 'Остановили запись, когда вы свернули страницу. Записанная часть сохранена.'
        stop()
      }
    }
  }

  function attach() {
    if (++consumers !== 1) return
    supported.value = !!(window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined')
    document.addEventListener('visibilitychange', visibilityChanged)
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices)
    if (supported.value) void refreshDevices()
  }

  function detach() {
    consumers = Math.max(0, consumers - 1)
    queueMicrotask(() => {
      if (consumers) return
      document.removeEventListener('visibilitychange', visibilityChanged)
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices)
      // Preserve committed clips across the fallback → surface handoff.
      if (status.value === 'recording') {
        notice.value = 'Остановили запись при уходе со страницы. Записанная часть сохранена.'
        stop()
      } else if (status.value === 'requesting') stop(true)
      else releaseMicrophone()
      if (status.value !== 'stopping') chunks = []
    })
  }

  function clear() {
    if (busy.value) return
    clips.value.forEach(clip => URL.revokeObjectURL(clip.url))
    clips.value = []
    notice.value = ''
    error.value = ''
  }

  return {
    clips, status, supported, error, notice, warning, level, elapsed,
    replacementId, devices, deviceId, deviceLabel, totalSeconds, remaining, busy,
    start, stop, remove, attach, detach, clear, refreshDevices,
  }
}
