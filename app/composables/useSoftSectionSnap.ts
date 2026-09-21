/**
 * Soft bidirectional snap between hero ↔ next section.
 *
 * While the user is scrolling — do nothing (no hijack).
 * After 300ms with no scroll activity inside the trigger corridor —
 * finish the trip for them (assist glide).
 */
export function useSoftSectionSnap(options: {
  from: () => HTMLElement | null | undefined
  to: () => HTMLElement | null | undefined
}) {
  const locked = ref(false)

  let animating = false
  let tween: { kill: () => void } | null = null
  let safetyTimer = 0
  let settleTimer = 0
  let gsap: typeof import('gsap').default | null = null
  let touchY = 0
  /** Last user intent — used only after the idle gap */
  let lastDir: 1 | -1 = 1

  const DURATION_SEC = 1
  /** Idle gap before assist */
  const SETTLE_MS = 300
  const SETTLE_PX = 32

  function anchors() {
    const a = options.from()
    const b = options.to()
    if (!a || !b) return null
    const yFrom = a.getBoundingClientRect().top + window.scrollY
    const yTo = b.getBoundingClientRect().top + window.scrollY
    if (!(yTo > yFrom + 80)) return null
    return { yFrom, yTo }
  }

  function readScroll() {
    return window.scrollY || document.documentElement.scrollTop || 0
  }

  function writeScroll(y: number) {
    window.scrollTo(0, y)
    document.documentElement.scrollTop = y
    document.body.scrollTop = y
  }

  function blockEvent(e: Event) {
    if (!animating) return
    e.preventDefault()
  }

  function blockKey(e: KeyboardEvent) {
    if (!animating) return
    const keys = new Set([
      'ArrowDown',
      'ArrowUp',
      'PageDown',
      'PageUp',
      'Home',
      'End',
      ' ',
      'Spacebar',
    ])
    if (keys.has(e.key)) e.preventDefault()
  }

  function addLockListeners() {
    window.addEventListener('wheel', blockEvent, { passive: false, capture: true })
    window.addEventListener('touchmove', blockEvent, { passive: false, capture: true })
    window.addEventListener('keydown', blockKey, { capture: true })
  }

  function removeLockListeners() {
    window.removeEventListener('wheel', blockEvent, true)
    window.removeEventListener('touchmove', blockEvent, true)
    window.removeEventListener('keydown', blockKey, true)
  }

  function unlock() {
    if (safetyTimer) {
      window.clearTimeout(safetyTimer)
      safetyTimer = 0
    }
    document.documentElement.style.scrollBehavior = ''
    animating = false
    locked.value = false
    tween = null
    removeLockListeners()
  }

  /** Anywhere between the two section tops — the whole trigger band. */
  function inTriggerZone(y: number, yFrom: number, yTo: number) {
    return y > yFrom + SETTLE_PX && y < yTo - SETTLE_PX
  }

  function pickTarget(direction: 1 | -1): number | null {
    const pts = anchors()
    if (!pts) return null
    const { yFrom, yTo } = pts
    const y = readScroll()

    if (!inTriggerZone(y, yFrom, yTo)) return null

    return direction > 0 ? yTo : yFrom
  }

  function glideTo(y: number) {
    if (animating || !gsap) return

    const start = readScroll()
    const dist = Math.abs(y - start)
    const reduced = prefersReducedMotion()

    animating = true
    locked.value = true
    addLockListeners()
    document.documentElement.style.scrollBehavior = 'auto'

    safetyTimer = window.setTimeout(unlock, DURATION_SEC * 1000 + 2000)

    if (reduced || dist < 2) {
      writeScroll(y)
      unlock()
      return
    }

    tween?.kill()

    const proxy = { y: start }
    const mid = start + (y - start) * 0.18

    const tl = gsap.timeline({
      onComplete: unlock,
      onInterrupt: unlock,
    })

    tl.to(proxy, {
      y: mid,
      duration: DURATION_SEC * 0.35,
      ease: 'sine.in',
      onUpdate: () => writeScroll(proxy.y),
    })

    tl.to(proxy, {
      y,
      duration: DURATION_SEC * 0.65,
      ease: 'power1.out',
      onUpdate: () => writeScroll(proxy.y),
    })

    tween = tl
  }

  function trySnapAfterSettle() {
    if (animating) return
    const target = pickTarget(lastDir)
    if (target == null) return
    if (Math.abs(readScroll() - target) <= SETTLE_PX) return
    glideTo(target)
  }

  function scheduleSettle() {
    if (animating) return
    if (settleTimer) window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      settleTimer = 0
      trySnapAfterSettle()
    }, SETTLE_MS)
  }

  function onWheel(e: WheelEvent) {
    if (animating) return
    if (e.deltaY === 0) return
    lastDir = e.deltaY > 0 ? 1 : -1
    scheduleSettle()
  }

  function onScroll() {
    if (animating) return
    scheduleSettle()
  }

  function onTouchStart(e: TouchEvent) {
    touchY = e.touches[0]?.clientY ?? 0
  }

  function onTouchMove(e: TouchEvent) {
    if (animating) return
    const y = e.touches[0]?.clientY ?? touchY
    const dy = touchY - y
    if (Math.abs(dy) < 8) return
    lastDir = dy > 0 ? 1 : -1
    touchY = y
    scheduleSettle()
  }

  function onTouchEnd() {
    if (animating) return
    scheduleSettle()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (animating) {
      blockKey(e)
      return
    }
    const down =
      e.key === 'ArrowDown' ||
      e.key === 'PageDown' ||
      e.key === ' ' ||
      e.key === 'Spacebar'
    const up = e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home'
    if (down) {
      lastDir = 1
      scheduleSettle()
    } else if (up) {
      lastDir = -1
      scheduleSettle()
    }
  }

  onMounted(async () => {
    const mod = await import('gsap')
    gsap = mod.default

    window.addEventListener('wheel', onWheel, { passive: true, capture: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true, capture: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true, capture: true })
    window.addEventListener('keydown', onKeyDown, { capture: true })
  })

  onUnmounted(() => {
    if (settleTimer) window.clearTimeout(settleTimer)
    tween?.kill()
    unlock()
    window.removeEventListener('wheel', onWheel, true)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('touchstart', onTouchStart, true)
    window.removeEventListener('touchmove', onTouchMove, true)
    window.removeEventListener('touchend', onTouchEnd, true)
    window.removeEventListener('keydown', onKeyDown, true)
  })

  return { locked }
}
