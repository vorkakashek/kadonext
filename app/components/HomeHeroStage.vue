<script setup lang="ts">
/**
 * Hero visuals — inside the Flow Surface clipped window.
 * No own clip-path: parent clip cuts stone + 3D + slogan together.
 * Stage is rest-sized and offset so frame morph clips over it (no layout squash).
 */
import { flowSurfaceMask, useFlowSurfaceMask } from '~/composables/useFlowSurfaceMask'
import { useInitialReveal } from '~/composables/useInitialReveal'
import { preloadHomeSceneAssets, preloadThreeBundle } from '~/utils/preloadHomeMotion'
import { isCoarsePointer, isMobileChromeHeightOnlyResize, isNarrowViewport } from '~/utils/mobileViewport'
import {
  subscribeAppliedScrollFrame,
  type AppliedScrollFrame,
} from '~/utils/appliedScrollFrame'

const { locale, tm } = useI18n()
const sloganLines = computed(() => {
  locale.value
  return tm('home.hero.sloganLines') as string[]
})

// Clear the word mask's descender padding before the first reveal frame.
// 115% leaves the tall top of the Cyrillic «ф» barely visible on desktop.
const HERO_TITLE_ENTER_Y_PERCENT = 125

/** Keep WebGL alive until morph opacity is nearly gone (both platforms). */
const SCENE_LIVE_OPACITY = 0.08
/** Desktop forward 3D fade — keyed to min(h,v) arrive progress. */
const SCENE_FADE_START = 0.3
const SCENE_FADE_END = 0.7
/** Reverse reveal follows the real width instead of the earlier vertical clock. */
const SCENE_RETURN_HORIZONTAL_START = 0.72
const SCENE_RETURN_HORIZONTAL_END = 0.08
/** Mobile Hero visuals switch at one spatial threshold instead of scrub-fading. */
const MOBILE_HERO_VISIBILITY_STONE_P = 0.525
const MOBILE_HERO_VISIBILITY_HYSTERESIS_P = 0.015
const MOBILE_HERO_VISIBILITY_FALLBACK_MORPH = 0.96
const MOBILE_HERO_FADE_MS = 1100
/**
 * Swarm/media bleed past the stage box (px).
 * Desktop: cover stacked roam+hover outward (~2× dent + bow).
 * Mobile: tight — shade fewer off-clip pixels (clip still hides the edge).
 */
const SCENE_BLEED_Y = 168
const SCENE_BLEED_X = 168
const SCENE_BLEED_Y_LITE = 56
const SCENE_BLEED_X_LITE = 56
/** Desktop: start at 60% of the scene height, then travel to its upper fifth. */
const SLOGAN_START_TOP_DESKTOP = 0.6
const SLOGAN_END_TOP_DESKTOP = 0.2
const SLOGAN_FADE_IN_END_DESKTOP = 0.22
/** Mobile slogan appears at one route threshold instead of a scrubbed range. */
const SLOGAN_REVEAL_AT_MOBILE = 0.075
/** Desktop: fade the slogan through 64–82% of the scroll route. */
const SLOGAN_FADE_OUT_START_DESKTOP = 0.64
const SLOGAN_FADE_OUT_END_DESKTOP = 0.82

const props = defineProps<{
  /** Hero-rest viewport origin — stage counters frame morph so copy doesn't slide. */
  restTop: number
  restLeft: number
  stageWidth: number
  stageHeight: number
  sectionEl?: HTMLElement | null
  toEl?: HTMLElement | null
  routeEndEl?: HTMLElement | null
}>()

const emit = defineEmits<{
  sceneEntryChange: [active: boolean]
}>()

const mask = useFlowSurfaceMask()
const initialReveal = useInitialReveal()
const heroIntroSettled = useState('home-hero-intro-settled', () => false)
const focusEl = ref<HTMLElement | null>(null)
const sceneEntryEl = ref<HTMLElement | null>(null)
const mediaEl = ref<HTMLElement | null>(null)
const swarmCoverEl = ref<HTMLElement | null>(null)
const copyEl = ref<HTMLElement | null>(null)
const sloganEl = ref<HTMLElement | null>(null)
const sloganY = ref(0)
/** Cold entry: the complete green scene rises before the Surface crop is restored. */
const sceneEntryArmed = ref(false)
const sceneEntryRunning = ref(false)
let sceneEntryTween: {
  kill: () => void
  progress: (value: number) => unknown
} | null = null
const titleEl = computed(() =>
  props.sectionEl?.querySelector<HTMLElement>('[data-hero-title-block]') ?? null,
)
/** Group chars by their rendered title rows so every row can reveal in parallel. */
function titleCharGroups(mobileLayout: boolean): HTMLElement[][] {
  const root = titleEl.value
  if (!root) return []

  const containers = Array.from(root.querySelectorAll<HTMLElement>(
    mobileLayout ? '[data-hero-title-mobile-row]' : '[data-hero-title-line]',
  ))
  if (!mobileLayout) {
    return containers.map(container => (
      Array.from(container.querySelectorAll<HTMLElement>('.home-hero__title-char'))
    ))
  }

  const rows = new Map<number, HTMLElement[]>()
  containers.forEach((container) => {
    const row = Number(container.dataset.heroTitleMobileRow)
    const chars = Array.from(
      container.querySelectorAll<HTMLElement>('.home-hero__title-char'),
    )
    rows.set(row, [...(rows.get(row) ?? []), ...chars])
  })
  return Array.from(rows.entries())
    .sort(([a], [b]) => a - b)
    .map(([, chars]) => chars)
}
const descEls = computed(() =>
  props.sectionEl
    ? Array.from(props.sectionEl.querySelectorAll<HTMLElement>('[data-hero-description-line]'))
    : [],
)
const introPending = useState<boolean>('home-hero-intro-pending', () => true)

