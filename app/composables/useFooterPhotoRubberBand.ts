import type { Ref } from 'vue'
import { isThumbNav } from '~/utils/mobileViewport'
import { WHEEL_DURATION, wheelEasing } from '~/utils/wheelScroll'

export const FOOTER_PHOTO_CANCEL_EVENT = 'kado:footer-photo-cancel'

/** Reveal the photo by resisting scroll beyond the footer, then scroll back. */
export function useFooterPhotoRubberBand(footer: Ref<HTMLElement | null>, photo: Ref<HTMLElement | null>) {
  const nuxtApp = useNuxtApp()
  const IDLE_MS = 300
  const RETURN_MS = 500
  const PULL_SPAN = 5
  const MOBILE_PULL_SCREEN_P = 0.7
  const RESISTANCE_EXPONENT = 2.5
  const RESISTANCE_NORMALIZER = 1 - Math.exp(-RESISTANCE_EXPONENT)
  let mounted = false
  let active = false
  let reducedMotion: MediaQueryList | null = null
  let resizeObserver: ResizeObserver | null = null
  let lockObserver: MutationObserver | null = null
  let touchTarget: HTMLElement | null = null
  let viewportHeight = 0
  let stableViewportHeight = 0
  let viewportWidth = 0
  let restY = 0
  let maxY = 0
  let limit = 1
  let rawPull = 0
  let offset = 0
  let target = 0
  let wheelPull = false
  let wheelFrom = 0
  let wheelElapsed = 0
  let returnFrom = 0
  let returnStartedAt: number | null = null
  let returnProgress = 0
  let returning = false
  let ownsScroll = false
  let lastWrittenY = -1
  let frame = 0
  let lastTime = 0
  let idleTimer = 0
  let touchId: number | null = null
  let touchX = 0
  let touchY = 0
  let touchScroll = 0
  let touchPull = 0
  let touchPullDistance = 1
  let touchDown = false
  let dragging = false
  let nativeTouchGesture = false

  function available() {
    return active && !document.hidden && !reducedMotion?.matches
      && !['page-canvas-lock', 'page-iris-lock'].some(name =>
        document.documentElement.classList.contains(name),
      )
  }

  function measure() {
    const anchor = footer.value?.querySelector<HTMLElement>('[data-contact-photo-boundary]')
    if (!anchor || !photo.value) return
    const stableHeight = footer.value?.querySelector<HTMLElement>('[data-footer-stable-viewport]')?.getBoundingClientRect().height
      || document.documentElement.clientHeight
    const realResize = viewportWidth !== window.innerWidth || stableViewportHeight !== stableHeight
    // svh distinguishes a real layout resize from toolbar animation. Keep the
    // return destination stable while the browser changes only its visible bars.
    if (!isThumbNav() || realResize || (!ownsScroll && touchId === null)) {
      viewportHeight = document.documentElement.clientHeight
    }
    viewportWidth = window.innerWidth
    stableViewportHeight = stableHeight
    restY = Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - viewportHeight)
    maxY = Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight)
    limit = Math.max(1, Math.min(photo.value.getBoundingClientRect().height, maxY - restY))
  }

  function resist(distance: number, pullDistance = limit * PULL_SPAN) {
    const progress = Math.min(1, Math.max(0, distance) / pullDistance)
    return limit * (1 - Math.exp(-RESISTANCE_EXPONENT * progress)) / RESISTANCE_NORMALIZER
  }

  function unresist(distance: number, pullDistance = limit * PULL_SPAN) {
    const progress = Math.max(0, Math.min(1, distance / limit))
    return -pullDistance * Math.log(1 - progress * RESISTANCE_NORMALIZER) / RESISTANCE_EXPONENT
  }

  function write(y: number) {
    const top = Math.max(0, Math.min(maxY, y))
    lastWrittenY = top
    // Reset Lenis's pending inertia as well as the native scroll position.
    nuxtApp.$setScrollPosition(top)
  }

  function stopFrame() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    lastTime = 0
  }

  function reset() {
    stopFrame()
    window.clearTimeout(idleTimer)
    idleTimer = 0
    touchId = null
    nativeTouchGesture = false
    dragging = returning = ownsScroll = false
    rawPull = offset = target = returnFrom = returnProgress = 0
    returnStartedAt = null
    wheelPull = false
    wheelFrom = wheelElapsed = 0
    lastWrittenY = -1
  }

  function tick(time: number) {
    frame = 0
    if (!available()) {
      reset()
      return
    }
    const dt = Math.min(0.032, lastTime ? (time - lastTime) / 1000 : 1 / 60)
    lastTime = time
    if (returning) {
      returnStartedAt ??= time
      returnProgress = Math.min(1, (time - returnStartedAt) / RETURN_MS)
      // A time-based return stays visually consistent when mobile Safari drops
      // a frame; the previous integrated spring visibly fell behind there.
      const p = returnProgress
      const eased = p * p * p * (p * (p * 6 - 15) + 10)
      offset = Math.max(0, returnFrom * (1 - eased))
    } else if (wheelPull) {
      wheelElapsed = Math.min(WHEEL_DURATION, wheelElapsed + dt)
      offset = wheelFrom + (target - wheelFrom) * wheelEasing(wheelElapsed / WHEEL_DURATION)
    } else {
      offset += (target - offset) * (1 - Math.exp(-24 * dt))
    }
    const settled = returning
      ? returnProgress >= 1
      : (wheelPull ? wheelElapsed >= WHEEL_DURATION : Math.abs(target - offset) < 0.25)
    if (settled) offset = returning ? 0 : target
    write(restY + offset)
    if (settled) {
      lastTime = 0
      if (returning) reset()
      return
    }
    frame = requestAnimationFrame(tick)
  }

  function wake() {
    if (!frame) {
      lastTime = 0
      frame = requestAnimationFrame(tick)
    }
  }

  function takeScroll() {
    if (!ownsScroll || returning) {
      offset = window.scrollY - restY
      rawPull = unresist(offset)
      write(window.scrollY)
    }
    ownsScroll = true
    returning = false
    wheelPull = false
  }

  function returnToFooter() {
    idleTimer = 0
    if (!available() || dragging) return
    // Finish the last wheel notch before starting the automatic return.
    if (wheelPull && frame && !returning) {
      idleTimer = window.setTimeout(returnToFooter, 50)
      return
    }
    offset = Math.max(0, window.scrollY - restY)
    if (offset <= 0.25) {
      reset()
      return
    }
    ownsScroll = returning = true
    target = 0
    returnFrom = offset
    returnProgress = 0
    returnStartedAt = null
    write(window.scrollY)
    wake()
  }

  function scheduleReturn() {
    window.clearTimeout(idleTimer)
    idleTimer = 0
    if (touchId !== null || touchDown || returning) return
    if (isThumbNav()) returnToFooter()
    else idleTimer = window.setTimeout(returnToFooter, IDLE_MS)
  }

  function onWheel(event: WheelEvent) {
    if (!available() || event.ctrlKey || !event.cancelable
      || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? document.documentElement.clientHeight : 1
    const delta = event.deltaY * unit
    const y = window.scrollY
    if (delta < 0) {
      // Stop our RAF before the same event reaches Lenis/native scrolling.
      // Upward input never goes through a second smoothing loop in the photo.
      if (ownsScroll || frame) {
        reset()
        write(y)
      } else {
        // Further upward events belong to Lenis. Resetting its position on
        // each event would discard accumulated input and slow the gesture.
        window.clearTimeout(idleTimer)
        idleTimer = 0
      }
      return
    }
    const intendedY = Math.max(y, nuxtApp.$getScrollTarget())
    const wasOwned = ownsScroll
    if (!wasOwned && intendedY + delta < restY) return
    event.preventDefault()
    takeScroll()
    if (!wasOwned) {
      // Lenis may still be approaching the boundary. Preserve that pending
      // distance, but start rendering at the actual position without a jump.
      rawPull = unresist(Math.max(0, intendedY - restY))
    }
    rawPull = Math.min(limit * PULL_SPAN,
      rawPull + Math.max(0, delta - (wasOwned ? 0 : Math.max(0, restY - intendedY))))
    target = resist(rawPull)
    wheelPull = true
    wheelFrom = offset
    wheelElapsed = 0
    wake()
    scheduleReturn()
  }

  function onTouchStart(event: TouchEvent) {
    touchDown = event.touches.length > 0
    if (event.touches.length !== 1) {
      reset()
      return
    }
    if (!available()) return
    measure()
    const touch = event.touches[0]!
    touchId = touch.identifier
    nativeTouchGesture = false
    touchX = touch.clientX
    touchY = touch.clientY
    touchScroll = window.scrollY
    // Never let the resisted region advance faster than the finger at entry.
    // Compact iPhones otherwise amplify the first touch movement because the
    // photo is tall relative to the viewport, making this section feel sharper
    // than the native page scroll around it.
    const oneToOnePullDistance = limit * RESISTANCE_EXPONENT / RESISTANCE_NORMALIZER
    touchPullDistance = Math.max(
      1,
      stableViewportHeight * MOBILE_PULL_SCREEN_P,
      oneToOnePullDistance,
    )
    touchPull = unresist(Math.max(0, touchScroll - restY), touchPullDistance)
    window.clearTimeout(idleTimer)
    stopFrame()
    returning = false
  }

  function onTouchMove(event: TouchEvent) {
    if (touchId === null || nativeTouchGesture || !available()) return
    const touch = Array.from(event.touches).find(touch => touch.identifier === touchId)
    if (!touch || event.touches.length !== 1) {
      reset()
      return
    }
    const dy = touchY - touch.clientY
    const dx = touch.clientX - touchX
    if (!dragging && Math.max(Math.abs(dx), Math.abs(dy)) < 5) return
    if (!dragging && Math.abs(dx) >= Math.abs(dy)) {
      nativeTouchGesture = true
      return
    }
    if (!dragging && dy < 0) {
      // A fresh downward finger gesture releases the automatic return first.
      const identifier = touchId
      reset()
      touchId = identifier
      nativeTouchGesture = true
      return
    }
    // Claim the first vertical move inside the footer, before Safari/Chrome
    // commits the gesture to native scrolling. The rest of the page stays native.
    if (!event.cancelable) {
      nativeTouchGesture = true
      stopFrame()
      ownsScroll = dragging = false
      return
    }
    event.preventDefault()
    takeScroll()
    stopFrame()
    dragging = true
    const distance = touchPull + dy - Math.max(0, restY - touchScroll)
    if (distance <= 0) {
      // Before the boundary (and after reversing past it), follow the finger 1:1.
      offset = target = Math.max(0, touchScroll < restY ? touchScroll + dy : restY + distance) - restY
      rawPull = 0
      write(restY + offset)
      return
    }
    rawPull = distance
    offset = target = resist(rawPull, touchPullDistance)
    write(restY + offset)
  }

  function onOutsideTouchStart(event: TouchEvent) {
    touchDown = event.touches.length > 0
    if (!available() || (footer.value && event.composedPath().includes(footer.value))) return
    // A new gesture above the footer must not compete with the photo's return.
    if (ownsScroll || frame || idleTimer) {
      reset()
    }
  }

  function onTouchEnd(event: TouchEvent) {
    touchDown = event.touches.length > 0
    if (touchId === null || Array.from(event.touches).some(touch => touch.identifier === touchId)) return
    touchId = null
    nativeTouchGesture = false
    dragging = false
    scheduleReturn()
  }

  function onAnyTouchEnd(event: TouchEvent) {
    touchDown = event.touches.length > 0
    if (!touchDown && touchId === null && !returning && available()
      && window.scrollY > restY + 0.25) scheduleReturn()
  }

  function onScroll() {
    if (!available()) return
    const y = window.scrollY
    if (Math.abs(y - lastWrittenY) <= 1) return
    if (y < restY - 1) {
      if (ownsScroll || frame || idleTimer) reset()
      return
    }
    // Keyboard, scrollbar and non-cancelable native touch can enter the photo.
    // Do not fight that input; return once it stops.
    stopFrame()
    ownsScroll = returning = false
    scheduleReturn()
  }

  function syncAvailability() {
    if (!available()) reset()
  }

  function connect() {
    if (!mounted || active) return
    active = true
    measure()
    reducedMotion = reducedMotionMediaQuery()
    reducedMotion.addEventListener('change', syncAvailability)
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(document.documentElement)
    if (footer.value) resizeObserver.observe(footer.value)
    if (photo.value) resizeObserver.observe(photo.value)
    lockObserver = new MutationObserver(syncAvailability)
    lockObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    window.addEventListener('resize', measure, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    window.addEventListener('touchstart', onOutsideTouchStart, { capture: true, passive: true })
    window.addEventListener('touchend', onAnyTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onAnyTouchEnd, { passive: true })
    window.addEventListener(FOOTER_PHOTO_CANCEL_EVENT, reset)
    touchTarget = footer.value
    touchTarget?.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    touchTarget?.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    touchTarget?.addEventListener('touchend', onTouchEnd, { capture: true, passive: true })
    touchTarget?.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true })
    document.addEventListener('visibilitychange', syncAvailability)
  }

  function disconnect() {
    active = false
    touchDown = false
    reset()
    resizeObserver?.disconnect()
    lockObserver?.disconnect()
    reducedMotion?.removeEventListener('change', syncAvailability)
    window.removeEventListener('resize', measure)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('wheel', onWheel, true)
    window.removeEventListener('touchstart', onOutsideTouchStart, true)
    window.removeEventListener('touchend', onAnyTouchEnd)
    window.removeEventListener('touchcancel', onAnyTouchEnd)
    window.removeEventListener(FOOTER_PHOTO_CANCEL_EVENT, reset)
    touchTarget?.removeEventListener('touchstart', onTouchStart, true)
    touchTarget?.removeEventListener('touchmove', onTouchMove, true)
    touchTarget?.removeEventListener('touchend', onTouchEnd, true)
    touchTarget?.removeEventListener('touchcancel', onTouchEnd, true)
    touchTarget = null
    document.removeEventListener('visibilitychange', syncAvailability)
  }

  onMounted(() => {
    mounted = true
    connect()
  })
  onActivated(connect)
  onDeactivated(disconnect)
  onBeforeUnmount(disconnect)
}
