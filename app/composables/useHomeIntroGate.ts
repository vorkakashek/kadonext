/**
 * Cold-home intro gate.
 *
 * The first surface paint is the only thing allowed to hold scroll. WebGL is
 * deliberately not part of this gate: it may continue warming after the page
 * becomes scrollable. The gate is bounded so a failed/lost surface can never
 * strand the document in a locked state.
 */
const LOCK_CLASS = 'home-intro-lock'
const MAX_LOCK_MS = 1100
const MAX_SETTLE_AFTER_SURFACE_MS = 2200

let unlockTimer = 0
let unlockRaf = 0

function clearUnlockTimer() {
  if (!unlockTimer) return
  window.clearTimeout(unlockTimer)
  unlockTimer = 0
}

export function useHomeIntroGate() {
  const started = useState<boolean>('home-intro-gate-started', () => false)
  const surfaceReady = useState<boolean>('home-intro-surface-ready', () => false)
  const headerReady = useState<boolean>('home-intro-header-ready', () => false)
  const contentReady = useState<boolean>('home-intro-content-ready', () => false)
  const introSettled = useState<boolean>('home-intro-settled', () => false)
  const unlocked = useState<boolean>('home-intro-gate-unlocked', () => false)

  function scheduleUnlockFallback(delay: number) {
    clearUnlockTimer()
    unlockTimer = window.setTimeout(() => {
      unlockTimer = 0
      // The SSR primer is a valid visual fallback. Let the hero intro continue
      // even if the measured live host or its handoff misses the bounded window.
      surfaceReady.value = true
      headerReady.value = true
      contentReady.value = true
      introSettled.value = true
      unlock()
    }, delay)
  }

  function unlock() {
    if (!import.meta.client || unlocked.value) return
    clearUnlockTimer()
    if (unlockRaf) {
      cancelAnimationFrame(unlockRaf)
      unlockRaf = 0
    }
    document.documentElement.classList.remove(LOCK_CLASS)
    unlocked.value = true
  }

  function start(enabled: boolean) {
    if (!import.meta.client || !enabled || started.value) return
    started.value = true
    unlocked.value = false
    document.documentElement.classList.add(LOCK_CLASS)
    scheduleUnlockFallback(MAX_LOCK_MS)
  }

  function markSurfaceReady() {
    if (!import.meta.client || surfaceReady.value) return
    surfaceReady.value = true
    if (!started.value) unlock()
    else {
      // Surface readiness starts the authored 640 ms morph. Give that motion a
      // complete relative deadline instead of letting the original cold-boot
      // timer cut a late mobile start short halfway through its final shape.
      scheduleUnlockFallback(MAX_SETTLE_AFTER_SURFACE_MS)
    }
  }

  function markHeaderReady() {
    headerReady.value = true
  }

  function markContentReady() {
    contentReady.value = true
  }

  function markIntroSettled() {
    if (!import.meta.client || introSettled.value) return
    introSettled.value = true
    headerReady.value = true
    contentReady.value = true
    if (!started.value || unlocked.value) return

    // Remove the visual cover first, then hand scroll back after that frame.
    unlockRaf = requestAnimationFrame(() => {
      unlockRaf = 0
      unlock()
    })
  }

  return {
    started: readonly(started),
    surfaceReady: readonly(surfaceReady),
    headerReady: readonly(headerReady),
    contentReady: readonly(contentReady),
    introSettled: readonly(introSettled),
    unlocked: readonly(unlocked),
    start,
    markSurfaceReady,
    markHeaderReady,
    markContentReady,
    markIntroSettled,
    unlock,
  }
}