const mobileLite = ref(false)
/** Cursor knocks on the swarm — desktop width only (≥1200). */
const swarmInteractive = ref(false)
function syncSwarmInteractive() {
  if (typeof window === 'undefined') return
  swarmInteractive.value = window.innerWidth >= 1200
}
if (import.meta.client) {
  mobileLite.value = isNarrowViewport() || isCoarsePointer()
  syncSwarmInteractive()
}

const sceneBleedX = computed(() =>
  mobileLite.value ? SCENE_BLEED_X_LITE : SCENE_BLEED_X,
)
const sceneBleedY = computed(() =>
  mobileLite.value ? SCENE_BLEED_Y_LITE : SCENE_BLEED_Y,
)

const sceneLive = ref(true)
/** WebGL rAF — deferred on mobile until iris veil is done (revealT≈1). */
const swarmLoopReady = ref(false)
const {
  open: pageCanvasOpen,
  busy: pageCanvasBusy,
  skipHeroIntro,
  heroSwarmReady,
  surfaceOn,
  irisLive,
  pageIrisLive,
  pageIrisHomeReveal,
  navHopActive,
  heroGlPrewarm,
  heroGlRevealBusy,
  resolveHeroGlPrewarm,
} = usePageCanvas()
/** Keep the last GL frame visible while the menu covers the page. */
const swarmVisible = computed(
  () =>
    sceneLive.value &&
    initialReveal.revealed.value &&
    swarmLoopReady.value,
)
/**
 * Android 90Hz: no preserveDrawingBuffer — stone cover hides empty GL through
 * iris holes and for a few frames after until WebGL presents under the lid.
 */
const glCoverHold = ref(false)
/** Menu hop — keep GL rendering under the lid from prewarm through iris out. */
const glCoverHopSession = ref(false)

/**
 * Protect the WebGL buffer only while an iris is revealing Home. While leaving
 * Home the live scene stays visible inside the growing iris instead of being
 * replaced by the stone lid on pointer-down.
 */
const glCoverNeed = computed(() => {
  if (!sceneLive.value) return false
  return pageIrisHomeReveal.value
})

const glCoverLocked = computed(() => glCoverNeed.value || glCoverHold.value)

/**
 * Loop under the opaque menu; pause only while a cover is shown (iris / hold).
 * During glCoverHold the lid stays up but we render underneath before lifting.
 */
const swarmActive = computed(
  () => swarmVisible.value && (!glCoverLocked.value || glCoverHold.value),
)

function waitGlFrames(n: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(left - 1))
    }
    requestAnimationFrame(() => step(n - 1))
  })
}

function cancelGlCoverHold() {
  glCoverHold.value = false
}

function finishHeroRevealQuiet() {
  glCoverHold.value = false
  glCoverHopSession.value = false
}

watch(glCoverNeed, (need, wasNeed) => {
  if (need) {
    if (!glCoverHopSession.value && !pageIrisLive.value) cancelGlCoverHold()
    return
  }
  if (!wasNeed || !sceneLive.value) return
  // Never drop hold between need→handoff — one blank frame flashes the GL buffer.
  glCoverHold.value = true
  const hop = glCoverHopSession.value || navHopActive.value
  const frames = hop
    ? (mobileLite.value ? 12 : 8)
    : (mobileLite.value ? 6 : 4)
  void waitGlFrames(frames).then(() => {
    finishHeroRevealQuiet()
  })
})

/** Home below the fold — no GL iris guard; release menu gate immediately. */
watch(
  () =>
    heroGlRevealBusy.value
    && !surfaceOn.value
    && !pageCanvasOpen.value
    && !irisLive.value
    && !pageIrisLive.value,
  (settle) => {
    if (!settle || glCoverNeed.value || sceneLive.value) return
    finishHeroRevealQuiet()
  },
)

async function runHeroGlPrewarm() {
  if (!sceneLive.value) {
    resolveHeroGlPrewarm()
    return
  }
  glCoverHopSession.value = true
  glCoverHold.value = true
  await waitGlFrames(mobileLite.value ? 8 : 4)
  resolveHeroGlPrewarm()
  // Hold stays up through the iris reveal — cleared in glCoverNeed watch.
}

watch(heroGlPrewarm, () => {
  void runHeroGlPrewarm()
})
/** Slogan opacity — never unmount; start transparent before scroll paints it. */
const copyOpacity = ref(0)
/** 3D / media opacity — separate corridor on mobile. */
const sceneOpacity = ref(1)
let mobileHeroVisualsVisible = true
let ctx: { revert: () => void } | null = null
let gsapRef: typeof import('gsap').default | null = null
let stRef: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let sceneReleaseTimer = 0
/** Locked vh for slogan parallax — ignore mobile chrome show/hide (innerHeight jumps). */
let copyParallaxVh = 0
let copyParallaxWidth = 0
let copyParallaxSectionTop: number | null = null
let removeAppliedScrollFrame: (() => void) | null = null

function setFrozen(on: boolean) {
  flowSurfaceMask.freezeSilhouette = on
}

function copyParallaxBaseVh() {
  if (typeof window === 'undefined') return 1
  const w = window.innerWidth
  const h = Math.max(1, window.innerHeight)
  if (!copyParallaxVh || w !== copyParallaxWidth) {
    copyParallaxVh = h
    copyParallaxWidth = w
  }
  return copyParallaxVh
}

