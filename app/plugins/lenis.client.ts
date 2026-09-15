import {
  publishAppliedScrollFrame,
  setAppliedScrollDriverConnected,
} from '~/utils/appliedScrollFrame'

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
const TOUCH_INERTIA_LERP = 0.04
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
 * Smooth stepped wheel input on desktop. On touch-first mobile devices Lenis
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

  function controlledTouchEnabled() {
    if (touchQuery.matches) return true
    return narrowQuery.matches && navigator.maxTouchPoints > 0
  }

  function runtimeEnabled() {
    return wheelQuery.matches || controlledTouchEnabled()
  }

  function normalizeTouchReleaseVelocity(data: {
    event: WheelEvent | TouchEvent
  }) {
    if (!lenis || !controlledTouchEnabled() || !(data.event instanceof TouchEvent)) return

    const event = data.event
    if (event.type === 'touchstart') {
      const touch = event.targetTouches[0]
      touchSampleY = touch?.clientY ?? null
      touchSampleAt = event.timeStamp
      touchVelocityPxPerSec = 0
      return
    }

    if (event.type === 'touchmove') {
      const touch = event.targetTouches[0]
      if (!touch) return
      if (touchSampleY !== null && touchSampleAt > 0) {
        const dt = Math.max(1, event.timeStamp - touchSampleAt)
        const velocity = (touchSampleY - touch.clientY) * 1000 / dt
        touchVelocityPxPerSec = touchVelocityPxPerSec
          ? touchVelocityPxPerSec * (1 - TOUCH_VELOCITY_SAMPLE_BLEND)
            + velocity * TOUCH_VELOCITY_SAMPLE_BLEND
          : velocity
      }
      touchSampleY = touch.clientY
      touchSampleAt = event.timeStamp
      return
    }

    if (event.type !== 'touchend') return

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
      lenis.stop()
      removeTicker()
    } else {
      lenis.start()
    }
  }

  function destroy() {
    createGeneration += 1
    removeTicker()
    setAppliedScrollDriverConnected(false)
    lockObserver?.disconnect()
    lockObserver = null
    lenis?.destroy()
    lenis = null
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

  nuxtApp.hook('app:mounted', () => {
    const activate = () => void create()
    if (runtimeEnabled()) {
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
      destroy()
    })
  }
})
