/**
 * Android collision taps for the hero swarm.
 * Three.js has no haptics — this is navigator.vibrate only.
 * iOS Safari: no Vibration API (skipped). Desktop: no-op / unsupported.
 *
 * Chrome requires sticky user activation — call {@link swarmHapticArm} once
 * from a real pointer/touch gesture before collision buzzes will fire.
 */

import { isAppleTouchDevice } from '~/utils/mobileViewport'

/** Ignore grazing overlaps — only feel a real bump. */
const MIN_OVERLAP = 0.1
/** Global gap so a cluster doesn't turn into a continuous buzz. */
const COOLDOWN_MS = 42
/** Android motors often miss sub‑10ms pulses — keep short but feelable. */
const PULSE_MIN_MS = 12
const PULSE_MAX_MS = 22

let cachedOk: boolean | null = null
/** Set by {@link swarmHapticArm} after a user gesture. */
let armed = false
/** Explicit user preference; incidental pointer presses must not enable haptics. */
let enabled = false
let lastBuzzAt = 0
const activePairs = new Set<number>()

function canVibrate(): boolean {
  if (cachedOk != null) return cachedOk
  if (typeof navigator === 'undefined') {
    cachedOk = false
    return false
  }
  // Apple never shipped Vibration API — don't bother with polyfill hacks.
  if (isAppleTouchDevice()) {
    cachedOk = false
    return false
  }
  if (!/Android/i.test(navigator.userAgent)) {
    cachedOk = false
    return false
  }
  cachedOk = typeof navigator.vibrate === 'function'
  return cachedOk
}

/** Stable pair id — caller must pass i < j. */
export function swarmHapticPairKey(i: number, j: number): number {
  return (i << 8) | j
}

export function swarmHapticReset(): void {
  activePairs.clear()
  lastBuzzAt = 0
}

/**
 * Arm Vibration API inside a user gesture (pointerdown / touchstart).
 * Without this, Chrome blocks later rAF `vibrate()` calls.
 */
export function swarmHapticArm(): boolean {
  if (!enabled) return false
  if (armed) return true
  if (!canVibrate()) return false
  try {
    // Cancel-any + marks activation for this document.
    armed = navigator.vibrate(0)
    return armed
  } catch {
    return false
  }
}

/** Explicit Android enable action with a short physical confirmation pulse. */
export function swarmHapticConfirm(): boolean {
  if (!canVibrate()) return false
  try {
    const accepted = navigator.vibrate(18)
    if (accepted) {
      enabled = true
      armed = true
    }
    return accepted
  } catch {
    return false
  }
}

/** Disable collision haptics and cancel any pulse already in progress. */
export function swarmHapticDisable(): void {
  enabled = false
  armed = false
  swarmHapticReset()
  if (!canVibrate()) return
  try {
    navigator.vibrate(0)
  } catch {
    /* ignore */
  }
}

export function swarmHapticIsArmed(): boolean {
  return enabled && armed && canVibrate()
}

/**
 * Edge-trigger a short buzz when a ball pair first reaches a real bump.
 * Call for every overlapping pair, then {@link swarmHapticPrune} once.
 */
export function swarmHapticContact(
  pairKey: number,
  overlap: number,
  now = performance.now(),
): void {
  if (!enabled || !armed || !canVibrate()) return
  // Don't lock the pair on a graze — wait until overlap is strong enough.
  if (overlap < MIN_OVERLAP) return
  const first = !activePairs.has(pairKey)
  activePairs.add(pairKey)
  if (!first) return
  if (now - lastBuzzAt < COOLDOWN_MS) return
  lastBuzzAt = now
  const t = Math.min(1, Math.max(0, (overlap - MIN_OVERLAP) / (1 - MIN_OVERLAP)))
  const ms = Math.round(PULSE_MIN_MS + (PULSE_MAX_MS - PULSE_MIN_MS) * t)
  try {
    navigator.vibrate(ms)
  } catch {
    /* ignore */
  }
}

/** Drop pairs that are no longer overlapping so a later hit can buzz again. */
export function swarmHapticPrune(alive: Set<number>): void {
  if (activePairs.size === 0) return
  for (const key of activePairs) {
    if (!alive.has(key)) activePairs.delete(key)
  }
}

/** Release one pair reported by a physics worker once its contact ends. */
export function swarmHapticRelease(pairKey: number): void {
  activePairs.delete(pairKey)
}