function onCopyParallaxResize() {
  // Width / orientation change: re-lock. Chrome toolbar only: keep the same vh.
  const widthChanged = copyParallaxWidth !== 0 && window.innerWidth !== copyParallaxWidth
  const heightOnly = isMobileChromeHeightOnlyResize()
  if (widthChanged || !heightOnly) {
    copyParallaxVh = 0
    copyParallaxWidth = 0
    copyParallaxSectionTop = null
  }
  syncSwarmInteractive()
  updateSloganMotion()
}

function opacityInRange(m: number, start: number, end: number) {
  if (m <= start) return 1
  if (m >= end) return 0
  return 1 - (m - start) / (end - start)
}

function sceneOpacityForMorph(m: number) {
  if (mobileLite.value) {
    return m < MOBILE_HERO_VISIBILITY_FALLBACK_MORPH ? 1 : 0
  }
  return opacityInRange(m, SCENE_FADE_START, SCENE_FADE_END)
}

function desktopReturnSceneOpacity(horizontalMorph: number) {
  const progress = Math.min(1, Math.max(
    0,
    (SCENE_RETURN_HORIZONTAL_START - horizontalMorph)
      / (SCENE_RETURN_HORIZONTAL_START - SCENE_RETURN_HORIZONTAL_END),
  ))
  return progress * progress * (3 - 2 * progress)
}

function desktopSceneOpacity() {
  const forwardOpacity = sceneOpacityForMorph(mask.morph)
  if (!mask.heroReturning) return forwardOpacity
  return Math.min(
    forwardOpacity,
    desktopReturnSceneOpacity(mask.heroHorizontalMorph),
  )
}

/**
 * Spatial mobile exit: both measurements are viewport-relative, so browser
 * chrome changes and the exact Hero→Kado scroll span do not shift the fade.
 */
function mobileHeroExitOpacity() {
  const stone = props.routeEndEl ?? props.toEl
  if (!stone) return sceneOpacityForMorph(mask.morph)
  const stoneBox = stone.getBoundingClientRect()
  if (stoneBox.height <= 1) return sceneOpacityForMorph(mask.morph)

  const surfaceBottom = mask.top + mask.height
  const progress = (surfaceBottom - stoneBox.top) / stoneBox.height
  const threshold = MOBILE_HERO_VISIBILITY_STONE_P
    + (mobileHeroVisualsVisible
      ? MOBILE_HERO_VISIBILITY_HYSTERESIS_P
      : -MOBILE_HERO_VISIBILITY_HYSTERESIS_P)
  mobileHeroVisualsVisible = progress < threshold
  return mobileHeroVisualsVisible ? 1 : 0
}

function paintSceneVisibility(opacity: number, keepLive = false) {
  if (sceneReleaseTimer) {
    window.clearTimeout(sceneReleaseTimer)
    sceneReleaseTimer = 0
  }

  if (!mobileLite.value) {
    sceneOpacity.value = opacity
    sceneLive.value = keepLive || opacity > SCENE_LIVE_OPACITY
    return
  }

  // On reveal, wake WebGL before the opacity transition starts. On exit, keep
  // it alive through the complete fade so the canvas cannot disappear early.
  if (opacity > SCENE_LIVE_OPACITY) sceneLive.value = true
  sceneOpacity.value = opacity
  if (opacity <= SCENE_LIVE_OPACITY) {
    sceneReleaseTimer = window.setTimeout(() => {
      sceneReleaseTimer = 0
      if (sceneOpacity.value <= SCENE_LIVE_OPACITY) sceneLive.value = false
    }, MOBILE_HERO_FADE_MS + 40)
  }
}

/**
 * Both routes start at the Hero section and end at the platform's actual second-
 * block arrival marker. This keeps the rise slow and continuous through the
 * complete scroll corridor instead of compressing it into the Surface morph.
 */
