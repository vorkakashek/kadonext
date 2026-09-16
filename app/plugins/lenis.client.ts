import {
  publishAppliedScrollFrame,
  setAppliedScrollDriverConnected,
} from '~/utils/appliedScrollFrame'
import { createTouchScrollOwnership } from '~/utils/touchScrollOwnership'
import { homeSectionScrollTop } from '~/utils/homeSectionScroll'
import {
  CASE_RAIL_TOUCH_EVENT,
  createCaseRailTouchAxis,
  type CaseRailTouchFrame,
} from '~/utils/caseRailTouch'

const SMOOTH_WHEEL_ENABLED =
  '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)'

const CONTROLLED_TOUCH_ENABLED =
  '(prefers-reduced-motion: no-preference) and (pointer: coarse)'

const NARROW_TOUCH_ENABLED =
  '(prefers-reduced-motion: no-preference) and (max-width: 767.98px)'

// Lenis completes `lerp` scrolling by rounding to the final pixel. Staying too
// far below its normal follow factor leaves a visible stepped tail before that
// final frame, especially with notched mouse wheels.
const WHEEL_LERP = 0.1

/**
 * Touch stays 1:1 while the finger is down. Only the release inertia is eased,
 * with its initial rendered velocity capped in viewport-heights per second.
 */
const TOUCH_INERTIA_LERP = 0.075
const TOUCH_INERTIA_EXPONENT = 1.7
const TOUCH_MAX_VELOCITY_VH_PER_SEC = 4.2
const TOUCH_VELOCITY_SAMPLE_BLEND = 0.72
const TOUCH_RELEASE_STALE_MS = 110

const SCROLL_LOCKS = [
  'preload-lock',
  'page-canvas-lock',
  'page-iris-lock',
] as const

/**
 * iOS keeps native scrolling and release inertia, including iPadOS desktop mode.
 * Smooth stepped wheel input on desktop. On other touch-first devices Lenis
 * owns the gesture: direct dragging remains 1:1, while release inertia is
 * bounded so one flick cannot cross the whole home-page story.
 *
 * Lenis shares GSAP's ticker with ScrollTrigger and joins it only while a
 * smooth scroll is active. That keeps idle pages from running another
 * permanent animation loop.
 */
