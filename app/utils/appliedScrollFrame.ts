export type AppliedScrollSource = 'lenis' | 'native'

export type AppliedScrollFrame = {
  /** Scroll position already committed to the document for this paint. */
  y: number
  delta: number
  direction: -1 | 0 | 1
  /** Approximate applied velocity in CSS pixels per second. */
  velocity: number
  dt: number
  revision: number
  source: AppliedScrollSource
}

export type AppliedScrollFrameListener = (frame: AppliedScrollFrame) => void

const listeners = new Set<AppliedScrollFrameListener>()
let lenisConnected = false
let lastY = 0
let lastAt = 0
let revision = 0

/**
 * Lenis is the authoritative publisher while connected. Native scroll remains
 * the fallback for reduced motion and environments where Lenis is disabled.
 */
export function isAppliedScrollDriverConnected() {
  return lenisConnected
}

export function setAppliedScrollDriverConnected(connected: boolean) {
  lenisConnected = connected
  lastY = typeof window === 'undefined' ? 0 : Math.max(0, window.scrollY || 0)
  lastAt = 0
}

/** Publish only after the source has committed this exact scroll position. */
export function publishAppliedScrollFrame(
  scrollY: number,
  source: AppliedScrollSource,
  now = performance.now(),
) {
  if (source === 'native' && lenisConnected) return

  const y = Math.max(0, scrollY)
  const dt = lastAt > 0 ? Math.min(0.064, Math.max(0, (now - lastAt) / 1000)) : 0
  const delta = y - lastY
  const direction = delta > 0.5 ? 1 : delta < -0.5 ? -1 : 0
  const frame: AppliedScrollFrame = {
    y,
    delta,
    direction,
    velocity: dt > 0 ? delta / dt : 0,
    dt,
    revision: ++revision,
    source,
  }
  lastY = y
  lastAt = now
  listeners.forEach(listener => listener(frame))
}

export function subscribeAppliedScrollFrame(listener: AppliedScrollFrameListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