function updateSloganMotion(scrollY?: number) {
  if (typeof window === 'undefined' || pageCanvasOpen.value) return
  const currentScrollY = scrollY ?? window.scrollY
  const vh = copyParallaxBaseVh()
  const startY = props.stageHeight * (SLOGAN_START_TOP_DESKTOP - 0.5)
  const endY = props.stageHeight * (SLOGAN_END_TOP_DESKTOP - 0.5)
  if (copyParallaxSectionTop === null && props.sectionEl) {
    copyParallaxSectionTop = props.sectionEl.getBoundingClientRect().top + currentScrollY
  }
  const routeStart = copyParallaxSectionTop ?? 0
  const scrolled = Math.max(0, currentScrollY - routeStart)
  let routeEnd: number
  if (mobileLite.value) {
    const destination = props.routeEndEl ?? props.toEl
    const destinationTop = destination
      ? destination.getBoundingClientRect().top + currentScrollY
      : null
    // Matches the mobile Hero → stone arrival: the rock reaches 10% viewport Y.
    routeEnd = destinationTop !== null
      ? destinationTop - vh * 0.1
      : routeStart + (props.sectionEl?.offsetHeight ?? vh)
  } else {
    const destinationSection = props.toEl
      ? (props.toEl.closest('section') as HTMLElement | null) ?? props.toEl
      : null
    const destinationTop = destinationSection
      ? destinationSection.getBoundingClientRect().top + currentScrollY
      : null
    routeEnd = destinationSection && destinationTop !== null
      ? destinationTop + destinationSection.offsetHeight * 0.5 - vh * 0.5
      : routeStart + (props.sectionEl?.offsetHeight ?? vh)
  }
  const routeProgress = Math.min(1, scrolled / Math.max(1, routeEnd - routeStart))
  // A cold hash entry can arrive below Hero before the Surface engine has
  // painted its first morph. Keep scene visibility tied to the real route too.
  const pastHeroRoute = currentScrollY >= routeEnd + (mobileLite.value ? vh : 0)
  const reversePrewarm = !mobileLite.value
    && mask.heroReturning
    && !pastHeroRoute
  const sceneOp = pastHeroRoute
    ? 0
    : mobileLite.value
      ? mobileHeroExitOpacity()
      : desktopSceneOpacity()
  if (
    sceneOpacity.value !== sceneOp
    || (reversePrewarm && !sceneLive.value)
  ) paintSceneVisibility(sceneOp, reversePrewarm)
  const revealOpacity = mobileLite.value
    ? (routeProgress >= SLOGAN_REVEAL_AT_MOBILE ? 1 : 0)
    : (() => {
        const fadeInProgress = Math.min(
          1,
          routeProgress / SLOGAN_FADE_IN_END_DESKTOP,
        )
        return fadeInProgress * fadeInProgress * (3 - 2 * fadeInProgress)
      })()
  const exitOpacity = mobileLite.value
    ? sceneOp
    : (() => {
        const fadeOutProgress = Math.min(
          1,
          Math.max(
            0,
            (routeProgress - SLOGAN_FADE_OUT_START_DESKTOP)
            / (SLOGAN_FADE_OUT_END_DESKTOP - SLOGAN_FADE_OUT_START_DESKTOP),
          ),
        )
        const easedFadeOut = fadeOutProgress * fadeOutProgress * (3 - 2 * fadeOutProgress)
        return 1 - easedFadeOut
      })()
  const opacity = revealOpacity * exitOpacity
  // The mobile copy is centred by the flex container and no longer follows
  // scroll vertically. Desktop retains its existing authored rise.
  const nextY = mobileLite.value
    ? 0
    : startY + (endY - startY) * routeProgress
  sloganY.value = nextY
  copyOpacity.value = opacity
  // The sync mask watcher paints these in the same JS turn as the Surface box.
  // Refs remain as the mount/SSR fallback; direct styles avoid a Vue-frame lag.
  if (sloganEl.value) {
    sloganEl.value.style.transform = `translate3d(0, ${nextY.toFixed(3)}px, 0)`
  }
  if (copyEl.value) copyEl.value.style.opacity = opacity.toFixed(4)
}

function onAppliedParallaxFrame(frame: AppliedScrollFrame) {
  // The entrance temporarily opens the outer Surface crop so the complete
  // scene can rise into view. Once scroll starts moving the Surface geometry,
  // keeping that crop open exposes the rest-width stage beyond a narrowing
  // frame (anchored at its left edge, so the overflow appears on the right).
  // Commit the shared entrance to its final state before this scroll frame is
  // painted; Surface and scene then resume under their normal live crop.
  if (sceneEntryArmed.value && Math.abs(frame.delta) > 0.5) finishSceneEntryOnScroll()
  updateSloganMotion(frame.y)
}

watch(
  [
    () => mask.morph,
    () => mask.heroHorizontalMorph,
    () => mask.heroReturning,
  ],
  ([m]) => {
    // Page Canvas freezes the live page — don't dismiss/restore mid-flight.
    if (pageCanvasOpen.value) return
    updateSloganMotion()
    // Freeze only mid-morph — at hero rest edges stay live + cursor dent.
    setFrozen(m > 0.02 && m < 0.98)

  },
  { immediate: true, flush: 'sync' },
)

watch(
  [() => props.sectionEl, () => props.toEl, () => props.routeEndEl],
  () => {
    copyParallaxSectionTop = null
    updateSloganMotion()
  },
)

watch(
  () => props.stageHeight,
  () => updateSloganMotion(),
)

watch(pageCanvasOpen, (open) => {
  if (!open) {
    updateSloganMotion()
  }
})

async function ensureGsap() {
  if (gsapRef && stRef) return
  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)
  gsapRef = gsap
  stRef = ScrollTrigger
}

async function setupExitMotion(sectionEl: HTMLElement) {
  ctx?.revert()
  ctx = null

  const mobile = isNarrowViewport() || isCoarsePointer()
  mobileLite.value = mobile
  syncSwarmInteractive()
  // Mobile: no scroll exit blur — 3D fade is morph-driven.
  if (mobile) {
    void ensureGsap()
    return
  }

  await ensureGsap()
  const gsap = gsapRef!
  const ScrollTrigger = stRef!

  await nextTick()

  ctx = gsap.context(() => {
    const reduced = prefersReducedMotion()
    if (reduced) return

    ScrollTrigger.config({ ignoreMobileResize: true })

    const nextBlock = sectionEl.nextElementSibling as HTMLElement | null
    const exitStart = () => {
      const h = sectionEl.offsetHeight
      const vh = window.innerHeight
      const pastRest = Math.max(0, h - vh) + Math.round(vh * 0.08)
      return `top+=${pastRest} top`
    }
    const exitSt = {
      trigger: sectionEl,
      start: exitStart,
      endTrigger: nextBlock ?? sectionEl,
      end: nextBlock ? 'top center' : 'bottom top',
      scrub: 0.4,
      invalidateOnRefresh: true,
    }

    if (copyEl.value) {
      gsap.fromTo(
        copyEl.value,
        { filter: 'blur(0px)' },
        {
          filter: 'blur(14px)',
          ease: 'none',
          scrollTrigger: {
            ...exitSt,
            scrub: 0.35,
            // Late blur only — opacity is driven by morph min(h,v), not this scrub.
            start: () => {
              const h = sectionEl.offsetHeight
              const vh = window.innerHeight
              const pastRest = Math.max(0, h - vh) + Math.round(vh * 0.72)
              return `top+=${pastRest} top`
            },
          },
        },
      )
    }

    // Opacity / WebGL lifetime: morph watch only (min h,v). No early scrub fades.
    if (mediaEl.value) {
      ScrollTrigger.create({
        ...exitSt,
        onEnterBack: () => {
          if (desktopSceneOpacity() > SCENE_LIVE_OPACITY) sceneLive.value = true
        },
      })
    }

    // Off the mount critical path — morph host also refreshes; don't stack sync.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          ScrollTrigger.refresh()
        } catch {
          /* ignore */
        }
      })
    })
  }, sectionEl)
}