export default defineNuxtPlugin((nuxtApp) => {
  let lenis: import('lenis').default | null = null
  let gsap: typeof import('gsap').default | null = null
  let ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
  let lockObserver: MutationObserver | null = null
  let tickerAttached = false
  let createGeneration = 0
  let idleId: number | null = null
  let touchSampleY: number | null = null
  let touchSampleAt = 0
  let touchVelocityPxPerSec = 0
  let runtimePromise: Promise<[
    typeof import('lenis'),
    typeof import('gsap'),
    typeof import('gsap/ScrollTrigger'),
  ]> | null = null

  const wheelQuery = window.matchMedia(SMOOTH_WHEEL_ENABLED)
  const touchQuery = window.matchMedia(CONTROLLED_TOUCH_ENABLED)
  const narrowQuery = window.matchMedia(NARROW_TOUCH_ENABLED)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  let ownsTouchScroll = createTouchScrollOwnership()
  let nativeTouchActive = false
  let cancelSectionScroll: (() => void) | null = null
  let touchRail: HTMLElement | null = null
  const railTouchAxis = createCaseRailTouchAxis()

  function publishRailTouch(type: string, deltaX: number, timeStamp: number) {
    touchRail?.dispatchEvent(new CustomEvent<CaseRailTouchFrame>(CASE_RAIL_TOUCH_EVENT, {
      detail: { type, deltaX, timeStamp },
    }))
  }

  function cancelRailTouch() {
    publishRailTouch('touchcancel', 0, performance.now())
    touchRail = null
    railTouchAxis('touchcancel', 0, 0)
  }

  function onTouchCancel() {
    cancelRailTouch()
    ownsTouchScroll = createTouchScrollOwnership()
    nativeTouchActive = false
    touchSampleY = null
    touchSampleAt = 0
    touchVelocityPxPerSec = 0
    if (lenis && !lenis.isStopped && !lenis.isLocked) {
      lenis.stop()
      lenis.start()
      removeTicker()
    }
  }

  function controlledTouchEnabled() {
    if (isIOS) return false
    if (touchQuery.matches) return true
    return narrowQuery.matches && navigator.maxTouchPoints > 0
  }

  function runtimeEnabled() {
    return !isIOS && (wheelQuery.matches || controlledTouchEnabled())
  }

  function normalizeTouchReleaseVelocity(data: {
    event: WheelEvent | TouchEvent
    deltaX: number
    deltaY: number
  }) {
    if (!lenis || !controlledTouchEnabled() || !(data.event instanceof TouchEvent)) return true

    const event = data.event
    if (event.type === 'touchstart' && event.touches.length === 1) {
      touchRail = (event.composedPath().find(node =>
        node instanceof HTMLElement && node.hasAttribute('data-lenis-horizontal-rail'),
      ) as HTMLElement | undefined) ?? null
    }
    // Match Lenis's explicit nested-scroll escape hatches. A horizontal rail
    // can keep native horizontal scrolling without leaking a diagonal gesture
    // back into Lenis halfway through the same touch sequence.
    const horizontal = Math.abs(data.deltaX) >= Math.abs(data.deltaY)
    const selection = event.type === 'touchstart' ? window.getSelection() : null
    // Leave form gestures native from touchstart through release. Cancelling
    // their touchmove can let the browser focus a field after a scroll gesture.
    // Labels need the same treatment because their default tap focuses a control.
    const nativeFormGesture = event.type === 'touchstart' && event.composedPath().some(node =>
      node instanceof HTMLElement && (
        node.matches('input, textarea, select')
        || node.isContentEditable
        || (node instanceof HTMLLabelElement && node.control !== null)
      ),
    )
    const bypass = nativeFormGesture || Boolean(selection && !selection.isCollapsed)
      || event.composedPath().some(node =>
      node instanceof HTMLElement && (
        node.hasAttribute('data-lenis-prevent')
        || node.hasAttribute('data-lenis-prevent-touch')
        || (event.type === 'touchmove' && node.hasAttribute(horizontal
          ? 'data-lenis-prevent-horizontal'
          : 'data-lenis-prevent-vertical'))
      ),
    )
    if (!lenis.isStopped && !lenis.isLocked && !ownsTouchScroll(event, bypass)) {
      publishRailTouch('touchcancel', 0, event.timeStamp)
      touchRail = null
      // Once scrolling is non-cancelable, JS must stop writing against the
      // browser. Keep this entire gesture native, including its release.
      if (!nativeTouchActive) {
        lenis.stop()
        lenis.start()
        removeTicker()
      }
      nativeTouchActive = true
      touchSampleY = null
      touchSampleAt = 0
      touchVelocityPxPerSec = 0
      return false
    }
    nativeTouchActive = false
    const railGesture = touchRail !== null
    if (railGesture) {
      const delta = railTouchAxis(event.type, data.deltaX, data.deltaY)
      data.deltaX = delta.deltaX
      data.deltaY = delta.deltaY
    }
    // Only the axis chosen by the first move receives deltas for this gesture:
    // horizontal goes to the rail, vertical goes to Lenis.
    if (!lenis.isStopped && !lenis.isLocked) {
      publishRailTouch(event.type, data.deltaX, event.timeStamp)
    } else {
      publishRailTouch('touchcancel', 0, event.timeStamp)
      touchRail = null
    }
    if (event.type === 'touchend' || event.type === 'touchcancel') touchRail = null
    if (event.type === 'touchstart') {
      const touch = event.targetTouches[0]
      touchSampleY = touch?.clientY ?? null
      touchSampleAt = event.timeStamp
      touchVelocityPxPerSec = 0
      return true
    }

    if (event.type === 'touchmove') {
      const touch = event.targetTouches[0]
      if (!touch) return true
      if (touchSampleY !== null && touchSampleAt > 0) {
        const dt = Math.max(1, event.timeStamp - touchSampleAt)
        const velocity = (railGesture ? data.deltaY : touchSampleY - touch.clientY) * 1000 / dt
        if (railGesture && data.deltaY === 0) {
          touchVelocityPxPerSec = 0
        } else {
          touchVelocityPxPerSec = touchVelocityPxPerSec
            ? touchVelocityPxPerSec * (1 - TOUCH_VELOCITY_SAMPLE_BLEND)
              + velocity * TOUCH_VELOCITY_SAMPLE_BLEND
            : velocity
        }
      }
      touchSampleY = touch.clientY
      touchSampleAt = event.timeStamp
      return true
    }

    if (event.type !== 'touchend') return true

    // Lenis normally derives release inertia from its last rendered frame.
    // Normalise the sampled finger velocity by elapsed time so a short flick has
    // the same release speed in light and WebGL-heavy sections.
    const viewportHeight = Math.max(
      1,
      window.visualViewport?.height ?? window.innerHeight,
    )
    const maxRenderedVelocity = viewportHeight * TOUCH_MAX_VELOCITY_VH_PER_SEC
    const releaseAge = Math.max(0, event.timeStamp - touchSampleAt)
    const freshness = Math.exp(-releaseAge / TOUCH_RELEASE_STALE_MS)
    const measuredVelocity = touchVelocityPxPerSec * freshness
    const renderedVelocity = Math.max(
      -maxRenderedVelocity,
      Math.min(maxRenderedVelocity, measuredVelocity),
    )
    const inertiaDistance = Math.abs(renderedVelocity)
      / (TOUCH_INERTIA_LERP * 60)
    const sourceVelocity = inertiaDistance
      ** (1 / TOUCH_INERTIA_EXPONENT)
    lenis.velocity = Math.sign(renderedVelocity) * sourceVelocity
    touchSampleY = null
    touchSampleAt = 0
    touchVelocityPxPerSec = 0
    return true
  }

  function removeTicker() {
    if (!tickerAttached) return
    tickerAttached = false
    gsap?.ticker.remove(update)
  }

  function update(time: number) {
    if (!lenis) return
    lenis.raf(time * 1000)
    // Keep one shared RAF alive throughout an active touch. Direct touch frames
    // complete immediately (`lerp: 1`), so checking only `isScrolling` would
    // detach and reattach GSAP's ticker on every touchmove.
    if (lenis.isScrolling === false && !lenis.isTouching) removeTicker()
  }

  function requestTicker() {
    if (!lenis || !gsap || lenis.isStopped || tickerAttached || document.hidden) return

    // Lenis advances from the time passed to `raf()`. When the idle ticker has
    // been detached, its previous timestamp may be seconds old; without this
    // reset the first wheel notch is advanced as one huge frame and jumps.
    lenis.time = gsap.ticker.time * 1000
    tickerAttached = true
    // Measure/apply scroll before GSAP's animation callbacks for this frame.
    gsap.ticker.add(update, false, true)
  }

  function pageIsLocked() {
    return SCROLL_LOCKS.some((className) =>
      document.documentElement.classList.contains(className),
    )
  }

  function syncRunState() {
    if (!lenis) return
    if (document.hidden || pageIsLocked()) {
      cancelRailTouch()
      lenis.stop()
      removeTicker()
    } else {
      lenis.start()
    }
  }

  function destroy() {
    cancelSectionScroll?.()
    cancelRailTouch()
    createGeneration += 1
    removeTicker()
    setAppliedScrollDriverConnected(false)
    lockObserver?.disconnect()
    lockObserver = null
    lenis?.destroy()
    lenis = null
    ownsTouchScroll = createTouchScrollOwnership()
    nativeTouchActive = false
  }

  function loadRuntime() {
    runtimePromise ??= Promise.all([
      import('lenis'),
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ])
    return runtimePromise
  }

  async function create() {
    if (lenis || !runtimeEnabled()) return
    const generation = ++createGeneration
    const [lenisModule, gsapModule, scrollTriggerModule] = await loadRuntime()
    if (generation !== createGeneration || !runtimeEnabled() || lenis) return

    const Lenis = lenisModule.default
    const controlledTouch = controlledTouchEnabled()
    gsap = gsapModule.default
    ScrollTrigger = scrollTriggerModule.ScrollTrigger
    gsap.registerPlugin(ScrollTrigger)
    gsap.ticker.fps(0)
    gsap.ticker.lagSmoothing(0)
    gsap.config({ force3D: true, nullTargetWarn: false })
    ScrollTrigger.config({ ignoreMobileResize: true })
    lenis = new Lenis({
      autoRaf: false,
      smoothWheel: wheelQuery.matches,
      syncTouch: controlledTouch,
      syncTouchLerp: TOUCH_INERTIA_LERP,
      touchInertiaExponent: TOUCH_INERTIA_EXPONENT,
      virtualScroll: normalizeTouchReleaseVelocity,
      // Keep individual wheel notches blended, but let the final pixels settle
      // promptly instead of exposing a long, stepped inertial tail.
      lerp: WHEEL_LERP,
      wheelMultiplier: 1,
      stopInertiaOnNavigate: true,
      respectReducedMotion: true,
    })

    lenis.on('virtual-scroll', ({ event }) => {
      if (
        event.type.includes('wheel')
        || (controlledTouch && event.type.includes('touch'))
      ) {
        requestTicker()
      }
    })
    lenis.on('scroll', ({ scroll }) => {
      ScrollTrigger?.update()
      // Publish the exact position Lenis has just committed. Motion consumers
      // paint from this one frame instead of racing native scroll + ST callbacks.
      publishAppliedScrollFrame(scroll, 'lenis')
    })
    setAppliedScrollDriverConnected(true)
    // Reconcile a gesture that may have moved the native document while the
    // lazy Lenis runtime was being created.
    publishAppliedScrollFrame(lenis.scroll, 'lenis')

    lockObserver = new MutationObserver(syncRunState)
    lockObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    syncRunState()
  }

  function syncInputMode() {
    destroy()
    if (runtimeEnabled()) void create()
  }

  function scrollToSection(target: HTMLElement, immediate = false) {
    cancelSectionScroll?.()
    if (immediate) {
      // Startup positioning is one write, without a delayed scrollend repair.
      const top = homeSectionScrollTop(target)
      if (lenis) {
        lenis.resize()
        lenis.scrollTo(top, { immediate: true, force: true })
      } else {
        window.scrollTo({ top, left: 0, behavior: 'instant' })
      }
      return
    }
    const reducedMotion = immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let settleTimer = 0
    let active = true
    const cancel = () => {
      active = false
      window.clearTimeout(settleTimer)
      window.removeEventListener('scroll', onNativeScroll)
      window.removeEventListener('scrollend', finish)
      window.removeEventListener('pointerdown', cancel, true)
      window.removeEventListener('wheel', cancel, true)
      window.removeEventListener('keydown', cancel, true)
      if (cancelSectionScroll === cancel) cancelSectionScroll = null
    }
    const finish = () => {
      if (!active) return
      cancel()
      if (!target.isConnected || pageIsLocked()) return
      // Browser chrome can resize during the trip; reconcile once at rest.
      const top = homeSectionScrollTop(target)
      if (Math.abs(window.scrollY - top) <= 1) return
      if (lenis) lenis.scrollTo(top, { immediate: true })
      else window.scrollTo({ top, left: 0, behavior: 'instant' })
    }
    const onNativeScroll = () => {
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(finish, 150)
    }
    cancelSectionScroll = cancel
    window.addEventListener('pointerdown', cancel, { capture: true, passive: true })
    window.addEventListener('wheel', cancel, { capture: true, passive: true })
    window.addEventListener('keydown', cancel, { capture: true })
    const top = homeSectionScrollTop(target)
    if (lenis) {
      // Replace wheel/release inertia and explicitly wake the otherwise idle RAF.
      lenis.resize()
      lenis.scrollTo(top, { duration: 3, immediate: reducedMotion, force: immediate, onComplete: finish })
      requestTicker()
    } else {
      window.addEventListener('scroll', onNativeScroll, { passive: true })
      window.addEventListener('scrollend', finish, { once: true })
      window.scrollTo({
        top,
        left: 0,
        behavior: reducedMotion ? 'instant' : 'smooth',
      })
      onNativeScroll()
    }
  }

  nuxtApp.hook('app:mounted', () => {
    const activate = () => void create()
    if (controlledTouchEnabled()) {
      // Attach before normal mobile interaction instead of creating Lenis
      // halfway through a slow first gesture after the idle timeout.
      void create()
    } else if (runtimeEnabled()) {
      // Fetch and evaluate the small smooth-scroll runtime immediately after
      // the first paint. If the user wheels before the idle constructor runs,
      // that gesture no longer pays for three cold dynamic imports.
      requestAnimationFrame(() => void loadRuntime())
      // Hydration and the first visual response keep priority. A short timeout
      // still makes wheel smoothing ready before normal desktop interaction.
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(activate, { timeout: 1200 })
      } else {
        window.setTimeout(activate, 350)
      }
      window.addEventListener('wheel', activate, { once: true, passive: true })
      window.addEventListener('touchstart', activate, { once: true, passive: true })
    }
    wheelQuery.addEventListener('change', syncInputMode)
    touchQuery.addEventListener('change', syncInputMode)
    narrowQuery.addEventListener('change', syncInputMode)
    document.addEventListener('visibilitychange', syncRunState)
    window.addEventListener('touchcancel', onTouchCancel, { passive: true })
  })

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      wheelQuery.removeEventListener('change', syncInputMode)
      touchQuery.removeEventListener('change', syncInputMode)
      narrowQuery.removeEventListener('change', syncInputMode)
      document.removeEventListener('visibilitychange', syncRunState)
      window.removeEventListener('touchcancel', onTouchCancel)
      destroy()
    })
  }

  return { provide: { scrollToSection } }
})
