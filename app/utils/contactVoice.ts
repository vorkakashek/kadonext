export const VOICE_MAX_COUNT = 2
export const VOICE_MAX_SECONDS = 90
export const VOICE_MAX_BYTES = 12 * 1024 * 1024

export interface VoiceClip {
  id: string
  blob: Blob
  url: string
  seconds: number
  waveform: number[]
  warning: 'silent' | 'quiet' | null
}

export function voiceTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function voiceExtension(mime: string) {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

/** A level heuristic, not speech recognition. Ignore pauses after a healthy signal. */
export function inspectVoiceSignal(samples: number[], elapsed: number, heardSignal: boolean) {
  if (heardSignal || elapsed < 10 || samples.length < 30) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const upperLevel = sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 0
  if (upperLevel < 0.0004) return 'silent' as const
  if (upperLevel < 0.012) return 'quiet' as const
  return null
}

export function compactVoiceWaveform(samples: number[], count = 48) {
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * samples.length / count)
    const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / count))
    let peak = 0
    for (let i = start; i < end; i++) peak = Math.max(peak, samples[i] ?? 0)
    return Math.max(0.06, Math.min(1, Math.sqrt(peak / 0.12)))
  })
}