watch(
  () => props.sectionEl,
  async (el) => {
    if (!el) {
      ctx?.revert()
      ctx = null
      return
    }
    await setupExitMotion(el)
  },
  { immediate: true },
)

let introTl: { kill: () => void; pause: () => void; resume: () => void } | null = null
let introGen = 0

const swarmMount = ref(false)
const swarmLit = ref(false)
const heroWebglBooted = useState<boolean>('home-hero-webgl-booted', () => false)
const heroWebglLit = useState<boolean>('home-hero-webgl-lit', () => false)
let swarmIdleId: number | null = null
let swarmFallbackTimer = 0
let removeSwarmIntent: (() => void) | null = null
let stageUnmounted = false
let swarmIntentPending = false
let mobileSwarmDeferred = false
let requestSwarmMount: (() => void) | null = null

function scheduleSwarmMount(fromNavigation: boolean) {
  const mount = () => {
    if (swarmIdleId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(swarmIdleId)
      swarmIdleId = null
    }
    if (swarmFallbackTimer) {
      window.clearTimeout(swarmFallbackTimer)
      swarmFallbackTimer = 0
    }
    removeSwarmIntent?.()
    removeSwarmIntent = null
    if (!stageUnmounted) swarmMount.value = true
  }
  requestSwarmMount = mount
  if (fromNavigation) {
    requestAnimationFrame(mount)
    return
  }

  // The SSR/CSS Hero is the complete first frame. Three.js, shader compilation
  // and PMREM progressively upgrade it without blocking visible content.
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean }
  }).connection
  // `effectiveType` is a rolling transport estimate, not a user preference.
  // VPN changes can make it report 2g for an otherwise capable device and used
  // to postpone the actual WebGL mount for five seconds. Only explicit
  // Save-Data may defer the scene; slow estimates still skip speculative asset
  // warming in preloadHomeSceneAssets without hiding the finished experience.
  const constrained = Boolean(connection?.saveData)
  mobileSwarmDeferred = mobileLite.value && constrained
  if (mobileLite.value && !mobileSwarmDeferred) {
    // Fetch/parse the motion graph and current mobile HDR in an idle slot.
    // Do not mount WebGL here:
    // Android can discard a canvas below visibility:hidden. The intro timeline
    // mounts it as soon as the media layer becomes paintable.
    const warmMobileScene = () => {
      swarmIdleId = null
      if (!stageUnmounted) preloadHomeSceneAssets('mobile')
    }
    if (typeof window.requestIdleCallback === 'function') {
      swarmIdleId = window.requestIdleCallback(warmMobileScene, { timeout: 320 })
    } else {
      swarmFallbackTimer = window.setTimeout(() => {
        swarmFallbackTimer = 0
        warmMobileScene()
      }, 120)
    }
    return
  }

  const scheduleUpgrade = () => {
    // Warm the large Three module in a quiet slot, then mount automatically
    // shortly after the primary title/description entrance. Interaction stays
    // gated separately until the scene has faded in.
    if (!constrained) {
      const warmThree = () => {
        if (!stageUnmounted) void preloadThreeBundle()
      }
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warmThree, { timeout: 450 })
      } else {
        window.setTimeout(warmThree, 120)
      }
    }
    const delay = constrained ? 5000 : 1100
    let stopIntroGate: (() => void) | null = null
    const onIntent = () => {
      if (!heroIntroSettled.value) {
        swarmIntentPending = true
        return
      }
      mount()
    }
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (finePointer) window.addEventListener('pointermove', onIntent, { once: true, passive: true })
    window.addEventListener('click', onIntent, { once: true, passive: true })
    window.addEventListener('keydown', onIntent, { once: true })
    removeSwarmIntent = () => {
      stopIntroGate?.()
      stopIntroGate = null
      if (finePointer) window.removeEventListener('pointermove', onIntent)
      window.removeEventListener('click', onIntent)
      window.removeEventListener('keydown', onIntent)
    }

    stopIntroGate = watch(
      heroIntroSettled,
      (settled) => {
        if (!settled || !swarmIntentPending) return
        swarmIntentPending = false
        requestAnimationFrame(() => {
          if (stageUnmounted || swarmMount.value) return
          if (typeof window.requestIdleCallback === 'function') {
            swarmIdleId = window.requestIdleCallback(mount, { timeout: 500 })
          } else {
            window.setTimeout(mount, 80)
          }
        })
      },
    )

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (stageUnmounted || swarmMount.value) return
        swarmFallbackTimer = window.setTimeout(() => {
          swarmFallbackTimer = 0
          if (typeof window.requestIdleCallback === 'function') {
            swarmIdleId = window.requestIdleCallback(mount, { timeout: 350 })
          } else mount()
        }, delay)
      })
    })
  }

  if (initialReveal.revealed.value) scheduleUpgrade()
  else {
    const stop = watch(
      () => initialReveal.revealed.value,
      (revealed) => {
        if (!revealed) return
        stop()
        scheduleUpgrade()
      },
    )
  }
}
/** Intro may reveal the swarm; HDRI must be on first or balls look black. */
const coverMayLift = ref(false)
const swarmCoverUp = computed(
  () => swarmLit.value && coverMayLift.value && !glCoverLocked.value,
)

function onSwarmLit() {
  swarmLit.value = true
  heroWebglLit.value = true
}

function onSwarmBooted() {
  heroWebglBooted.value = true
}

function finishSceneEntryReveal() {
  sceneEntryTween?.kill()
  sceneEntryTween = null
  sceneEntryRunning.value = false
  sceneEntryArmed.value = false
  emit('sceneEntryChange', false)
}

/** Resolve the temporary open-crop state before scroll takes geometry ownership. */
function finishSceneEntryOnScroll() {
  if (!sceneEntryArmed.value) return
  if (sceneEntryTween) {
    // Reuse the tween's normal completion path, including transform cleanup.
    sceneEntryTween.progress(1)
    return
  }

  // Scroll can arrive during the two-frame GL warm-up, before the tween exists.
  // Leave the safety cover available, but commit both media and crop contracts
  // so the later lit frame does not restart an entrance at scrolled geometry.
  const scene = sceneEntryEl.value
  if (scene) {
    scene.style.removeProperty('transform')
    scene.style.setProperty('--hero-scene-entry-opacity', '1')
  }
  if (mediaEl.value) {
    mediaEl.value.style.opacity = '1'
    mediaEl.value.style.visibility = 'visible'
  }
  finishSceneEntryReveal()
}

async function startSceneEntryReveal() {
  if (!sceneEntryArmed.value || sceneEntryRunning.value || stageUnmounted) return
  sceneEntryRunning.value = true
  // The canvas is lit now. Remove its safety cover without crossfading a flat
  // colour through the wipe, then begin on the next painted frame.
  coverMayLift.value = true
  await nextTick()
  await waitGlFrames(2)
  if (
    stageUnmounted
    || !sceneEntryArmed.value
    || !sceneEntryEl.value
    || !mediaEl.value
  ) return

  const { default: gsap } = await import('gsap')
  if (stageUnmounted || !sceneEntryArmed.value) return
  // The intro timeline keeps the complete media layer at opacity: 0 while GL
  // warms under its cover. The entrance tween below animates a child of that
  // layer, so reveal the parent first; otherwise both desktop and mobile render
  // a healthy canvas underneath a permanently transparent ancestor.
  gsap.set(mediaEl.value, { opacity: 1, visibility: 'visible' })
  // Animate the normal-size rounded viewport. The larger render-bleed layer
  // stays nested inside it, so the entering panel cannot widen and then snap.
  const scene = sceneEntryEl.value
  const destination = scene.getBoundingClientRect()
  const startY = Math.max(0, window.innerHeight - destination.top + 1)
  sceneEntryTween = gsap.fromTo(
    scene,
    { y: startY, '--hero-scene-entry-opacity': 0 },
    {
      y: 0,
      '--hero-scene-entry-opacity': 1,
      duration: mobileLite.value ? 0.92 : 1.12,
      ease: 'power4.out',
      onComplete: () => {
        // Keep the settled entry factor inline. Scroll opacity remains a
        // separate live multiplier, so completing either motion cannot snap
        // the other clock to a stale value.
        gsap.set(scene, { clearProps: 'transform' })
        finishSceneEntryReveal()
      },
    },
  )
}

watch(
  [swarmLit, swarmVisible],
  () => {
    heroSwarmReady.value = swarmLit.value && swarmVisible.value
  },
  { immediate: true },
)

/** Reveal a lit canvas first; ordinary SPA returns only need the safety lid. */
watch(
  [swarmLit, () => initialReveal.revealed.value, glCoverLocked, sceneEntryArmed],
  ([lit, rev, coverLocked, entryArmed]) => {
    if (!lit || !rev || coverLocked) return
    if (entryArmed) {
      void startSceneEntryReveal()
      return
    }
    coverMayLift.value = true
  },
)

onMounted(() => {
  if (pageIrisHomeReveal.value) {
    glCoverHopSession.value = true
    glCoverHold.value = true
  } else if (heroGlRevealBusy.value) {
    glCoverHold.value = true
  }

  // Don't freeze at rest — living edges + hover need an unfrozen silhouette.
  setFrozen(false)
  updateSloganMotion()
  syncSwarmInteractive()
  removeAppliedScrollFrame = subscribeAppliedScrollFrame(onAppliedParallaxFrame)
  window.addEventListener('resize', onCopyParallaxResize, { passive: true })

  const fromNav = skipHeroIntro.value
  if (fromNav) skipHeroIntro.value = false
  const animateSceneEntry = !fromNav
    && sceneOpacity.value > SCENE_LIVE_OPACITY
    && !prefersReducedMotion()
  sceneEntryArmed.value = animateSceneEntry
  sceneEntryRunning.value = false
  emit('sceneEntryChange', animateSceneEntry)

  heroIntroSettled.value = fromNav
  introPending.value = !fromNav
  swarmLoopReady.value = fromNav
  scheduleSwarmMount(fromNav)

  watch(pageCanvasBusy, (on) => {
    if (on) introTl?.pause()
    else introTl?.resume()
  })

  watch(
    () => initialReveal.revealed.value,
    async (on) => {
      if (!on) {
        if (fromNav) return
        swarmLoopReady.value = false
        introPending.value = true
        return
      }
      if (fromNav) {
        introPending.value = false
        swarmLoopReady.value = true
        coverMayLift.value = true
        if (mediaEl.value) {
          mediaEl.value.style.opacity = '1'
          mediaEl.value.style.visibility = 'visible'
        }
        return
      }

      const gen = ++introGen
      introTl?.kill()
      introTl = null

      // Sync hide before any await — media stays invisible until the intro fade.
      if (mediaEl.value) {
        mediaEl.value.style.opacity = '0'
        mediaEl.value.style.visibility = 'hidden'
      }

      const { default: gsap } = await import('gsap')
      if (gen !== introGen) return

      const mobile = mobileLite.value
      const titleGroups = titleCharGroups(isNarrowViewport())
      const titleChars = titleGroups.flat()

      if (mediaEl.value) gsap.set(mediaEl.value, { autoAlpha: 0 })
      if (titleChars.length) gsap.set(titleChars, { yPercent: HERO_TITLE_ENTER_Y_PERCENT })
      else if (titleEl.value) gsap.set(titleEl.value, { yPercent: HERO_TITLE_ENTER_Y_PERCENT })
      if (descEls.value.length) gsap.set(descEls.value, { yPercent: 115 })

      // Drop CSS hide only after GSAP owns opacity — no one-frame flash.
      introPending.value = false
      await nextTick()
      if (gen !== introGen) return

      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => {
          if (gen === introGen) heroIntroSettled.value = true
        },
      })
      introTl = tl

      if (mobile) {
        // Keep the layer paintable for WebGL, but leave its opacity to the
        // viewport-edge scene entrance below.
        if (mediaEl.value) {
          tl.set(
            mediaEl.value,
            sceneEntryArmed.value
              ? { opacity: 0, visibility: 'visible' }
              : { autoAlpha: 1 },
            0,
          )
        }
        if (!mobileSwarmDeferred) {
          // Mount only after the media layer is visible, then let HDR/PMREM and
          // shader compilation run under the opaque stone lid while the copy
          // finishes its entrance.
          tl.call(() => requestSwarmMount?.(), [], 0.08)
        }
        // Begin motion early; shader/HDR readiness still owns the cover lift.
        tl.call(() => {
          if (gen === introGen) swarmLoopReady.value = true
        }, [], 0.18)
      } else {
        // Desktop uses the same scene + backing entrance as mobile.
        swarmLoopReady.value = true
        if (mediaEl.value) {
          tl.set(
            mediaEl.value,
            sceneEntryArmed.value
              ? { opacity: 0, visibility: 'visible' }
              : { autoAlpha: 1 },
            0,
          )
        }
      }

      if (mobile) {
        if (titleChars.length) {
          titleGroups.forEach((chars) => {
            tl.to(
              chars,
              { yPercent: 0, duration: 1.1, stagger: 0.055, ease: 'power4.out' },
              0.12,
            )
          })
        } else if (titleEl.value) {
          tl.to(titleEl.value, { yPercent: 0, duration: 1.1, ease: 'power4.out' }, 0.12)
        }
        if (descEls.value.length) {
          tl.to(
            descEls.value,
            { yPercent: 0, duration: 1.1, stagger: 0.18, ease: 'power4.out' },
            0.34,
          )
        }
      } else {
        if (titleChars.length) {
          titleGroups.forEach((chars) => {
            tl.to(
              chars,
              { yPercent: 0, duration: 1.1, stagger: 0.055, ease: 'power4.out' },
              0.5,
            )
          })
        } else if (titleEl.value) {
          tl.to(titleEl.value, { yPercent: 0, duration: 1.1, ease: 'power4.out' }, 0.5)
        }
        if (descEls.value.length) {
          tl.to(
            descEls.value,
            { yPercent: 0, duration: 1.1, stagger: 0.18, ease: 'power4.out' },
            0.95,
          )
        }
      }
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  stageUnmounted = true
  if (swarmIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(swarmIdleId)
  }
  if (swarmFallbackTimer) window.clearTimeout(swarmFallbackTimer)
  removeSwarmIntent?.()
  removeSwarmIntent = null
  requestSwarmMount = null
  introGen += 1
  introTl?.kill()
  introTl = null
  sceneEntryTween?.kill()
  sceneEntryTween = null
  emit('sceneEntryChange', false)
  heroSwarmReady.value = false
  cancelGlCoverHold()
  glCoverHopSession.value = false
  finishHeroRevealQuiet()
  setFrozen(false)
  if (sceneReleaseTimer) window.clearTimeout(sceneReleaseTimer)
  sceneReleaseTimer = 0
  ctx?.revert()
  removeAppliedScrollFrame?.()
  removeAppliedScrollFrame = null
  window.removeEventListener('resize', onCopyParallaxResize)
})
</script>

<template>
  <div
    class="hero-stage pointer-events-none absolute overflow-visible"
    :style="{
      top: '0px',
      left: '0px',
      transform: 'translate3d(var(--hero-stage-left, 0px), var(--hero-stage-top, 0px), 0)',
      width: `${Math.max(1, props.stageWidth)}px`,
      height: `${Math.max(1, props.stageHeight)}px`,
      '--hero-visual-fade-duration': `${MOBILE_HERO_FADE_MS}ms`,
    }"
  >
    <div
      ref="focusEl"
      class="hero-focus relative size-full min-h-0"
    >
      <div
        ref="sceneEntryEl"
        class="hero-scene-entry-shell absolute inset-0"
        :style="{
          '--hero-scene-scroll-opacity': sceneOpacity,
        }"
        :class="{ 'hero-scene-entry-pending': sceneEntryArmed }"
      >
        <div class="hero-scene-scroll-shell absolute inset-0">
          <div
            ref="mediaEl"
            class="absolute"
            :style="{
              top: `-${sceneBleedY}px`,
              left: `-${sceneBleedX}px`,
              width: `calc(100% + ${sceneBleedX * 2}px)`,
              height: `calc(100% + ${sceneBleedY * 2}px)`,
              '--hero-scene-bleed-x': `${sceneBleedX}px`,
              '--hero-scene-bleed-y': `${sceneBleedY}px`,
            }"
            :class="[
              swarmInteractive ? 'pointer-events-auto' : 'pointer-events-none',
              introPending ? 'hero-intro-hide' : '',
            ]"
          >
            <ClientOnly>
              <LazyHeroSwarmCanvas
                v-if="swarmMount"
                class="size-full"
                :class="{ 'hero-swarm--cold': !swarmVisible }"
                :active="swarmActive"
                :controls-ready="!sceneEntryArmed"
                :overlay-inset-x="sceneBleedX"
                :overlay-inset-y="sceneBleedY"
                @booted="onSwarmBooted"
                @lit="onSwarmLit"
              />
            </ClientOnly>
            <!-- Neutral Surface-colour lid stays up until the first live GL frame. -->
            <div
              ref="swarmCoverEl"
              class="hero-swarm-cover"
              :class="{
                'hero-swarm-cover--up': swarmCoverUp,
                'hero-swarm-cover--lock': glCoverLocked,
                'hero-swarm-cover--entry': sceneEntryArmed,
              }"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div
        ref="copyEl"
        class="hero-copy-shell pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col will-change-transform"
        :class="{ 'hero-intro-hide': introPending }"
        :style="{
          opacity: copyOpacity,
          transform: 'translate3d(var(--hero-copy-x, 0px), 0, 0)',
        }"
      >
        <div
          class="hero-copy mx-auto grid h-full w-full min-h-0"
          :style="{
            maxWidth: 'var(--layout-content-max)',
            gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
            columnGap: 'var(--layout-gutter)',
          }"
        >
          <div
            class="col-span-12 flex min-h-0 flex-col items-center justify-center md:col-span-10 md:col-start-2"
          >
            <p
              ref="sloganEl"
              class="hero-slogan"
              :style="{
                transform: `translate3d(0, ${sloganY}px, 0)`,
              }"
            >
              <span v-for="line in sloganLines" :key="line">{{ line }}</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Only motion controls sit above the copy backing; the WebGL canvas stays below it. -->
      <div
        id="hero-motion-controls"
        class="hero-scene-scroll-shell pointer-events-none absolute z-20"
        :inert="sceneOpacity <= SCENE_LIVE_OPACITY"
        :style="{
          '--hero-scene-scroll-opacity': sceneOpacity,
          top: `-${sceneBleedY}px`,
          left: `-${sceneBleedX}px`,
          width: `calc(100% + ${sceneBleedX * 2}px)`,
          height: `calc(100% + ${sceneBleedY * 2}px)`,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.hero-intro-hide {
  opacity: 0 !important;
  visibility: hidden !important;
}

.hero-swarm-cover {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  background: var(--hero-scene-forest);
  pointer-events: none;
  transition: opacity 0.5s var(--motion-ease, ease), visibility 0.5s;
}

.hero-swarm-cover--up {
  opacity: 0;
  visibility: hidden;
}

.hero-swarm-cover--lock {
  opacity: 1;
  visibility: visible;
  transition: none;
}

.hero-copy {
  /* Mobile: same inset on sides and above the title. */
  padding-inline: var(--layout-margin-content);
  padding-top: var(--layout-margin-content);
  padding-bottom: calc(4 * var(--space-block));
}

@media (min-width: 768px) {
  .hero-copy {
    padding-inline: 0;
    padding-top: calc(var(--space-block) * 1.5);
    padding-bottom: var(--space-block);
  }
}

.hero-slogan {
  color: var(--semantic-bg-page);
  font-size: calc(var(--type-slogan) * 1.4);
  font-weight: 500;
  font-synthesis: none;
  letter-spacing: -0.02em;
  line-height: 1.2;
  text-align: center;
  will-change: transform;
}

.hero-slogan span {
  display: block;
}

.hero-swarm-cover--entry {
  opacity: 0;
  visibility: hidden;
  transition: none;
}

.hero-scene-entry-shell {
  /*
   * Scroll and entrance are independent clocks. Vue updates only the exit
   * factor; GSAP owns only the entry factor. Their product avoids either
   * renderer resetting the other's in-flight opacity for one frame.
   */
  opacity: var(--hero-scene-entry-opacity, 1);
}

.hero-scene-scroll-shell {
  opacity: var(--hero-scene-scroll-opacity, 1);
}

.hero-scene-entry-pending {
  --hero-scene-entry-opacity: 0;
  overflow: hidden;
  border-radius: var(--flow-surface-radius, 24px);
  will-change: transform, opacity;
}

/* Mobile keeps the same enlarged scale in the portrait scene. */
@media (max-width: 767px) {
  .hero-scene-scroll-shell,
  .hero-copy-shell {
    transition: opacity var(--hero-visual-fade-duration) cubic-bezier(0.22, 1, 0.36, 1);
    will-change: opacity;
  }

  .hero-slogan {
    font-size: calc(var(--type-slogan) * 1.4);
    text-align: center;
  }
}

@media not all {
  .hero-scene-scroll-shell,
  .hero-copy-shell {
    transition: none;
  }

  .hero-slogan {
    transform: none !important;
  }
}
</style>
