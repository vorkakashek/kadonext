<script setup lang="ts">
/**
 * Fixed Flow Surface — one clipped window.
 * Desktop: hero → stone scrub, then kado → the gray case frame (same lag, both
 * directions via ScrollTrigger onUpdate). The Cases section owns its media;
 * this host only travels to and from the case figure.
 * Mobile: one native-scroll-driven corridor through every waypoint. No
 * autonomous tween owns the Surface while the document keeps moving.
 */
import {
  applyBox,
  applyBoxVisualTransform,
  docToViewport,
  heroToKadoPlan,
  lerpBox,
  mixBox,
  poseAtScrollY,
  readBox,
  readDocBox,
  resolveCorridorSegment,
  scrollTargetFromCorridor,
  scrollYForCenterCenter,
  scrollYForCenterTop,
  scrollYForTopAt,
  targetsFromScrollProgress,
  updateContinuousProgress,
  type SurfaceBox,
  type SurfaceMorphPlan,
  type ScrollCorridorRange,
} from '~/utils/flowSurfaceMorph'

const emit = defineEmits<{
  ready: []
}>()
import {
  applyFlowSurfaceLive,
  flowSurfaceLiveFromMorph,
} from '~/utils/flowSurfaceLive'
import {
  FLOW_SURFACE_CLIP_ID,
  flowSurfaceMask,
  flushFlowSurfacePath,
  registerFlowSurfaceClipPathEl,
  registerFlowSurfaceLiveBoxNudge,
  resetFlowSurfaceMaskSession,
} from '~/composables/useFlowSurfaceMask'
import {
  isAppleTouchDevice,
  isCoarsePointer,
  isNarrowViewport,
} from '~/utils/mobileViewport'
import {
  appliedScrollInputRevision,
  subscribeAppliedScrollFrame,
  type AppliedScrollFrame,
} from '~/utils/appliedScrollFrame'
import {
  mobileHeroSurfaceMorphStartScrollY,
  readMobileHeroCopyLayout,
} from '~/utils/mobileHeroCopyMotion'
import {
  registerHomeAnchorMotion,
  HOME_ANCHOR_DESTINATIONS,
  HOME_ANCHOR_TIMING,
  isHomeAnchorTarget,
  type HomeAnchorTarget,
} from '~/utils/homeAnchorMotion'
import {
  CASE_MEDIA_FLIGHT_START_EVENT,
  mixSurfaceVisualSnapshot,
  planSurfaceRoute,
  type SurfaceRouteDecision,
  type SurfaceVisualSnapshot,
} from '~/utils/flowSurfaceContract'
import { preloadGsapBundle } from '~/utils/preloadHomeMotion'

/** The site's minimal mode keeps the core Surface choreography intact. */
function systemReducedMotion() {
  return import.meta.client
    && prefersReducedMotion()
}

type MobileHop = 'term' | 'word'
type MobileStage = 'scrub' | MobileHop

const STAGE_RANK: Record<MobileStage, number> = {
  scrub: 0,
  term: 1,
  word: 2,
}

const HOP_DURATION = 0.42
const HOP_EASE = 'power2.inOut'
/**
 * Desktop kado→cases: one scrub corridor (same lag as hero→kado).
 * start = begin leaving the stone; end = fully on the case photo.
 * Shifted ~15% lower so the transition starts later on scroll down.
 */
const CASE_SCRUB_START = 'top 60%'
const CASE_SCRUB_END = 'top 18%'
/** Desktop scroll-follow softness for the final Kado → case-media approach. */
const CASE_SCRUB_LAG = 0.13
/** Cases → work formats: release the project image into the next surface slot. */
const FORMATS_SCRUB_START = 'top 82%'
const FORMATS_SCRUB_END = 'top 35%'
/** Work formats → author block: the stone surface settles into its dark panel. */
const ABOUT_SCRUB_START = 'top 92%'
const ABOUT_SCRUB_END = 'top 25%'
/** Begin as Biography leaves; settle before the contact anchor stops scrolling. */
const CONTACT_SCRUB_START = 'bottom bottom+=72px'
const CONTACT_SETTLE_VIEWPORT_P = 0.18
const CONTACT_ANCHOR_SETTLE_LEAD_PX = 72
/** Biography → Contact: clear the dark tone in the opening 13% of travel. */
const CONTACT_TONE_END_P = 0.13
/** Global scroll-driven surface limit, in normalized morph segments/sec. */
const SURFACE_MORPH_MAX_VELOCITY = 1.55
/** Compress a stale multi-waypoint backlog without changing the canonical path. */
const SURFACE_MORPH_CATCH_UP_MAX_VELOCITY = 3.1
/** Give the final wide Hero reveal more room on a fast reverse scroll. */
const HERO_RETURN_MAX_VELOCITY = 1.15
/** Extra clock range for the in-flow Hero travel before the morph starts. */
const DESKTOP_HERO_REVEAL_CLOCK_SPAN = 0.42
const SURFACE_MORPH_EPSILON = 0.0008
/** Treat the Surface as parked once lagged progress passes this. */
const CASE_PARK_P = 0.85
/** Let the project image meet the Surface before its slow final approach ends. */
const CASE_MEDIA_REVEAL_START_P = 0.76
/** Fade the travelling image out during the first half of either exit path. */
const CASE_MEDIA_EXIT_END_P = 0.48
/** Keep the parked stone plate safely inside the project raster on every DPR. */
const CASE_MEDIA_SURFACE_INSET_PX = 1
/** Kado → Cases forward handoff and Cases → Kado return marker. */
const MOBILE_CASE_HOP_FORWARD = 'top 30%'
const MOBILE_CASE_HOP_REVERSE = 'top 90%'
const MOBILE_CASE_HOP_DURATION = 0.9
const MOBILE_CASE_HOP_EASE = 'sine.inOut'
const MOBILE_CASE_HOP_MIN_DURATION = 0.08
/** Down: project-media centre reaches the viewport top. */
const MOBILE_FORMATS_FORWARD_TRIGGER = 'center top'
/** Up: a point 200px below the formats-list top reaches the viewport bottom. */
const MOBILE_FORMATS_REVERSE_OFFSET_PX = 200
const MOBILE_FORMATS_HOP_DURATION = 0.72
const MOBILE_CASE_MEDIA_REVEAL_DELAY_MS = 200
const MOBILE_ABOUT_HOP_DURATION = 0.72
/** Down: biography begins as soon as its section touches the viewport bottom. */
const MOBILE_ABOUT_TRIGGER = 'top bottom'
/** Prevent native-scroll bounce from flipping a tail transition at one pixel. */
const MOBILE_TAIL_TRIGGER_HYSTERESIS_PX = 24
const MOBILE_CASE_DIRECTION_REVERSAL_PX = 10
/** Pin only at the true endpoint; pinning at 96% caused a visible 4% jump. */
const CASE_PIN_P = 0.999
/** Ignore reverse hop triggers right after a forward hop (scroll bounce). */
const STAGE_FORWARD_LOCK_MS = HOP_DURATION * 1000 + 120
const MOBILE_KADO_MORPH_SPAN_VH = 0.18
const MOBILE_KADO_HOLD_VH = 0.18
const MOBILE_WORD_MORPH_SPAN_VH = 0.24
const MOBILE_WORD_HOLD_VH = 0.12
/** Minimum finger travel for Kado → Projects; prevents a near-zero span. */
const MOBILE_CASE_SCROLL_SPAN_VH = 0.62
/** Scroll runway where case media exits while the Surface remains parked. */
const MOBILE_CASE_MEDIA_EXIT_SPAN_VH = 0.24
/** Let Formats enter the lower viewport after the project raster has left. */
const MOBILE_CASE_SURFACE_HOLD_VH = 0.24
/** Direction-independent parked runway before Projects releases to Formats. */
const MOBILE_CASE_TO_FORMATS_HOLD_PX = 200
/** Tail morphs must never collapse to a one-pixel range after layout shifts. */
const MOBILE_FORMATS_SCROLL_SPAN_VH = 0.62
const MOBILE_ABOUT_SCROLL_SPAN_VH = 0.3
const MOBILE_CONTACT_ENTRY_LEAD_PX = 32
/** Stretch Formats ↔ Biography equally at both ends of the reversible range. */
const MOBILE_ABOUT_ENTRY_LEAD_PX = 80
const MOBILE_ABOUT_EXIT_RUNWAY_PX = 80
/** Mobile Biography reaches its dark tone before the geometry finishes. */
const MOBILE_ABOUT_TONE_END_P = 0.85
/** Preserve descenders that extend below the heading's tight line box. */
const MOBILE_ABOUT_TITLE_CLIP_BLEED_PX = 3
const props = withDefaults(
  defineProps<{
    fromEl?: HTMLElement | null
    toEl?: HTMLElement | null
    /** Rock image — mobile scroll markers. */
    stoneEl?: HTMLElement | null
    /** Title + phonetic — hop after stone `top 10%`. */
    termEl?: HTMLElement | null
    /** “Kado” word — hop at stone `center top`; Cases handoff at word `top 20%`. */
    wordEl?: HTMLElement | null
    /** Body block — layout / capture; Cases handoff uses wordEl when present. */
    bodyEl?: HTMLElement | null
    /** Cases section — desktop kado→case scrub trigger. */
    caseSectionEl?: HTMLElement | null
    /** Case mockup figure — scrub destination (surface occupies this box). */
    caseMediaEl?: HTMLElement | null
    /** Work-formats section — desktop trigger for the next continuous segment. */
    formatsSectionEl?: HTMLElement | null
    /** Plain surface slot at the left of the work-formats list. */
    formatsSurfaceEl?: HTMLElement | null
    /** Author section — final continuous surface segment. */
    aboutSectionEl?: HTMLElement | null
    /** Dark surface destination behind the author heading and portrait. */
    aboutSurfaceEl?: HTMLElement | null
    /** Heading whose light copy is clipped to the live surface overlap. */
    aboutTitleEl?: HTMLElement | null
    /** Bottom of the visible Biography content — starts the contact morph. */
    aboutEndEl?: HTMLElement | null
    /** Contact section — final continuous surface segment. */
    contactSectionEl?: HTMLElement | null
    /** Form field destination; the live Surface also clips the form UI. */
    contactSurfaceEl?: HTMLElement | null
    /** Stable layout slot for the fields inside the growing contact surface. */
    contactFieldsEl?: HTMLElement | null
    plan?: SurfaceMorphPlan
    toneClass?: string
  }>(),
  {
    fromEl: null,
    toEl: null,
    stoneEl: null,
    termEl: null,
    wordEl: null,
    bodyEl: null,
    caseSectionEl: null,
    caseMediaEl: null,
    formatsSectionEl: null,
    formatsSurfaceEl: null,
    aboutSectionEl: null,
    aboutSurfaceEl: null,
    aboutTitleEl: null,
    aboutEndEl: null,
    contactSectionEl: null,
    contactSurfaceEl: null,
    contactFieldsEl: null,
    plan: () => heroToKadoPlan,
    toneClass: 'bg-stone',
  },
)

const initialHomeDocument = useState<boolean>('initial-home-document', () => false)
const homeIntroUnlocked = useState<boolean>('home-intro-gate-unlocked', () => false)
const homeMotionReady = useState<boolean>('home-flow-motion-ready', () => false)
const {
  activeCaseId,
  surfaceDocked: caseSurfaceDocked,
  surfaceReady: caseSurfaceReady,
  surfaceReturning: caseSurfaceReturning,
  caseMediaVisible,
  routePhase,
  surfacePaintOwner,
  homeReturnPending: caseDetailHomeReturnPending,
  setSurfaceDocked,
  setSurfaceReady,
  setCaseMediaVisible,
  setSurfaceReturning,
  consumeHomeReturnSurface,
  releaseHomeReturnSnapshot,
} = useHomeExperience()
function returningHomeFromCaseDetail() {
  return caseDetailHomeReturnPending.value
    || routePhase.value === 'returning-home'
}

/** Return flight/dock owns paint, while the scroll corridor stays built underneath. */
function desktopReturnOwnsPaint() {
  return !useMobileCorridor()
    && (
      returningHomeFromCaseDetail()
      || surfacePaintOwner.value === 'return-dock'
    )
}

function setCaseSurfaceDocked(on: boolean) {
  if (on) setSurfaceReturning(false)
  setSurfaceDocked(on)
}

const frame = ref<HTMLElement | null>(null)
const shellEl = ref<HTMLElement | null>(null)
const clipPathEl = ref<SVGPathElement | null>(null)
/** Keep the cold Hero scene free of the Surface crop until its rise completes. */
const heroSceneEntryActive = ref(false)
/** Teleport target for a pinned hop — null keeps the frame in the fixed shell. */
const pinTo = ref<HTMLElement | null>(null)
/** Mobile rest poses use a cheap CSS backplate; the live frame only owns flights. */
const proxyParked = ref(false)
/** Hero-rest pose — stage keeps this size/origin; frame morphs around it. */
const stageRest = reactive({ top: 0, left: 0, w: 1, h: 1 })
const heroSectionEl = computed(() => {
  const el = props.fromEl
  if (!el) return null
  return (el.closest('section') as HTMLElement | null) ?? el
})

let trigger: { kill: () => void; progress: number } | null = null
let caseTrigger: { kill: () => void; progress: number } | null = null
let formatsTrigger: { kill: () => void; progress: number } | null = null
let aboutTrigger: { kill: () => void; progress: number } | null = null
let contactTrigger: { kill: () => void; refresh: () => void; progress: number } | null = null
let mobileTriggers: { kill: () => void }[] = []
let hopTween: { kill: () => void } | null = null
let target = { h: 0, v: 0 }
let live = { h: 0, v: 0 }
let fromDoc: SurfaceBox | null = null
let toDoc: SurfaceBox | null = null
let lastCaseDoc: SurfaceBox | null = null
let lastFormatsDoc: SurfaceBox | null = null
let fromPose: SurfaceBox | null = null
let toPose: SurfaceBox | null = null
let heroRestPose: SurfaceBox | null = null
let desktopTargetS = 0
let desktopLiveS = 0
const DESKTOP_CASE_DOCK_S = 2
let returnDockScrollY: number | null = null
let returnDockInputRevision = 0
const contactStageProgress = ref(0)
/** True while lagged case progress is parked on the mockup. */
let caseMediaActive = false
let surfaceReadyEmitted = false
/** Keep the default desktop-sized frame out of paint until its real pose is applied. */
const frameBootReady = ref(false)
/** A mobile hash entry must never expose the incomplete Hero/Kado fallback. */
const mobileSectionBootPending = ref(false)

/** Keep the SSR primer for one committed live frame, then hand paint ownership over. */
function announceSurfaceReady() {
  if (surfaceReadyEmitted || !frame.value) return
  if (mobileSectionBootPending.value && !mobileScrollBounds) return
  surfaceReadyEmitted = true
  // FlowSurfaceHost mounts client-side after SSR. Its inline fallback is the
  // desktop Hero rectangle; on mobile the measured in-flow slot is much shorter
  // and lower. Reveal only after that first measured pose is committed, otherwise
  // Chrome records the decorative frame handoff as a ~0.28 layout shift.
  frameBootReady.value = true
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      mobileSectionBootPending.value = false
      emit('ready')
    })
  })
}

let gsapMod: typeof import('gsap') | null = null
let stMod: typeof import('gsap/ScrollTrigger') | null = null
let motionBootPromise: Promise<void> | null = null
let motionBootTimer = 0
let motionIdleId: number | null = null
let removeMotionIntent: (() => void) | null = null
let stopIntroUnlockMotionWatch: (() => void) | null = null
let removeAppliedScrollFrame: (() => void) | null = null
let releaseClipPathEl: (() => void) | null = null
let releaseLiveBoxNudge: (() => void) | null = null
let hostUnmounted = false
let keepAliveActive = true
const initialCasesHashEntry = ref(false)

function hasConnectedSurfaceHost() {
  return !!shellEl.value?.isConnected
    && !!frame.value?.isConnected
    && !!props.fromEl?.isConnected
    && !!props.toEl?.isConnected
}

function connectAppliedScrollFrames() {
  if (!removeAppliedScrollFrame) {
    removeAppliedScrollFrame = subscribeAppliedScrollFrame(onAppliedSurfaceFrame)
  }
}

function disconnectAppliedScrollFrames() {
  removeAppliedScrollFrame?.()
  removeAppliedScrollFrame = null
}

function claimSurfaceDomOwnership() {
  const path = clipPathEl.value
  if (path) {
    releaseClipPathEl?.()
    releaseClipPathEl = registerFlowSurfaceClipPathEl(path)
  }
  releaseLiveBoxNudge?.()
  releaseLiveBoxNudge = registerFlowSurfaceLiveBoxNudge((deltaY) => {
    if (liveBox) liveBox = { ...liveBox, top: liveBox.top + deltaY }
  })
}

/** A cached/detached home instance must never publish into the shared state. */
function suspendDetachedSurfaceHost() {
  if (hasConnectedSurfaceHost()) return false
  keepAliveActive = false
  disconnectAppliedScrollFrames()
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  return true
}

async function bootMotionEngine() {
  if (motionBootPromise) return motionBootPromise
  motionBootPromise = (async () => {
    if (motionBootTimer) {
      window.clearTimeout(motionBootTimer)
      motionBootTimer = 0
    }
    if (motionIdleId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(motionIdleId)
      motionIdleId = null
    }
    removeMotionIntent?.()
    removeMotionIntent = null

    const [nextGsap, nextScrollTrigger] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ])
    if (hostUnmounted) return
    gsapMod = nextGsap
    stMod = nextScrollTrigger
    gsapMod.default.registerPlugin(stMod.ScrollTrigger)
    gsapMod.default.ticker.fps(0)
    gsapMod.default.ticker.lagSmoothing(0)
    gsapMod.default.config({ force3D: true, nullTargetWarn: false })
    stMod.ScrollTrigger.config({ ignoreMobileResize: true })
    if (props.fromEl && props.toEl) buildMorph()
  })()
  return motionBootPromise
}

function scheduleColdMotionBoot() {
  // Fetch and evaluate the shared motion modules without putting them on the
  // first-paint path. Corridor capture remains separately scheduled below.
  void preloadGsapBundle()
  const onIntent = () => void bootMotionEngine()
  const intentEvents: Array<keyof WindowEventMap> = [
    'wheel',
    'touchstart',
    'pointerdown',
    'keydown',
  ]
  for (const event of intentEvents) {
    window.addEventListener(event, onIntent, { once: true, passive: true })
  }
  removeMotionIntent = () => {
    for (const event of intentEvents) window.removeEventListener(event, onIntent)
  }

  // On a cold Home document, build the scroll corridor in its first quiet slot
  // instead of putting GSAP, ScrollTrigger and all corridor measurements on the
  // first-paint path or leaving them for the first wheel event.
  // That event must only advance an already-live surface; otherwise its main-
  // thread boot steals the WebGL scene's first visible frames.
  const scheduleTimeout = window.setTimeout.bind(window)
  if ('requestIdleCallback' in window) {
    motionIdleId = window.requestIdleCallback(
      () => {
        motionIdleId = null
        void bootMotionEngine()
      },
      { timeout: 900 },
    )
  } else {
    motionBootTimer = scheduleTimeout(() => {
      motionBootTimer = 0
      void bootMotionEngine()
    }, 160)
  }
}

/** Mobile corridor state */
let mobileActive = false
/** Reversible mobile Kado → Cases hop progress. */
let mobileCaseProgress = 0
let caseSettleTween: { kill: () => void } | null = null
let caseHopGen = 0
let caseHopDirection: 'forward' | 'reverse' | null = null
let caseHopOppositePx = 0
let formatsSettleTween: { kill: () => void } | null = null
let formatsHopGen = 0
let formatsHopDirection: 'forward' | 'reverse' | null = null
let mobileFormatsProgress = 0
let mobileFormatsScrollDirection: 'forward' | 'reverse' | null = null
/** Directional latch: forward and reverse intentionally use different markers. */
let mobileFormatsRequested = false
let mobileFormatsArrived = false
let aboutSettleTween: { kill: () => void } | null = null
let aboutHopGen = 0
let aboutHopDirection: 'forward' | 'reverse' | null = null
let mobileAboutProgress = 0
let mobileAboutArrived = false
type MobileScrollBounds = {
  termStart: number
  termEnd: number
  wordStart: number
  wordEnd: number
  caseStart: number
  caseEnd: number
  caseMediaEnd: number
  formatsMediaStart: number
  formatsStart: number
  formatsEnd: number
  aboutStart: number
  aboutEnd: number
  contactStart: number
  contactEnd: number
  stoneDoc: SurfaceBox
  termDoc: SurfaceBox
  wordDoc: SurfaceBox
  caseDoc: SurfaceBox
  formatsDoc: SurfaceBox
  formatsListDoc: SurfaceBox
  aboutDoc: SurfaceBox
  contactDoc: SurfaceBox
}
let mobileScrollBounds: MobileScrollBounds | null = null
let mobileCorridorS = 0
let mobileCorridorLastY: number | null = null
let mobileCorridorDirection: 'forward' | 'reverse' = 'forward'
/** Stays latched across case layout refreshes; clears only on a real reverse. */
let mobileCaseArrived = false
/** Smooth bridge from a skipped mobile waypoint back into the Hero scrub. */
let mobileScrubBridge: {
  from: SurfaceBox
  fromMorph: number
  progress: number
} | null = null
let mobileStage: MobileStage = 'scrub'
let heroPose: SurfaceBox | null = null
let stonePose: SurfaceBox | null = null
let scrubStartY = 0
let scrubEndY = 0
/** Frozen to the stable 100svh Hero height; mobile browser chrome must not move thresholds. */
let mobileTriggerViewportHeight = 0
let mobileTriggerViewportWidth = 0
/** Per-host width guard: browser chrome may emit height-only resize events. */
let surfaceViewportWidth = 0
let mobileCaseHandoffY: { forwardY: number } | null = null
/** Reverse fires only after the Cases section has entered, then crossed 90% upward. */
let mobileCaseReverseArmed = false
let caseReverseIntentPx = 0
let lastCaseSectionTop: number | null = null
/** Scroll scrub progress target / live (lagged) — 0…1 along hero→stone. */
let scrubTargetP = 0
let scrubLiveP = 0
let liveBox: SurfaceBox | null = null
/** Anchor trips hold a viewport pose, then fly directly to the current scroll pose. */
let anchorMotion: {
  phase: 'scroll' | 'settle'
  from: SurfaceVisualSnapshot
  route: SurfaceRouteDecision
  elapsed: number
  updatedAt: number
  targetId: HomeAnchorTarget | null
  scrollComplete: boolean
  startScrollY: number
  forward: boolean
  scrollTop: number
  fromScrollY: number
} | null = null
let anchorSample: SurfaceVisualSnapshot | null = null
let removeAnchorMotionOwner: (() => void) | null = null
const ANCHOR_SURFACE_DURATION_MS = HOME_ANCHOR_TIMING.morphDurationMs
/** Stable compositor basis for the expensive mobile Kado → Cases flight. */
let mobileCaseTransformBasis: SurfaceBox | null = null
/** Snapshot used as hop tween start (destination tracks live each frame). */
let hopFromBox: SurfaceBox | null = null
let hopProgress = 0
/** Last good Kado box in *document* space — viewport via docToViewport. */
let lastWordDoc: SurfaceBox | null = null
/** Pin host currently holding the frame (term/word slot). */
let pinHost: HTMLElement | null = null
let pinRo: ResizeObserver | null = null
type SurfaceProxyKind = 'kado' | 'case' | 'formats' | 'about' | 'contact'
let proxyHost: HTMLElement | null = null
let proxyKind: SurfaceProxyKind | null = null
let caseMediaRevealTimer = 0
/** performance.now() until which reverse stage hops are ignored. */
let stageLockUntil = 0

let raf = 0
let lastTs = 0
let parseEase: ((name: string) => (t: number) => number) | null = null

const IDLE_EPS = 0.02

function useMobileCorridor() {
  return isAppleTouchDevice() || isNarrowViewport() || isCoarsePointer()
}

function nearTarget() {
  if (!Number.isFinite(live.h) || !Number.isFinite(live.v)) return true
  if (!Number.isFinite(target.h) || !Number.isFinite(target.v)) return true
  return (
    Math.abs(live.h - target.h) < 0.0008
    && Math.abs(live.v - target.v) < 0.0008
  )
}

function sectionOf(el: HTMLElement) {
  return (el.closest('section') as HTMLElement | null) ?? el
}

function stableMobileTriggerViewportHeight() {
  const width = window.innerWidth
  if (!mobileTriggerViewportHeight || width !== mobileTriggerViewportWidth) {
    const appScreenHeight = shellEl.value?.getBoundingClientRect().height ?? 0
    mobileTriggerViewportHeight = Math.max(1, appScreenHeight || window.innerHeight)
    mobileTriggerViewportWidth = width
  }
  return mobileTriggerViewportHeight
}

function stableViewportHeight() {
  return Math.max(1, shellEl.value?.getBoundingClientRect().height || window.innerHeight)
}

/** Scroll where the complete 16:9 Hero surface, including its lower margin, fits. */
function heroRevealScrollY(section: HTMLElement) {
  const sectionTop = section.getBoundingClientRect().top + window.scrollY
  return Math.max(sectionTop, sectionTop + section.offsetHeight - stableViewportHeight())
}

function syncStageRest(pose: SurfaceBox) {
  if (anchorSample) {
    anchorSample.stage = { ...pose }
    return
  }
  stageRest.top = pose.top
  stageRest.left = pose.left
  stageRest.w = Math.max(1, pose.width)
  stageRest.h = Math.max(1, pose.height)
}

function stageRestBox(): SurfaceBox {
  return {
    top: stageRest.top,
    left: stageRest.left,
    width: stageRest.w,
    height: stageRest.h,
  }
}

function roundBox(box: SurfaceBox): SurfaceBox {
  return {
    top: Math.round(box.top),
    left: Math.round(box.left),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  }
}

/** Subpixel box for morph paint — integer round caused stair-steps on slow scrub. */
function morphBox(box: SurfaceBox): SurfaceBox {
  return {
    top: box.top,
    left: box.left,
    width: Math.max(1, box.width),
    height: Math.max(1, box.height),
  }
}

const BOX_EPS = 0.04

function boxesNear(a: SurfaceBox, b: SurfaceBox) {
  return (
    Math.abs(a.top - b.top) < BOX_EPS
    && Math.abs(a.left - b.left) < BOX_EPS
    && Math.abs(a.width - b.width) < BOX_EPS
    && Math.abs(a.height - b.height) < BOX_EPS
  )
}

function committedMaskBox(): SurfaceBox {
  return {
    top: flowSurfaceMask.top,
    left: flowSurfaceMask.left,
    width: flowSurfaceMask.width,
    height: flowSurfaceMask.height,
  }
}

function captureDesktopPoses() {
  if (!props.fromEl || !props.toEl) return false

  fromDoc = readDocBox(props.fromEl)
  // Target pose can be 0×0 before the stone image gives the parent height.
  toDoc = readDocBox(props.toEl) ?? (props.stoneEl ? readDocBox(props.stoneEl) : null)
  if (!fromDoc || !toDoc) return false

  const fromSection = sectionOf(props.fromEl)
  const toSection = sectionOf(props.toEl)

  const sectionTop = fromSection.getBoundingClientRect().top + window.scrollY
  const scrollStart = heroRevealScrollY(fromSection)
  heroRestPose = poseAtScrollY(fromDoc, sectionTop)
  fromPose = poseAtScrollY(fromDoc, scrollStart)

  const scrollEnd = scrollYForCenterCenter(toSection)
  toPose = poseAtScrollY(toDoc, scrollEnd)

  if (props.caseMediaEl) {
    lastCaseDoc = readDocBox(props.caseMediaEl)
  }

  mobileActive = false
  syncStageRest(fromPose)
  return true
}

function captureMobilePoses() {
  const hero = props.fromEl
  const stonePoseEl = props.toEl
  const stoneMark = props.stoneEl ?? props.toEl
  const term = props.termEl
  const body = props.bodyEl
  // Word is optional — line-fill creates it later; corridor must boot without it.
  if (!hero || !stonePoseEl || !stoneMark || !term || !body) return false

  const heroDoc = readDocBox(hero)
  const stoneDoc = readDocBox(stonePoseEl)
  if (!heroDoc || !stoneDoc) return false
  if (!readBox(term)) return false

  const heroSection = sectionOf(hero)
  const copyLayout = readMobileHeroCopyLayout(
    heroSection,
    hero,
    stableMobileTriggerViewportHeight(),
  )
  flowSurfaceMask.heroCopyLayout = copyLayout
  scrubEndY = scrollYForTopAt(stoneMark, 0.1)
  scrubStartY = Math.max(
    heroRevealScrollY(heroSection),
    copyLayout ? mobileHeroSurfaceMorphStartScrollY(copyLayout) : heroRevealScrollY(heroSection),
  )

  heroPose = poseAtScrollY(heroDoc, scrubStartY)
  stonePose = poseAtScrollY(stoneDoc, scrubEndY)

  const wordDoc = readDocBox(props.wordEl)
  if (wordDoc) lastWordDoc = wordDoc
  const formatsDoc = readDocBox(props.formatsSurfaceEl)
  if (formatsDoc) lastFormatsDoc = formatsDoc
  mobileCaseHandoffY = null

  mobileActive = true
  flowSurfaceMask.heroReturning = false
  fromPose = heroPose
  toPose = stonePose
  syncStageRest(heroPose)
  const corridorReady = captureMobileScrollBounds()
  if (mobileSectionBootPending.value && !corridorReady) return false
  return true
}

function captureMobileScrollBounds() {
  const stoneMark = props.stoneEl ?? props.toEl
  const stoneDoc = readDocBox(props.toEl)
  const termDoc = readDocBox(pinSlot('term')) ?? readDocBox(props.termEl)
  const wordDoc = readDocBox(pinSlot('word')) ?? readDocBox(props.wordEl) ?? lastWordDoc
  const caseDoc = readDocBox(props.caseMediaEl) ?? lastCaseDoc
  const caseSectionDoc = readDocBox(props.caseSectionEl)
  const formatsSectionDocRaw = readDocBox(props.formatsSectionEl)
  const formatsDocRaw = readDocBox(props.formatsSurfaceEl) ?? lastFormatsDoc
  const formatsListDocRaw = readDocBox(formatsListElement())
  const aboutSectionDocRaw = readDocBox(props.aboutSectionEl)
  const aboutDocRaw = readDocBox(props.aboutSurfaceEl)
  const aboutEndDocRaw = readDocBox(props.aboutEndEl)
  const contactDocRaw = readDocBox(props.contactSurfaceEl)
  if (
    !stoneMark
    || !stoneDoc
    || !termDoc
    || !wordDoc
    || !caseDoc
    || !caseSectionDoc
    || !formatsSectionDocRaw
    || !formatsDocRaw
    || !formatsListDocRaw
    || !aboutSectionDocRaw
    || !aboutDocRaw
    || !aboutEndDocRaw
    || !contactDocRaw
  ) {
    mobileScrollBounds = null
    return false
  }

  // HomeCases removes this spacer as the project leaves. Capture every later
  // waypoint in its final document position now; otherwise Formats/About keep
  // stale pre-collapse coordinates and fire hundreds of pixels too late.
  const collapsingTail = props.caseSectionEl?.querySelector<HTMLElement>(
    '.cases-stage__mobile-tail',
  )
  const collapsingTailHeight = readBox(collapsingTail)?.height ?? 0
  const afterCaseCollapse = (box: SurfaceBox): SurfaceBox => ({
    ...box,
    top: box.top - collapsingTailHeight,
  })
  const formatsSectionDoc = afterCaseCollapse(formatsSectionDocRaw)
  const formatsDoc = afterCaseCollapse(formatsDocRaw)
  const formatsListDoc = afterCaseCollapse(formatsListDocRaw)
  const aboutSectionDoc = afterCaseCollapse(aboutSectionDocRaw)
  const aboutDoc = afterCaseCollapse(aboutDocRaw)
  const aboutEndDoc = afterCaseCollapse(aboutEndDocRaw)
  const contactDoc = afterCaseCollapse(contactDocRaw)

  const viewportHeight = stableMobileTriggerViewportHeight()
  const termStart = scrubEndY
  // Give the first Kado waypoint a short, explicit scroll span, then let it
  // rest until the next marker. The exact duration now belongs to distance,
  // never wall-clock time.
  const termEnd = termStart + Math.max(
    96,
    viewportHeight * MOBILE_KADO_MORPH_SPAN_VH,
  )
  const wordStart = Math.max(
    scrollYForCenterTop(stoneMark),
    termEnd + viewportHeight * MOBILE_KADO_HOLD_VH,
  )
  const wordEnd = wordStart + Math.max(
    112,
    viewportHeight * MOBILE_WORD_MORPH_SPAN_VH,
  )
  const caseStart = Math.max(
    wordDoc.top - viewportHeight * 0.45,
    wordEnd + viewportHeight * MOBILE_WORD_HOLD_VH,
  )
  const caseEnd = Math.max(
    caseStart + viewportHeight * MOBILE_CASE_SCROLL_SPAN_VH,
    caseSectionDoc.top - viewportHeight * 0.9,
  )
  const caseMediaExitSpan = Math.max(
    120,
    viewportHeight * MOBILE_CASE_MEDIA_EXIT_SPAN_VH,
  )
  const caseMediaEnd = caseEnd + caseMediaExitSpan
  // Base case-exit markers. Directional runway is applied while painting so
  // entering the case keeps its accepted timing in either direction.
  const formatsMediaStart = Math.max(
    caseMediaEnd,
    formatsSectionDoc.top - viewportHeight * 1.1,
  )
  const formatsSurfaceHold = Math.max(
    56,
    viewportHeight * MOBILE_CASE_SURFACE_HOLD_VH,
  )
  const formatsStart = formatsMediaStart + formatsSurfaceHold
  const formatsEnd = Math.max(
    formatsStart + viewportHeight * MOBILE_FORMATS_SCROLL_SPAN_VH,
    formatsListDoc.top + MOBILE_FORMATS_REVERSE_OFFSET_PX - viewportHeight,
  )
  // Hand Biography to its DOM slot while the section is still entering. From
  // then on the dark plate scrolls with the title/photo instead of lingering as
  // the full-viewport Formats panel and snapping to the slot much later.
  const aboutStart = Math.max(
    formatsEnd,
    aboutSectionDoc.top - viewportHeight - MOBILE_ABOUT_ENTRY_LEAD_PX,
  )
  const aboutSpan = Math.max(
    1,
    viewportHeight * MOBILE_ABOUT_SCROLL_SPAN_VH,
  )
  const aboutEnd = Math.max(
    aboutStart + aboutSpan,
    aboutSectionDoc.top - viewportHeight * 0.7,
  ) + MOBILE_ABOUT_EXIT_RUNWAY_PX
  const contactStart = Math.max(
    aboutEnd,
    aboutEndDoc.top + aboutEndDoc.height
      - viewportHeight
      - MOBILE_CONTACT_ENTRY_LEAD_PX,
  )
  const contactEnd = Math.max(
    contactStart + 1,
    contactSettleScrollY(contactDoc.top, viewportHeight, collapsingTailHeight),
  )

  mobileScrollBounds = {
    termStart,
    termEnd,
    wordStart,
    wordEnd,
    caseStart,
    caseEnd,
    caseMediaEnd,
    formatsMediaStart,
    formatsStart,
    formatsEnd,
    aboutStart,
    aboutEnd,
    contactStart,
    contactEnd,
    stoneDoc,
    termDoc,
    wordDoc,
    caseDoc,
    formatsDoc,
    formatsListDoc,
    aboutDoc,
    contactDoc,
  }
  lastWordDoc = wordDoc
  lastCaseDoc = caseDoc
  lastFormatsDoc = formatsDoc
  return true
}

function capturePoses() {
  if (useMobileCorridor()) return captureMobilePoses()
  return captureDesktopPoses()
}

/** Mid-page reload / failed capture — align hero visibility to real scroll. */
function bootAlignHeroVisibility() {
  if (!props.fromEl) return
  const section = sectionOf(props.fromEl)
  const top = section.getBoundingClientRect().top + window.scrollY
  const revealEnd = heroRevealScrollY(section)
  const y = window.scrollY
  // Still on the hero rest screen — never boot hidden (bad marker layout used to force morph=1).
  if (y <= revealEnd + window.innerHeight * 0.35) {
    flowSurfaceMask.morph = 0
    applyFlowSurfaceLive('hero')
    return
  }
  if (y > top + window.innerHeight * 0.12) {
    flowSurfaceMask.morph = 1
    applyFlowSurfaceLive('kado')
  }
}

/** Stone / scrub span must be real — collapsed layout falsely trips every hop. */
function markersReliable(): boolean {
  const stone = props.stoneEl
  if (!stone) return false
  if (stone.getBoundingClientRect().height < 120) return false
  if (!(scrubEndY > scrubStartY + window.innerHeight * 0.45)) return false
  return true
}

/** Paint hero rest even when full corridor capture is not ready yet. */
function ensureHeroRestPlaceholder() {
  if (!props.fromEl || !frame.value) return
  const doc = readDocBox(props.fromEl)
  if (!doc) return
  const section = sectionOf(props.fromEl)
  const revealEnd = heroRevealScrollY(section)
  const pose = poseAtScrollY(doc, Math.min(window.scrollY, revealEnd))
  syncStageRest(pose)
  if (window.scrollY <= revealEnd + window.innerHeight * 0.35) {
    // The cold intro mask is forest. Prepare the exact same live backing before
    // announcing readiness so its one-frame handoff can never expose stone.
    paintKadoSurfaceTone()
    if (useMobileCorridor() && window.scrollY < revealEnd - 0.5) {
      pinMobileHeroRevealFrame(pose)
      announceSurfaceReady()
      return
    }
    paintBox(pose, 0)
    announceSurfaceReady()
  }
}

function writeMaskBox(box: SurfaceBox, morph: number) {
  flowSurfaceMask.top = box.top
  flowSurfaceMask.left = box.left
  flowSurfaceMask.width = Math.max(1, box.width)
  flowSurfaceMask.height = Math.max(1, box.height)
  flowSurfaceMask.morph = Math.min(1, Math.max(0, morph))
  applyFlowSurfaceLive(flowSurfaceLiveFromMorph(morph, IDLE_EPS))
}

function viewportToDoc(box: SurfaceBox): SurfaceBox {
  return {
    ...box,
    top: box.top + window.scrollY,
    left: box.left + window.scrollX,
  }
}

function paintBox(box: SurfaceBox, morph: number) {
  if (anchorSample) {
    anchorSample.box = box
    anchorSample.morph = morph
    return
  }
  if (!frame.value || pinTo.value || proxyParked.value) return
  const next = morphBox(box)
  // Desktop keeps the Hero stage in one stable viewport pose while the Surface
  // window moves around it. Mobile keeps the stage attached to the window: its
  // old counter-shift exposed an empty strip above the 3D scene during morph.
  // Write in the same turn as the frame box so the two layers cannot diverge.
  // This must happen before the box dedupe: a layout recapture may move the
  // stage rest pose even when the visible Surface rectangle itself is unchanged.
  const stageTop = mobileActive ? 0 : stageRest.top - next.top
  const stageLeft = mobileActive ? 0 : stageRest.left - next.left
  frame.value.style.setProperty(
    '--hero-stage-top',
    `${stageTop.toFixed(3)}px`,
  )
  frame.value.style.setProperty(
    '--hero-stage-left',
    `${stageLeft.toFixed(3)}px`,
  )
  // The mobile stage stays attached to its crop to avoid exposed edges, but
  // the slogan itself must remain centred in the viewport while the crop moves
  // and narrows toward Kado.
  const heroCopyX = mobileActive
    ? window.innerWidth * 0.5 - next.left - stageRest.w * 0.5
    : 0
  frame.value.style.setProperty('--hero-copy-x', `${heroCopyX.toFixed(3)}px`)
  const frameGeometryChanged = !liveBox || !boxesNear(next, liveBox)
  const maskGeometryChanged = !boxesNear(next, committedMaskBox())
  const morphChanged = Math.abs(flowSurfaceMask.morph - morph) >= 0.001

  // This is the atomic Surface paint commit. A KeepAlive activation or a late
  // mask publisher can leave the shared SVG geometry behind even when the
  // frame's local liveBox is already correct. Dedupe only when every channel
  // agrees; otherwise repair mask/path in the same turn as the frame.
  writeMaskBox(next, morph)
  if (!frameGeometryChanged && !maskGeometryChanged && !morphChanged) return

  liveBox = next
  if (frameGeometryChanged) {
    if (mobileCaseTransformBasis) {
      applyBoxVisualTransform(frame.value, next, mobileCaseTransformBasis)
    } else {
      applyBox(frame.value, next)
    }
  }
  flushFlowSurfacePath(next)
}

function publishHeroHorizontalMorph(value: number) {
  const next = clampUnit(value)
  if (anchorSample) {
    anchorSample.horizontalMorph = next
    return
  }
  flowSurfaceMask.heroHorizontalMorph = next
}

/** Keep the Surface's layout box fixed while its mobile case flight is live. */
function beginMobileCaseTransformPaint() {
  const el = frame.value
  if (!el || mobileCaseTransformBasis) return
  const basis = liveBox ?? readBox(el)
  if (!basis) return
  mobileCaseTransformBasis = { ...basis }
  el.style.willChange = 'transform'
  applyBoxVisualTransform(el, basis, mobileCaseTransformBasis)
}

/** Materialize the last compositor pose before another segment takes ownership. */
function endMobileCaseTransformPaint(materialize = true) {
  const el = frame.value
  if (!mobileCaseTransformBasis) return
  mobileCaseTransformBasis = null
  el?.style.removeProperty('will-change')
  if (
    materialize
    && el
    && liveBox
    && !pinTo.value
    && !proxyParked.value
  ) {
    applyBox(el, liveBox)
  }
}

function heroLivePose(): SurfaceBox | null {
  return readBox(props.fromEl) ?? (fromDoc ? docToViewport(fromDoc) : null)
}

/** Scroll-owned pre-morph travel: Hero rest pose ↔ fully visible morph pose. */
function desktopHeroRevealProgress(scrollY = window.scrollY) {
  const hero = props.fromEl
  if (!hero) return 0
  const section = sectionOf(hero)
  const sectionTop = section.getBoundingClientRect().top + window.scrollY
  const revealEnd = heroRevealScrollY(section)
  const span = revealEnd - sectionTop
  if (span <= 1) return 0
  return clampUnit((revealEnd - scrollY) / span)
}

function desktopHeroRevealTarget(scrollY = window.scrollY) {
  return -desktopHeroRevealProgress(scrollY) * DESKTOP_HERO_REVEAL_CLOCK_SPAN
}

function paintDesktopHeroReveal(s: number) {
  const start = fromPose
  const rest = heroRestPose
  if (!start || !rest) return
  const progress = clampUnit(-s / DESKTOP_HERO_REVEAL_CLOCK_SPAN)
  const pose = lerpBox(start, rest, progress)
  syncStageRest(pose)
  paintKadoSurfaceTone()
  publishHeroHorizontalMorph(0)
  paintBox(pose, 0)
}

/**
 * The Hero frame is still an in-flow surface here, so its forward motion must
 * be committed in the same applied-scroll turn as the DOM slot. Running this
 * short range through the lagged corridor leaves the fixed WebGL frame several
 * pixels behind on a fresh wheel gesture and then visibly pulls it upward.
 * Reverse travel keeps the authored velocity limit used by the Hero return.
 */
function paintForwardHeroRevealFrame(scrollFrame: AppliedScrollFrame) {
  if (
    scrollFrame.direction < 0
    || !trigger
    || !fromPose
    || !heroRestPose
    || desktopLiveS > 0
  ) return false

  const next = desktopHeroRevealTarget(scrollFrame.y)
  if (next > 0 || next < desktopLiveS) return false
  desktopTargetS = next
  desktopLiveS = next
  paintDesktopHeroReveal(next)
  return true
}

function heroRevealFramePinned() {
  return !!props.fromEl && pinTo.value === props.fromEl
}

/**
 * Before the mobile morph starts, let the real Hero slot own the live frame.
 * Native touch scroll can then move scene, slogan and crop in one compositor
 * layer instead of JS chasing the in-flow slot with viewport coordinates.
 */
function pinMobileHeroRevealFrame(pose?: SurfaceBox | null) {
  const host = props.fromEl
  const el = frame.value
  if (!host || !el) return
  const box = pose ?? readBox(host)
  if (!box) return
  if (anchorSample) {
    syncStageRest(box)
    paintBox(box, 0)
    return
  }

  syncStageRest(box)
  el.style.setProperty('--hero-stage-top', '0px')
  el.style.setProperty('--hero-stage-left', '0px')
  el.style.setProperty(
    '--hero-copy-x',
    `${(window.innerWidth * 0.5 - box.left - box.width * 0.5).toFixed(3)}px`,
  )
  liveBox = morphBox(box)
  writeMaskBox(liveBox, 0)
  flushFlowSurfacePath(liveBox)

  if (heroRevealFramePinned()) return
  if (frameDocked()) {
    unpinFrame(flowSurfaceMask.morph)
    void nextTick(() => pinMobileHeroRevealFrame())
    return
  }

  // Preserve the current viewport pose until Teleport has moved the frame.
  el.style.position = 'fixed'
  applyBox(el, box)
  pinHost = host
  pinTo.value = host
  void nextTick(() => {
    if (!frame.value || pinTo.value !== host) return
    frame.value.style.position = 'absolute'
    frame.value.style.top = '0px'
    frame.value.style.left = '0px'
    frame.value.style.width = '100%'
    frame.value.style.height = '100%'
    frame.value.style.right = 'auto'
    frame.value.style.bottom = 'auto'
    frame.value.style.transform = ''
  })
}

function caseMediaPose(): SurfaceBox | null {
  const box = readBox(props.caseMediaEl)
  if (box) {
    lastCaseDoc = {
      top: box.top + window.scrollY,
      left: box.left + window.scrollX,
      width: box.width,
      height: box.height,
    }
    return box
  }
  return lastCaseDoc ? docToViewport(lastCaseDoc) : null
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothUnit(value: number) {
  const t = clampUnit(value)
  return t * t * (3 - 2 * t)
}

function caseMediaApproachOpacity(progress: number) {
  return smoothUnit(
    (progress - CASE_MEDIA_REVEAL_START_P) / (1 - CASE_MEDIA_REVEAL_START_P),
  )
}

function caseMediaExitOpacity(progress: number) {
  return 1 - smoothUnit(progress / CASE_MEDIA_EXIT_END_P)
}

let lastCaseToneCss = ''

function currentSurfaceTone() {
  return frame.value?.style.getPropertyValue('--flow-surface-tone')
    || 'var(--palette-stone)'
}

/** Tone publication participates in destination sampling like geometry does. */
function publishSurfaceTone(css: string) {
  const resolved = css || 'var(--palette-stone)'
  if (anchorSample) {
    anchorSample.tone = resolved
    return
  }
  const el = frame.value
  if (!el || css === lastCaseToneCss) return
  lastCaseToneCss = css
  if (css) el.style.setProperty('--flow-surface-tone', css)
  else el.style.removeProperty('--flow-surface-tone')
}

/** Keep the Hero field's edge colour when the Surface settles under the stone. */
function paintKadoSurfaceTone() {
  publishSurfaceTone('var(--hero-scene-forest)')
}

/** Return from the green Kado plate to the neutral project surface. */
function paintKadoToCaseSurfaceTone(progress: number) {
  const mix = clampUnit(progress)
  if (mix <= 0.001) {
    paintKadoSurfaceTone()
    return
  }
  if (mix >= 0.999) {
    paintCaseSurfaceTone()
    return
  }

  const stonePercent = Math.round(mix * 1000) / 10
  const greenPercent = Math.round((100 - stonePercent) * 10) / 10
  const css = `color-mix(in srgb, var(--hero-scene-forest) ${greenPercent}%, var(--palette-stone) ${stonePercent}%)`
  publishSurfaceTone(css)
}

function paintCaseSurfaceTone() {
  publishSurfaceTone('')
}

function paintSurfaceUnderCaseMedia(
  box: SurfaceBox,
  mediaOpacity: number,
  kadoExitProgress = 1,
) {
  paintKadoToCaseSurfaceTone(kadoExitProgress)
  // Reach the inset before the raster becomes opaque. The exact integer inset
  // prevents independently composited rounded edges from exposing stone pixels.
  const inset = CASE_MEDIA_SURFACE_INSET_PX
    * smoothUnit(clampUnit(mediaOpacity) / 0.08)
  paintBox({
    top: box.top + inset,
    left: box.left + inset,
    width: Math.max(1, box.width - inset * 2),
    height: Math.max(1, box.height - inset * 2),
  }, 1)
}

let caseMediaFlightEl: HTMLElement | null = null

function getCaseMediaFlightEl() {
  if (caseMediaFlightEl?.isConnected) return caseMediaFlightEl
  caseMediaFlightEl = props.caseMediaEl?.querySelector<HTMLElement>(
    '[data-case-local-media]',
  ) ?? null
  return caseMediaFlightEl
}

function clearCaseMediaFlight() {
  const host = props.caseMediaEl
  const ownsInlineGeometry = host?.hasAttribute('data-case-media-flight') ?? false
  host?.removeAttribute('data-case-media-flight')
  host?.removeAttribute('data-case-media-source-fade')
  if (!ownsInlineGeometry) return
  const media = getCaseMediaFlightEl()
  if (!media) return
  for (const property of [
    'position',
    'inset',
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'opacity',
    'transition',
    'transform',
    'transform-origin',
    'will-change',
  ]) {
    media.style.removeProperty(property)
  }
}

/**
 * Keep the local raster in the exact live Surface box. Width and height are
 * animated as layout dimensions rather than CSS scale, so object-fit keeps
 * cropping the image instead of stretching it.
 */
function paintCaseMediaFlight(
  box: SurfaceBox,
  _caseBox: SurfaceBox,
  opacity: number,
) {
  if (anchorSample) return
  const media = getCaseMediaFlightEl()
  const host = props.caseMediaEl
  const visible = opacity > 0.002
  setCaseMediaVisible(visible)
  if (!media || !host || !visible) {
    clearCaseMediaFlight()
    return
  }

  if (!host.hasAttribute('data-case-media-flight')) {
    // HomeCases owns an optional local geometry FLIP. Revoke that ownership
    // synchronously before this host writes fixed viewport geometry; otherwise
    // two GSAP/CSS writers can split the raster from the Surface after scroll.
    host.dispatchEvent(new Event(CASE_MEDIA_FLIGHT_START_EVENT))
  }
  host.setAttribute('data-case-media-flight', '')
  // Surface and raster must live in the same viewport coordinate system.
  // Absolute coordinates inside the scrolling case figure were numerically
  // correct, but WebKit composited that scroller a frame apart from the fixed
  // Surface and exposed their edges during touch movement.
  media.style.position = 'fixed'
  media.style.inset = 'auto'
  media.style.left = '0px'
  media.style.top = '0px'
  media.style.right = 'auto'
  media.style.bottom = 'auto'
  media.style.width = `${Math.max(1, box.width)}px`
  media.style.height = `${Math.max(1, box.height)}px`
  media.style.opacity = `${clampUnit(opacity)}`
  media.style.transition = 'none'
  media.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`
  media.style.transformOrigin = 'top left'
  media.style.willChange = 'transform, width, height, opacity'
}

function mobileFormatsBox(track: SurfaceBox, list: SurfaceBox): SurfaceBox {
  // Mobile Formats owns one viewport rectangle, not the list's full document
  // track. Its top follows the actual list until it reaches the screen margin;
  // the other three sides retain the same margin throughout the section.
  const edge = Math.max(8, track.left)
  const viewportBottom = stableMobileTriggerViewportHeight() - edge
  const top = Math.min(
    viewportBottom - 1,
    Math.max(edge, list.top),
  )

  return {
    top,
    left: edge,
    width: Math.max(1, window.innerWidth - edge * 2),
    height: Math.max(1, viewportBottom - top),
  }
}

/** Final mobile Formats state: a stable, nearly full-viewport panel. */
function mobileFormatsSettledBox(track: SurfaceBox): SurfaceBox {
  const edge = Math.max(8, track.left)
  const viewportHeight = stableMobileTriggerViewportHeight()

  return {
    top: edge,
    left: edge,
    width: Math.max(1, window.innerWidth - edge * 2),
    height: Math.max(1, viewportHeight - edge * 2),
  }
}

function formatsSurfacePose(listPose?: SurfaceBox | null): SurfaceBox | null {
  if (!props.formatsSurfaceEl) return null
  if (!isNarrowViewport()) return readBox(props.formatsSurfaceEl)
  if (!lastFormatsDoc) lastFormatsDoc = readDocBox(props.formatsSurfaceEl)
  const track = readBox(props.formatsSurfaceEl)
    ?? (lastFormatsDoc ? docToViewport(lastFormatsDoc) : null)
  const list = listPose ?? readBox(formatsListElement())
  if (!track || !list) return null
  return mobileFormatsBox(track, list)
}

function formatsListElement(): HTMLElement | null {
  return props.formatsSectionEl?.querySelector<HTMLElement>('.work-formats__list')
    ?? null
}

function aboutSurfacePose(): SurfaceBox | null {
  return readBox(props.aboutSurfaceEl)
}

function contactSurfacePose(): SurfaceBox | null {
  return readBox(props.contactSurfaceEl)
}

function contactSettleScrollY(surfaceDocTop: number, viewportHeight: number, anchorShift = 0) {
  const naturalEnd = surfaceDocTop - viewportHeight * CONTACT_SETTLE_VIEWPORT_P
  const mobile = useMobileCorridor()
  const anchor = mobile
    ? document.getElementById('contact')
    : document.querySelector<HTMLElement>('[data-contact-photo-boundary]')
  if (!anchor) return naturalEnd
  const anchorStopY = window.scrollY + anchor.getBoundingClientRect().top
    - anchorShift - (mobile ? 0 : window.innerHeight)
  return Math.min(naturalEnd, anchorStopY - CONTACT_ANCHOR_SETTLE_LEAD_PX)
}

function setContactStageProgress(progress: number) {
  const next = clampUnit(progress)
  if (anchorSample) {
    anchorSample.contactProgress = next
    return
  }
  contactStageProgress.value = next
}

let lastAboutTitleClip = ''
let lastAboutTitleOpacity = ''

function clearAboutTitleContrast() {
  if (anchorSample) {
    anchorSample.aboutOpacity = 0
    return
  }
  const el = props.aboutTitleEl
  const clip = 'inset(0 100% 0 0)'
  if (!el || lastAboutTitleClip === clip) return
  lastAboutTitleClip = clip
  el.style.setProperty('--about-title-clip', clip)
}

function paintAboutTitleOpacity(opacity: number) {
  const el = props.aboutTitleEl
  if (!el) return
  const css = clampUnit(opacity).toFixed(3)
  if (css === lastAboutTitleOpacity) return
  lastAboutTitleOpacity = css
  el.style.setProperty('--about-title-inverse-opacity', css)
}

/**
 * Reveal the light duplicate only where the live Surface intersects the title.
 * This keeps both halves legible while the moving edge is still crossing text.
 */
function paintAboutTitleContrast(surface: SurfaceBox, opacity = 1) {
  if (anchorSample) {
    anchorSample.aboutOpacity = opacity
    return
  }
  const el = props.aboutTitleEl
  const title = readBox(el)
  if (!el || !title) {
    clearAboutTitleContrast()
    return
  }
  paintAboutTitleOpacity(opacity)

  const surfaceRight = surface.left + surface.width
  const surfaceBottom = surface.top + surface.height
  const titleRight = title.left + title.width
  const titleBottom = title.top + title.height
  const left = Math.max(title.left, surface.left)
  const top = Math.max(title.top, surface.top)
  const right = Math.min(titleRight, surfaceRight)
  const bottom = Math.min(titleBottom, surfaceBottom)

  if (right <= left || bottom <= top) {
    clearAboutTitleContrast()
    return
  }

  const bottomBleed = isNarrowViewport()
    ? MOBILE_ABOUT_TITLE_CLIP_BLEED_PX
    : 0
  const clip = `inset(${Math.max(0, top - title.top).toFixed(1)}px ${Math.max(0, titleRight - right).toFixed(1)}px ${(titleBottom - bottom - bottomBleed).toFixed(1)}px ${Math.max(0, left - title.left).toFixed(1)}px)`
  if (clip === lastAboutTitleClip) return
  lastAboutTitleClip = clip
  el.style.setProperty('--about-title-clip', clip)
}

function paintAboutSurfaceTone(progress: number) {
  const mix = clampUnit(progress)
  if (mix <= 0.001) {
    publishSurfaceTone('')
    return
  }

  const forestPercent = Math.round(mix * 1000) / 10
  const stonePercent = Math.round((100 - forestPercent) * 10) / 10
  const css = forestPercent >= 99.9
    ? 'var(--hero-scene-forest)'
    : `color-mix(in srgb, var(--palette-stone) ${stonePercent}%, var(--hero-scene-forest) ${forestPercent}%)`
  publishSurfaceTone(css)
}

/** Live kado stone box — tracks element bounding box in viewport. */
function kadoLivePose(): SurfaceBox | null {
  return (
    readBox(props.toEl)
    ?? readBox(props.stoneEl)
    ?? (toDoc ? docToViewport(toDoc) : null)
  )
}

function computeDesktopTarget(): number {
  if (contactTrigger && contactTrigger.progress > 0) {
    return 4 + Math.min(1, Math.max(0, contactTrigger.progress))
  }
  if (aboutTrigger && aboutTrigger.progress > 0) {
    return 3 + Math.min(1, Math.max(0, aboutTrigger.progress))
  }
  if (formatsTrigger && formatsTrigger.progress > 0) {
    return 2 + Math.min(1, Math.max(0, formatsTrigger.progress))
  }
  if (caseTrigger && caseTrigger.progress > 0) {
    return 1 + Math.min(1, Math.max(0, caseTrigger.progress))
  }
  if (trigger) {
    const progress = Math.min(1, Math.max(0, trigger.progress))
    if (progress > 0) return progress
  }
  return desktopHeroRevealTarget()
}

function paintHeroToKadoSegment(t: number) {
  setContactStageProgress(0)
  clearAboutTitleContrast()
  if (
    caseSurfaceDocked.value
    || caseMediaActive
    || caseSurfaceReady.value
    || caseMediaVisible.value
  ) {
    caseMediaActive = false
    setSurfaceDocked(false)
    setSurfaceReady(false)
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
  }
  paintKadoSurfaceTone()

  const { h, v } = targetsFromScrollProgress(props.plan, t, parseEase ?? ((_) => (u) => u))
  live.h = h
  live.v = v
  // `morph` is min(h, v), so it reaches zero before the width has finished
  // opening on reverse. Publish the real horizontal clock for the outside-Hero
  // copy; otherwise a fast jump to scrollY=0 exposes it under a narrow Surface.
  publishHeroHorizontalMorph(h)

  const hero = fromPose ?? heroLivePose()
  const kado = kadoLivePose()
  if (!hero && !kado) return
  if (!hero) {
    paintBox(kado!, 1)
    return
  }
  if (!kado) {
    paintBox(hero, 0)
    return
  }

  const box = mixBox(hero, kado, h, v)
  const morph = Math.min(h, v)
  paintBox(box, morph)
}

function paintKadoToCasesSegment(t: number) {
  setContactStageProgress(0)
  clearAboutTitleContrast()
  const docked = t >= CASE_PARK_P
  if (docked !== caseMediaActive) {
    caseMediaActive = docked
    setSurfaceDocked(docked)
  }
  const from = kadoLivePose()
  const to = caseMediaPose()
  if (!from && !to) return
  if (!to) {
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    paintBox(from!, 1)
    return
  }
  if (!from) {
    paintBox(to, 1)
    setCaseMediaVisible(true)
    clearCaseMediaFlight()
    return
  }
  if (t >= CASE_PIN_P) {
    // Desktop remains in the fixed host. Teleporting the fully arrived frame
    // into the case figure forces a one-frame repaint in Chromium, visible as
    // a flash both on first Kado → Cases scroll and under the return proxy.
    if (mobileActive) pinCaseFrame()
    else {
      paintSurfaceUnderCaseMedia(to, 1)
      setSurfaceReady(true)
    }
    setCaseMediaVisible(true)
    clearCaseMediaFlight()
    return
  }
  setSurfaceReady(false)
  if (caseFramePinned()) unpinFrame()
  // t===1 -> case pose; t===0 -> live stone. Same path both ways, no seam.
  const box = lerpBox(from, to, t)
  const mediaOpacity = caseMediaApproachOpacity(t)
  paintSurfaceUnderCaseMedia(box, mediaOpacity, t)
  paintCaseMediaFlight(box, to, mediaOpacity)
}

function paintCasesToFormatsSegment(t: number) {
  setContactStageProgress(0)
  clearAboutTitleContrast()
  const from = caseMediaPose()
  const to = formatsSurfacePose()
  if (!from && !to) return

  if (t > SURFACE_MORPH_EPSILON) {
    if (caseMediaActive) {
      caseMediaActive = false
    }
    if (caseSurfaceDocked.value) setSurfaceDocked(false)
    if (caseSurfaceReady.value) setSurfaceReady(false)
  } else if (!caseMediaActive || !caseSurfaceReady.value) {
    caseMediaActive = true
    setSurfaceDocked(true)
    setSurfaceReady(true)
  }

  if (!to) {
    paintBox(from!, 1)
    setCaseMediaVisible(true)
    clearCaseMediaFlight()
    return
  }
  if (!from) {
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    paintBox(to, 1)
    return
  }
  const box = lerpBox(from, to, t)
  if (t <= SURFACE_MORPH_EPSILON) {
    paintBox(box, 1)
    setCaseMediaVisible(true)
    clearCaseMediaFlight()
  } else {
    const mediaOpacity = caseMediaExitOpacity(t)
    paintSurfaceUnderCaseMedia(box, mediaOpacity)
    paintCaseMediaFlight(box, from, mediaOpacity)
  }
}

function paintFormatsToAboutSegment(t: number) {
  setContactStageProgress(0)
  const from = formatsSurfacePose()
  const to = aboutSurfacePose()
  if (!from && !to) {
    clearAboutTitleContrast()
    return
  }

  caseMediaActive = false
  if (caseSurfaceDocked.value) setSurfaceDocked(false)
  if (caseSurfaceReady.value) setSurfaceReady(false)
  setCaseMediaVisible(false)
  clearCaseMediaFlight()

  const box = from && to
    ? lerpBox(from, to, t)
    : (to ?? from)!
  paintAboutSurfaceTone(t)
  paintBox(box, 1)
  paintAboutTitleContrast(box)
}

function paintAboutToContactSegment(t: number) {
  const from = aboutSurfacePose()
  const to = contactSurfacePose()
  if (!from && !to) return

  if (contactFramePinned() && t >= 1 - SURFACE_MORPH_EPSILON) {
    paintAboutSurfaceTone(0)
    clearAboutTitleContrast()
    setContactStageProgress(1)
    syncPinnedMask()
    return
  }

  if (aboutFramePinned() || contactFramePinned()) {
    unpinFrame()
  }

  const box = from && to
    ? lerpBox(from, to, t)
    : (to ?? from)!
  const contactReveal = smoothUnit((t - 0.58) / 0.3)
  paintAboutSurfaceTone(1 - clampUnit(t / CONTACT_TONE_END_P))
  paintBox(box, 1)
  paintAboutTitleContrast(box, 1 - smoothUnit(t / 0.55))
  setContactStageProgress(contactReveal)

  if (t >= 1 - SURFACE_MORPH_EPSILON) pinContactFrame()
}

/**
 * The fullscreen detail-return image already performs the visible flight.
 * Prepare the final FlowSurface geometry underneath it. HomeCases owns the
 * destination raster that the fullscreen proxy dissolves into.
 */
function dockMobileCaseFrameUnderDetailReturn(dest: SurfaceBox) {
  consumeHomeReturnSurface()
  unpinFrame()

  mobileCaseProgress = 1
  mobileCaseArrived = true
  caseMediaActive = true
  setSurfaceReturning(false)
  setSurfaceReady(false)
  setCaseSurfaceDocked(true)
  paintBox(dest, 1)
  pinCaseFrame()
  setCaseMediaVisible(true)
  clearCaseMediaFlight()
}

/**
 * Desktop return uses the fixed transition proxy for the visible flight. Keep
 * every ordinary desktop repaint docked underneath that proxy until the route
 * handoff completes. Without this lock, the restored #cases scroll position
 * paints an earlier Kado → Cases frame; it then remains visible at the old case
 * aspect ratio until the next scroll update.
 */
function dockDesktopCaseFrameUnderDetailReturn(dest: SurfaceBox) {
  if (surfacePaintOwner.value === 'return-dock') {
    returnDockScrollY ??= window.scrollY
  }
  // The visible proxy has completed the Cases waypoint regardless of the hash
  // pin's document offset. Resume the corridor from that painted truth once a
  // real scroll frame explicitly takes ownership again.
  desktopTargetS = DESKTOP_CASE_DOCK_S
  desktopLiveS = DESKTOP_CASE_DOCK_S
  consumeHomeReturnSurface()
  unpinFrame()
  caseMediaActive = true
  setSurfaceReturning(false)
  setCaseSurfaceDocked(true)
  paintSurfaceUnderCaseMedia(dest, 1)
  setSurfaceReady(true)
  setCaseMediaVisible(true)
  clearCaseMediaFlight()
}

function mobileFormatsForwardBoundaryPassed() {
  const caseBox = caseMediaPose()
  return !!caseBox && caseBox.top + caseBox.height * 0.5 <= 0
}

function mobileFormatsReverseBoundaryPassed() {
  const listBox = readBox(formatsListElement()) ?? readBox(props.formatsSurfaceEl)
  return !!listBox
    && listBox.top + MOBILE_FORMATS_REVERSE_OFFSET_PX
      >= stableMobileTriggerViewportHeight()
}

function mobileFormatsShouldBeActive(
  scrollingUp = false,
  scrollingDown = false,
) {
  if (scrollingDown && mobileFormatsForwardBoundaryPassed()) {
    mobileFormatsRequested = true
  } else if (scrollingUp && mobileFormatsReverseBoundaryPassed()) {
    mobileFormatsRequested = false
  }
  return mobileFormatsRequested
}

function killFormatsSettleTween() {
  formatsSettleTween?.kill()
  formatsSettleTween = null
  formatsHopDirection = null
}

/** Forward boundary starts the autonomous Cases → Formats morph. */
function enterMobileFormatsFrame() {
  if (!gsapMod || !frame.value || mobileAboutArrived || aboutSettleTween) return
  if (!mobileCaseArrived || mobileFormatsArrived) return
  if (formatsHopDirection === 'forward' && formatsSettleTween) return

  const from = proxyPose() ?? liveBox ?? readBox(frame.value)
  lastFormatsDoc = readDocBox(props.formatsSurfaceEl) ?? lastFormatsDoc
  const dest = formatsSurfacePose()
  if (!from || !dest) return
  const startProgress = clampUnit(mobileFormatsProgress)
  const duration = Math.max(
    MOBILE_CASE_HOP_MIN_DURATION,
    MOBILE_FORMATS_HOP_DURATION * (1 - startProgress),
  )
  const departWithMedia = caseMediaVisible.value
  const gen = ++formatsHopGen
  killFormatsSettleTween()
  formatsHopDirection = 'forward'
  mobileFormatsArrived = false
  clearCaseMediaReveal()
  unpinFrame()
  caseMediaActive = false
  setSurfaceDocked(false)
  setSurfaceReady(false)

  const startDoc = viewportToDoc(from)
  const proxy = { t: 0 }
  formatsSettleTween = gsapMod.default.to(proxy, {
    t: 1,
    duration: systemReducedMotion() ? 0 : duration,
    ease: MOBILE_CASE_HOP_EASE,
    onUpdate: () => {
      mobileFormatsProgress = startProgress + (1 - startProgress) * proxy.t
      const liveDest = formatsSurfacePose() ?? dest
      const box = lerpBox(docToViewport(startDoc), liveDest, proxy.t)
      const mediaOpacity = caseMediaExitOpacity(mobileFormatsProgress)
      paintSurfaceUnderCaseMedia(box, mediaOpacity)
      const caseBox = lastCaseDoc ? docToViewport(lastCaseDoc) : caseMediaPose()
      if (departWithMedia && caseBox) paintCaseMediaFlight(box, caseBox, mediaOpacity)
      else setCaseMediaVisible(false)
    },
    onComplete: () => {
      if (gen !== formatsHopGen) return
      formatsSettleTween = null
      formatsHopDirection = null
      mobileFormatsProgress = 1
      mobileFormatsArrived = true
      setCaseMediaVisible(false)
      clearCaseMediaFlight()
      paintCaseSurfaceTone()
      lastFormatsDoc = readDocBox(props.formatsSurfaceEl) ?? lastFormatsDoc
      const finalDest = formatsSurfacePose() ?? dest
      paintBox(finalDest, 1)
      pinFormatsFrame()
      void nextTick(() => {
        if (mobileAboutShouldBeActive()) enterMobileAboutFrame()
      })
    },
  })
}

/** Crossing the same threshold upward reverses the autonomous morph. */
function leaveMobileFormatsFrame() {
  if (!gsapMod || !frame.value || mobileAboutArrived || aboutSettleTween) return
  if (formatsHopDirection === 'reverse' && formatsSettleTween) return
  if (!mobileFormatsArrived && !formatsSettleTween) return

  const from = proxyPose() ?? liveBox ?? readBox(frame.value)
  const dest = lastCaseDoc ? docToViewport(lastCaseDoc) : caseMediaPose()
  if (!from || !dest) return
  const startProgress = mobileFormatsArrived
    ? 1
    : clampUnit(mobileFormatsProgress)
  const duration = Math.max(
    MOBILE_CASE_HOP_MIN_DURATION,
    MOBILE_FORMATS_HOP_DURATION * startProgress,
  )
  const gen = ++formatsHopGen
  killFormatsSettleTween()
  formatsHopDirection = 'reverse'
  mobileFormatsArrived = false
  unpinFrame()
  setSurfaceReady(false)

  const startDoc = viewportToDoc(from)
  const destDoc = viewportToDoc(dest)
  const proxy = { t: 0 }
  formatsSettleTween = gsapMod.default.to(proxy, {
    t: 1,
    duration: systemReducedMotion() ? 0 : duration,
    ease: MOBILE_CASE_HOP_EASE,
    onUpdate: () => {
      mobileFormatsProgress = startProgress * (1 - proxy.t)
      const box = docToViewport(lerpBox(startDoc, destDoc, proxy.t))
      const mediaOpacity = caseMediaExitOpacity(mobileFormatsProgress)
      paintSurfaceUnderCaseMedia(box, mediaOpacity)
      const caseBox = lastCaseDoc ? docToViewport(lastCaseDoc) : caseMediaPose()
      if (caseBox) paintCaseMediaFlight(box, caseBox, mediaOpacity)
    },
    onComplete: () => {
      if (gen !== formatsHopGen) return
      formatsSettleTween = null
      formatsHopDirection = null
      mobileFormatsProgress = 0
      mobileCaseArrived = true
      caseMediaActive = true
      setSurfaceDocked(true)
      const finalDest = lastCaseDoc ? docToViewport(lastCaseDoc) : dest
      paintSurfaceUnderCaseMedia(finalDest, 1)
      parkMobileCaseFrame(finalDest, false)
      setCaseMediaVisible(true)
      clearCaseMediaFlight()
    },
  })
}

function mobileAboutShouldBeActive() {
  const section = props.aboutSectionEl
  if (!section) return false
  const engaged = mobileAboutArrived
    || mobileAboutProgress > SURFACE_MORPH_EPSILON
    || !!aboutSettleTween
  const line = stableMobileTriggerViewportHeight()
    + (engaged ? MOBILE_TAIL_TRIGGER_HYSTERESIS_PX : 0)
  return section.getBoundingClientRect().top
    <= line
}

function killAboutSettleTween() {
  aboutSettleTween?.kill()
  aboutSettleTween = null
  aboutHopDirection = null
}

/** Formats → author: expand the stone slot into the dark author panel. */
function enterMobileAboutFrame() {
  if (!gsapMod || !frame.value || !mobileFormatsArrived || mobileAboutArrived) return
  if (aboutHopDirection === 'forward' && aboutSettleTween) return
  const dest = aboutSurfacePose()
  const from = proxyPose() ?? liveBox ?? readBox(frame.value)
  if (!dest || !from) return

  const startProgress = clampUnit(mobileAboutProgress)
  const duration = Math.max(
    MOBILE_CASE_HOP_MIN_DURATION,
    MOBILE_ABOUT_HOP_DURATION * (1 - startProgress),
  )

  const gen = ++aboutHopGen
  killAboutSettleTween()
  aboutHopDirection = 'forward'
  mobileAboutArrived = false
  const wasPinned = frameDocked()
  unpinFrame()

  const startForward = () => {
    if (gen !== aboutHopGen || !gsapMod) return
    let fallbackDest = { ...dest }
    const start = { ...from }
    const startDoc = viewportToDoc(start)
    const destDoc = readDocBox(props.aboutSurfaceEl) ?? viewportToDoc(dest)
    const proxy = { t: 0 }
    aboutSettleTween = gsapMod.default.to(proxy, {
      t: 1,
      duration: systemReducedMotion() ? 0 : duration,
      ease: MOBILE_CASE_HOP_EASE,
      onUpdate: () => {
        mobileAboutProgress = startProgress + (1 - startProgress) * proxy.t
        const box = docToViewport(lerpBox(startDoc, destDoc, proxy.t))
        paintAboutSurfaceTone(mobileAboutProgress)
        paintBox(box, 1)
        paintAboutTitleContrast(box)
      },
      onComplete: () => {
        if (gen !== aboutHopGen) return
        aboutSettleTween = null
        aboutHopDirection = null
        mobileAboutProgress = 1
        mobileAboutArrived = true
        const box = aboutSurfacePose() ?? fallbackDest
        paintAboutSurfaceTone(1)
        paintBox(box, 1)
        paintAboutTitleContrast(box)
        pinAboutFrame()
      },
    })
  }

  if (wasPinned) void nextTick(startForward)
  else startForward()
}

/** Author → formats: reverse the same path and restore the stone tone. */
function leaveMobileAboutFrame() {
  if (!gsapMod || !frame.value) return
  if (!mobileAboutArrived && !aboutSettleTween) return
  if (aboutHopDirection === 'reverse' && aboutSettleTween) return
  const dest = formatsSurfacePose()
  const from = proxyPose() ?? liveBox ?? readBox(frame.value)
  if (!dest || !from) return

  const startProgress = mobileAboutArrived
    ? 1
    : clampUnit(mobileAboutProgress)
  const duration = Math.max(
    MOBILE_CASE_HOP_MIN_DURATION,
    MOBILE_ABOUT_HOP_DURATION * startProgress,
  )

  const gen = ++aboutHopGen
  killAboutSettleTween()
  aboutHopDirection = 'reverse'
  mobileAboutArrived = false
  const wasPinned = frameDocked()
  unpinFrame()

  const startReverse = () => {
    if (gen !== aboutHopGen || !gsapMod) return
    let fallbackDest = { ...dest }
    const start = { ...from }
    const startDoc = readDocBox(props.aboutSurfaceEl) ?? viewportToDoc(start)
    const destDoc = viewportToDoc(dest)
    const proxy = { t: 0 }
    aboutSettleTween = gsapMod.default.to(proxy, {
      t: 1,
      duration: systemReducedMotion() ? 0 : duration,
      ease: MOBILE_CASE_HOP_EASE,
      onUpdate: () => {
        mobileAboutProgress = startProgress * (1 - proxy.t)
        const box = docToViewport(lerpBox(startDoc, destDoc, proxy.t))
        paintAboutSurfaceTone(mobileAboutProgress)
        paintBox(box, 1)
        paintAboutTitleContrast(box)
      },
      onComplete: () => {
        if (gen !== aboutHopGen) return
        aboutSettleTween = null
        aboutHopDirection = null
        mobileAboutProgress = 0
        paintAboutSurfaceTone(0)
        clearAboutTitleContrast()
        pinFormatsFrame()
        void nextTick(() => reconcileFromScroll())
      },
    })
  }

  if (wasPinned) void nextTick(startReverse)
  else startReverse()
}

function killCaseSettleTween() {
  caseSettleTween?.kill()
  caseSettleTween = null
  caseHopDirection = null
  caseHopOppositePx = 0
}

function mobileCaseHopOwnsFrame() {
  return !!caseHopDirection
    || !!caseSettleTween
    || mobileCaseArrived
    || mobileCaseProgress > SURFACE_MORPH_EPSILON
}

function paintDesktop(s = desktopLiveS) {
  if (anchorMotion && !anchorSample) return
  if (mobileActive) return
  if (hopTween) return

  // The hash pin intentionally restores the Cases section itself to the top,
  // not the exact pre-navigation scroll offset. During the proxy return that
  // scroll clock is therefore not authoritative: the proxy is visibly docking
  // into the case figure. Preserve that atomic dock across deferred refreshes
  // and ticks; ordinary scroll ownership resumes after completeDetailReturn().
  if (desktopReturnOwnsPaint()) {
    const dest = caseMediaPose()
    if (dest) {
      dockDesktopCaseFrameUnderDetailReturn(dest)
      return
    }
  }

  if (s < 0) {
    paintDesktopHeroReveal(s)
    return
  }

  // Every morphed desktop segment keeps the Hero scene on the canonical fixed
  // viewport basis. Publish it explicitly so destination sampling cannot
  // inherit a stale Hero-rest basis from an interrupted anchor handoff.
  if (fromPose) syncStageRest(fromPose)

  const { segmentIndex, localT } = resolveCorridorSegment(s, 5)
  if (segmentIndex > 0) publishHeroHorizontalMorph(1)
  if (segmentIndex === 4) {
    paintAboutToContactSegment(localT)
  } else if (segmentIndex === 3) {
    paintFormatsToAboutSegment(localT)
  } else if (segmentIndex === 2) {
    paintCasesToFormatsSegment(localT)
  } else if (segmentIndex === 1) {
    paintKadoToCasesSegment(localT)
  } else {
    paintHeroToKadoSegment(localT)
  }
}

function scrubProgressAt(scrollY: number) {
  const span = scrubEndY - scrubStartY
  // Collapsed / pre-layout span used to map scrollY≈0 → morph≈1 and hide hero on first paint.
  if (!(span > window.innerHeight * 0.45)) {
    if (props.fromEl) {
      const heroTop = sectionOf(props.fromEl).getBoundingClientRect().top
      // Hero still in view → hard rest.
      if (heroTop > -window.innerHeight * 0.25) return 0
    }
    return 0
  }
  return Math.min(1, Math.max(0, (scrollY - scrubStartY) / span))
}

function paintScrubAt(
  p: number,
  mobileFrom: SurfaceBox | null = null,
  mobileTo: SurfaceBox | null = null,
) {
  const from = mobileFrom ?? heroPose
  const to = mobileTo ?? stonePose
  if (!from || !to) {
    ensureHeroRestPlaceholder()
    return
  }
  const t = Math.min(1, Math.max(0, p))
  paintKadoSurfaceTone()
  if (mobileActive) {
    // Carry the complete portrait scene upward over the sticky Hero copy on one
    // linear clock for position, size, silhouette, GL and copy. Splitting this
    // into eased cover/morph phases caused a direction change and a visible
    // hesitation around the title.
    paintBox(lerpBox(from, to, t), t)
    return
  }

  // Desktop keeps box and morph on the same clock.
  paintBox(lerpBox(from, to, t), t)
}

function paintHeroRest() {
  mobileScrubBridge = null
  scrubLiveP = 0
  scrubTargetP = 0
  paintKadoSurfaceTone()
  if (heroPose) paintBox(heroPose, 0)
}

/**
 * Scrub paint. Default: set scroll target and lag toward it.
 * `snap` locks live=target for boot / stage entry.
 */
function paintScrub(scrollY = window.scrollY, snap = false) {
  if (!heroPose || !stonePose) {
    ensureHeroRestPlaceholder()
    return
  }
  const p = scrubProgressAt(scrollY)
  scrubTargetP = p
  if (snap) {
    mobileScrubBridge = null
    scrubLiveP = p
    paintScrubAt(p)
    return
  }
  ensureTick()
}

function progressBetween(scrollY: number, start: number, end: number) {
  return clampUnit((scrollY - start) / Math.max(1, end - start))
}

const MOBILE_CORRIDOR_IDS = [
  'hero-stone',
  'stone-term',
  'term-word',
  'word-cases',
  'cases-formats',
  'formats-about',
  'about-contact',
] as const
type MobileCorridorId = typeof MOBILE_CORRIDOR_IDS[number]

function mobileCaseExitBounds(
  bounds: MobileScrollBounds,
) {
  const formatsStart = Math.min(
    bounds.formatsEnd - 1,
    bounds.formatsStart + MOBILE_CASE_TO_FORMATS_HOLD_PX,
  )

  return {
    caseEnd: bounds.caseEnd,
    caseMediaEnd: bounds.caseMediaEnd,
    formatsMediaStart: Math.min(
      formatsStart,
      bounds.formatsMediaStart + MOBILE_CASE_TO_FORMATS_HOLD_PX,
    ),
    formatsStart,
  }
}

function mobileCorridorRanges(
  bounds: MobileScrollBounds,
): ScrollCorridorRange<MobileCorridorId>[] {
  const exits = mobileCaseExitBounds(bounds)
  return [
    { id: 'hero-stone', start: scrubStartY, end: bounds.termStart },
    { id: 'stone-term', start: bounds.termStart, end: bounds.termEnd },
    { id: 'term-word', start: bounds.wordStart, end: bounds.wordEnd },
    { id: 'word-cases', start: bounds.caseStart, end: exits.caseEnd },
    { id: 'cases-formats', start: exits.formatsStart, end: bounds.formatsEnd },
    { id: 'formats-about', start: bounds.aboutStart, end: bounds.aboutEnd },
    { id: 'about-contact', start: bounds.contactStart, end: bounds.contactEnd },
  ]
}

/** Map native scroll to one ordered Hero → Contact animation clock. */
function mobileCorridorTargetAt(scrollY: number) {
  const bounds = mobileScrollBounds
  if (!bounds) return 0
  return scrollTargetFromCorridor(scrollY, mobileCorridorRanges(bounds))
}

function prepareMobileScrollFlight(useCaseTransform = false) {
  if (anchorSample) return
  clearCaseMediaReveal()
  if (frameDocked()) unpinFrame()
  proxyParked.value = false
  setSurfaceReady(false)
  if (useCaseTransform) beginMobileCaseTransformPaint()
  else endMobileCaseTransformPaint()
}

/** A true DOM-owned hold cannot drift a frame behind native touch scrolling. */
function parkMobileKadoWaypoint(hop: MobileHop, box: SurfaceBox) {
  const host = pinSlot(hop)
  if (!host) {
    prepareMobileScrollFlight()
    paintBox(box, 1)
    return
  }
  if (proxyHost === host && proxyKind === 'kado') return
  paintBox(box, 1)
  parkFrameOnProxy(host, 'kado', box)
}

/** Biography's own dark slot becomes the settled Surface after the morph. */
function parkMobileAboutWaypoint(box: SurfaceBox) {
  const host = props.aboutSurfaceEl
  if (!host) {
    prepareMobileScrollFlight()
    paintBox(box, 1)
    paintAboutTitleContrast(box)
    return
  }
  if (proxyHost === host && proxyKind === 'about') return
  paintBox(box, 1)
  parkFrameOnProxy(host, 'about', box)
  // The static author slot is already ink; its base heading is fully light.
  clearAboutTitleContrast()
}

/** Linear for now; kept as one hook so the complete corridor shares one ease. */
function mobileSurfaceEase(progress: number) {
  return progress
}

function mobileCorridorSettledAt(segment: number) {
  return Math.abs(mobileCorridorS - segment) < SURFACE_MORPH_EPSILON
}

/** Paint the ordered mobile corridor from the authoritative applied-scroll frame. */
function paintMobileScrollCorridor(
  scrollY = window.scrollY,
) {
  if (anchorMotion && !anchorSample) return
  if (!mobileActive || !frame.value) return
  if (mobileScrollBounds) {
    if (mobileCorridorLastY !== null) {
      const delta = scrollY - mobileCorridorLastY
      if (delta > 0.5) mobileCorridorDirection = 'forward'
      else if (delta < -0.5) mobileCorridorDirection = 'reverse'
    }
    mobileCorridorLastY = scrollY
    // The applied scroll frame is already paced by Lenis (or by the browser in
    // native fallback mode). Geometry must use that same clock. Lagging this
    // value again while reading endpoints at the current scrollY creates the
    // characteristic up-then-back correction after Hero is released to fixed.
    mobileCorridorS = mobileCorridorTargetAt(scrollY)
  }

  if (
    scrollY < scrubStartY
    && mobileCorridorSettledAt(0)
  ) {
    mobileStage = 'scrub'
    mobileCaseProgress = 0
    mobileCaseArrived = false
    mobileFormatsProgress = 0
    mobileFormatsArrived = false
    mobileAboutProgress = 0
    mobileAboutArrived = false
    caseMediaActive = false
    setSurfaceDocked(false)
    setSurfaceReady(false)
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    clearAboutTitleContrast()
    paintAboutSurfaceTone(0)
    setContactStageProgress(0)
    pinMobileHeroRevealFrame()
    return
  }
  if (heroRevealFramePinned()) {
    // Native scroll can cross the morph boundary by many pixels in one frame.
    // Release the DOM-owned Hero, then paint the current scrub pose immediately
    // while the frame is still `position: fixed`. Waiting for Teleport's
    // nextTick exposed the already-scrolled Hero pose for one or two frames.
    unpinFrame(0)
    paintMobileScrollCorridor(scrollY)
    // Reconcile once more after Vue has physically restored the frame to the
    // fixed shell; `unpinFrame` keeps the newer liveBox through that move.
    void nextTick(() => paintMobileScrollCorridor(window.scrollY))
    return
  }
  if (!mobileScrollBounds && !captureMobileScrollBounds()) {
    paintScrubAt(scrubProgressAt(scrollY))
    return
  }
  const bounds = mobileScrollBounds!

  const ranges = mobileCorridorRanges(bounds)
  const liveS = Math.max(0, Math.min(ranges.length, mobileCorridorS))
  const { segmentIndex, localT } = resolveCorridorSegment(
    liveS,
    ranges.length,
  )
  const segmentId = ranges[segmentIndex]!.id
  const t = mobileSurfaceEase(localT)
  const exits = mobileCaseExitBounds(bounds)
  // Every adjacent segment shares the same live waypoint box. Previously each
  // side used a snapshot captured at a different scrollY; continuous inertia
  // then exposed a jump at every collapsed hold and made the Surface chase a
  // position that the document element had already left behind.
  const heroNow = heroLivePose() ?? heroPose
  const stoneNow = kadoLivePose() ?? docToViewport(bounds.stoneDoc)
  const termNow = docToViewport(bounds.termDoc)
  const wordNow = wordPose() ?? docToViewport(bounds.wordDoc)
  const caseNow = caseMediaPose() ?? docToViewport(bounds.caseDoc)
  const formatsNow = mobileFormatsSettledBox(
    docToViewport(bounds.formatsDoc),
  )
  const aboutNow = aboutSurfacePose() ?? docToViewport(bounds.aboutDoc)
  const contactNow = contactSurfacePose() ?? docToViewport(bounds.contactDoc)

  // Holds stay in the fixed shell and follow the current document box. Moving
  // the frame into a proxy/Teleport here creates a second coordinate system.
  {
    if (
      mobileCorridorSettledAt(2)
      && scrollY >= bounds.termEnd
      && scrollY < bounds.wordStart
    ) {
      mobileStage = 'term'
      mobileCaseProgress = 0
      mobileCaseArrived = false
      mobileFormatsProgress = 0
      mobileFormatsArrived = false
      mobileAboutProgress = 0
      mobileAboutArrived = false
      caseMediaActive = false
      setSurfaceDocked(false)
      setSurfaceReady(false)
      setCaseMediaVisible(false)
      clearCaseMediaFlight()
      clearAboutTitleContrast()
      paintAboutSurfaceTone(0)
      parkMobileKadoWaypoint('term', docToViewport(bounds.termDoc))
      return
    }
    if (
      mobileCorridorSettledAt(3)
      && scrollY >= bounds.wordEnd
      && scrollY < bounds.caseStart
    ) {
      mobileStage = 'word'
      mobileCaseProgress = 0
      mobileCaseArrived = false
      mobileFormatsProgress = 0
      mobileFormatsArrived = false
      mobileAboutProgress = 0
      mobileAboutArrived = false
      caseMediaActive = false
      setSurfaceDocked(false)
      setSurfaceReady(false)
      setCaseMediaVisible(false)
      clearCaseMediaFlight()
      clearAboutTitleContrast()
      paintAboutSurfaceTone(0)
      parkMobileKadoWaypoint('word', docToViewport(bounds.wordDoc))
      return
    }
    if (
      mobileCorridorSettledAt(4)
      && scrollY >= exits.caseEnd
      && scrollY < exits.formatsStart
    ) {
      const leavingTowardKado = mobileCorridorDirection === 'reverse'
        && scrollY < exits.caseMediaEnd
      const leavingTowardFormats = mobileCorridorDirection === 'forward'
        && scrollY >= exits.formatsMediaStart
      const mediaVisible = !leavingTowardKado && !leavingTowardFormats
      mobileStage = 'word'
      mobileCaseProgress = 1
      mobileCaseArrived = true
      mobileFormatsProgress = 0
      mobileFormatsArrived = false
      mobileAboutProgress = 0
      mobileAboutArrived = false
      caseMediaActive = true
      setSurfaceDocked(true)
      clearAboutTitleContrast()
      paintAboutSurfaceTone(0)
      prepareMobileScrollFlight()
      paintBox(docToViewport(bounds.caseDoc), 1)
      setSurfaceReady(true)
      setCaseMediaVisible(mediaVisible)
      return
    }
    const contactPinned = contactFramePinned()
    if (
      mobileCorridorSettledAt(7)
      && (
        scrollY >= bounds.contactEnd
        || (
          contactPinned
          && mobileCorridorDirection !== 'reverse'
          && scrollY >= bounds.contactEnd - MOBILE_TAIL_TRIGGER_HYSTERESIS_PX
        )
      )
    ) {
      mobileCaseProgress = 1
      mobileCaseArrived = false
      mobileFormatsProgress = 1
      mobileFormatsArrived = false
      mobileAboutProgress = 1
      mobileAboutArrived = false
      caseMediaActive = false
      setSurfaceDocked(false)
      setSurfaceReady(false)
      setCaseMediaVisible(false)
      clearCaseMediaFlight()
      clearAboutTitleContrast()
      paintAboutSurfaceTone(0)
      setContactStageProgress(1)
      pinContactFrame()
      return
    }

    const aboutProxyParked = proxyKind === 'about'
      && proxyHost === props.aboutSurfaceEl
    if (
      mobileCorridorSettledAt(6)
      && (
        (
          scrollY >= bounds.aboutEnd
          && scrollY < bounds.contactStart
        )
        || (
          aboutProxyParked
          && mobileCorridorDirection !== 'reverse'
          && scrollY >= bounds.aboutEnd - MOBILE_TAIL_TRIGGER_HYSTERESIS_PX
          && scrollY < bounds.contactStart
        )
      )
    ) {
      mobileCaseProgress = 1
      mobileCaseArrived = false
      mobileFormatsProgress = 1
      mobileFormatsArrived = false
      mobileAboutProgress = 1
      mobileAboutArrived = true
      caseMediaActive = false
      setSurfaceDocked(false)
      setSurfaceReady(false)
      setCaseMediaVisible(false)
      clearCaseMediaFlight()
      paintAboutSurfaceTone(1)
      setContactStageProgress(0)
      const box = aboutSurfacePose()
      if (box) {
        parkMobileAboutWaypoint(box)
      }
      return
    }
  }

  prepareMobileScrollFlight(segmentId === 'word-cases')
  setSurfaceDocked(false)
  setSurfaceReady(false)
  if (segmentId !== 'about-contact') setContactStageProgress(0)

  if (segmentId === 'hero-stone') {
    prepareMobileScrollFlight()
    mobileStage = 'scrub'
    mobileCaseProgress = 0
    mobileCaseArrived = false
    mobileFormatsProgress = 0
    mobileFormatsArrived = false
    mobileFormatsScrollDirection = null
    mobileAboutProgress = 0
    mobileAboutArrived = false
    caseMediaActive = false
    setSurfaceDocked(false)
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    clearAboutTitleContrast()
    paintAboutSurfaceTone(0)
    paintScrubAt(t, heroNow, stoneNow)
    return
  }

  if (segmentId === 'stone-term') {
    mobileStage = 'term'
    mobileCaseProgress = 0
    mobileCaseArrived = false
    mobileFormatsProgress = 0
    mobileFormatsArrived = false
    mobileAboutProgress = 0
    mobileAboutArrived = false
    caseMediaActive = false
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    clearAboutTitleContrast()
    // Leave the Hero green on the stone, then resolve to the standard neutral
    // Surface while travelling toward “Кадо — путь…”.
    paintKadoToCaseSurfaceTone(t)
    paintBox(lerpBox(stoneNow, termNow, t), 1)
    return
  }

  if (segmentId === 'term-word') {
    mobileStage = 'word'
    mobileCaseProgress = 0
    mobileCaseArrived = false
    mobileFormatsProgress = 0
    mobileFormatsArrived = false
    mobileAboutProgress = 0
    mobileAboutArrived = false
    caseMediaActive = false
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    clearAboutTitleContrast()
    paintCaseSurfaceTone()
    paintBox(lerpBox(termNow, wordNow, t), 1)
    return
  }

  if (segmentId === 'word-cases') {
    mobileStage = 'word'
    mobileCaseProgress = t
    mobileCaseArrived = false
    mobileFormatsProgress = 0
    mobileFormatsArrived = false
    mobileAboutProgress = 0
    mobileAboutArrived = false
    caseMediaActive = true
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    clearAboutTitleContrast()
    paintSurfaceUnderCaseMedia(
      lerpBox(wordNow, caseNow, t),
      caseMediaApproachOpacity(t),
      1,
    )
    return
  }

  if (segmentId === 'cases-formats') {
    mobileCaseProgress = 1
    mobileCaseArrived = false
    mobileFormatsProgress = t
    mobileFormatsArrived = false
    mobileAboutProgress = 0
    mobileAboutArrived = false
    caseMediaActive = false
    clearAboutTitleContrast()
    paintAboutSurfaceTone(0)
    const box = lerpBox(caseNow, formatsNow, t)
    // Media has already completed its own exit in the preceding hold zone.
    // From this boundary onward only the Surface geometry is allowed to move.
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    paintCaseSurfaceTone()
    paintBox(box, 1)
    return
  }

  if (segmentId === 'formats-about') {
    // The gap between formatsEnd and aboutStart is an intentional hold: the
    // corridor resolves this segment at t=0 until Biography actually begins.
    // Projects' collapsing tail can still shift Biography after the corridor
    // was captured. Rebase the endpoint from the live slot so the last flight
    // frame is identical to the pose used by the following DOM-owned hold.
    const box = lerpBox(formatsNow, aboutNow, t)
    const toneProgress = smoothUnit(t / MOBILE_ABOUT_TONE_END_P)
    const titleLightProgress = smoothUnit((toneProgress - 0.35) / 0.45)
    mobileStage = 'word'
    mobileCaseProgress = 1
    mobileCaseArrived = false
    mobileFormatsProgress = 1
    mobileFormatsArrived = false
    mobileAboutProgress = t
    mobileAboutArrived = t >= 1 - SURFACE_MORPH_EPSILON
    caseMediaActive = false
    setSurfaceDocked(false)
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    paintAboutSurfaceTone(toneProgress)
    paintBox(box, 1)
    paintAboutTitleContrast(box, titleLightProgress)
    return
  }

  const box = lerpBox(aboutNow, contactNow, t)
  const contactReveal = smoothUnit((t - 0.55) / 0.32)
  mobileStage = 'word'
  mobileCaseProgress = 1
  mobileCaseArrived = false
  mobileFormatsProgress = 1
  mobileFormatsArrived = false
  mobileAboutProgress = 1
  mobileAboutArrived = false
  caseMediaActive = false
  setSurfaceDocked(false)
  setCaseMediaVisible(false)
  clearCaseMediaFlight()
  // Use raw distance rather than the eased geometry clock, so the colour starts
  // responding on the first scroll pixels and reaches Contact tone by 13%.
  paintAboutSurfaceTone(1 - clampUnit(localT / CONTACT_TONE_END_P))
  paintBox(box, 1)
  paintAboutTitleContrast(box, 1 - smoothUnit(t / 0.55))
  setContactStageProgress(contactReveal)
}

/** Pin slot inside a hop target (`[data-flow-pin]`), else the target itself. */
function pinSlot(hop: MobileHop): HTMLElement | null {
  if (hop === 'term') {
    const term = props.termEl
    if (!term) return null
    return (term.querySelector('[data-flow-pin]') as HTMLElement | null) ?? term
  }
  const word = props.wordEl
  if (!word) return null
  return (word.querySelector('[data-flow-pin]') as HTMLElement | null) ?? word
}

function syncPinnedMask() {
  const el = frame.value
  if (!el || !pinTo.value) return
  const r = el.getBoundingClientRect()
  const box = roundBox({
    top: r.top,
    left: r.left,
    width: Math.max(1, r.width),
    height: Math.max(1, r.height),
  })
  if (
    liveBox
    && box.top === liveBox.top
    && box.left === liveBox.left
    && box.width === liveBox.width
    && box.height === liveBox.height
  ) {
    return
  }
  liveBox = box
  writeMaskBox(box, 1)
  flushFlowSurfacePath(box)
}

function caseFramePinned() {
  return !!props.caseMediaEl
    && (pinTo.value === props.caseMediaEl || (proxyKind === 'case' && proxyHost === props.caseMediaEl))
}

function frameDocked() {
  return !!pinTo.value || !!proxyHost
}

function clearCaseMediaReveal() {
  if (!caseMediaRevealTimer) return
  window.clearTimeout(caseMediaRevealTimer)
  caseMediaRevealTimer = 0
}

function scheduleCaseMediaReveal(delay = MOBILE_CASE_MEDIA_REVEAL_DELAY_MS) {
  clearCaseMediaReveal()
  setCaseMediaVisible(false)
  if (delay <= 0) {
    setCaseMediaVisible(true)
    return
  }
  caseMediaRevealTimer = window.setTimeout(() => {
    caseMediaRevealTimer = 0
    if (
      mobileCaseArrived
      && proxyKind === 'case'
      && proxyHost === props.caseMediaEl
      && !caseSurfaceReturning.value
    ) {
      setCaseMediaVisible(true)
    }
  }, delay)
}

function proxyPose(): SurfaceBox | null {
  if (!proxyHost || !proxyKind) return null
  if (proxyKind === 'formats') return formatsSurfacePose()
  return readBox(proxyHost)
}

function parkFrameOnProxy(
  host: HTMLElement,
  kind: SurfaceProxyKind,
  box: SurfaceBox,
) {
  if (anchorSample) {
    paintBox(box, 1)
    return
  }
  endMobileCaseTransformPaint()
  if (pinTo.value) unpinFrame()
  if (proxyHost && proxyHost !== host) {
    proxyHost.removeAttribute('data-flow-surface-proxy-active')
  }
  const next = morphBox(box)
  liveBox = next
  writeMaskBox(next, 1)
  flushFlowSurfacePath(next)
  proxyHost = host
  proxyKind = kind
  host.setAttribute('data-flow-surface-proxy-active', '')
  proxyParked.value = true
}

/** Mobile case rest: a CSS backplate owns the still frame; the live Surface is free. */
function parkMobileCaseFrame(
  box: SurfaceBox,
  delayMedia = true,
) {
  const host = props.caseMediaEl
  if (!host) return
  clearCaseMediaFlight()
  parkFrameOnProxy(host, 'case', box)
  setSurfaceReady(true)
  scheduleCaseMediaReveal(delayMedia ? MOBILE_CASE_MEDIA_REVEAL_DELAY_MS : 0)
}

/** Compatibility entry for direct mobile docks. */
function pinCaseFrame() {
  const dest = caseMediaPose()
  if (!dest) return
  if (anchorSample) {
    paintSurfaceUnderCaseMedia(dest, 1)
    return
  }
  if (mobileActive) {
    parkMobileCaseFrame(dest, false)
    return
  }
}

/** Settle Formats into its viewport-bound background rectangle. */
function pinFormatsFrame() {
  const dest = formatsSurfacePose()
  const host = props.formatsSurfaceEl
  if (!dest || !host || !frame.value) return
  lastFormatsDoc = readDocBox(host) ?? lastFormatsDoc
  const finalDest = formatsSurfacePose() ?? dest
  setCaseMediaVisible(false)
  clearCaseMediaFlight()
  setSurfaceReady(false)
  paintAboutSurfaceTone(0)
  // The mobile target is viewport-bound (list top → screen bottom), so a
  // document-bound CSS proxy cannot represent it. Keep the real fixed Surface
  // alive and repaint its cheap rectangle on native-scroll updates.
  if (mobileActive) {
    if (frameDocked()) unpinFrame()
    endMobileCaseTransformPaint()
    proxyParked.value = false
    paintBox(finalDest, 1)
    return
  }
  parkFrameOnProxy(host, 'formats', finalDest)
}

function aboutFramePinned() {
  return !!props.aboutSurfaceEl && pinTo.value === props.aboutSurfaceEl
}

/** Attach the settled mobile surface to the author panel. */
function pinAboutFrame() {
  const host = props.aboutSurfaceEl
  const el = frame.value
  if (!host || !el) return
  setCaseMediaVisible(false)
  clearCaseMediaFlight()
  if (pinTo.value === host) {
    syncPinnedMask()
    const box = aboutSurfacePose()
    if (box) paintAboutTitleContrast(box)
    return
  }

  unpinFrame()
  pinHost = host
  el.style.position = 'absolute'
  el.style.top = '0px'
  el.style.left = '0px'
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.transform = ''
  pinTo.value = host

  pinRo?.disconnect()
  pinRo = new ResizeObserver(() => {
    syncPinnedMask()
    const box = aboutSurfacePose()
    if (box) paintAboutTitleContrast(box)
  })
  pinRo.observe(host)
  void nextTick(() => {
    syncPinnedMask()
    const box = aboutSurfacePose()
    if (box) paintAboutTitleContrast(box)
  })
}

function contactFramePinned() {
  return !!props.contactSurfaceEl && pinTo.value === props.contactSurfaceEl
}

/** Attach the settled Surface and its interactive form to the contact field. */
function pinContactFrame() {
  const host = props.contactSurfaceEl
  const el = frame.value
  if (!host || !el) return
  if (anchorSample) {
    const box = contactSurfacePose()
    if (box) paintBox(box, 1)
    return
  }
  setCaseMediaVisible(false)
  clearCaseMediaFlight()
  setContactStageProgress(1)
  if (pinTo.value === host) {
    syncPinnedMask()
    return
  }

  unpinFrame()
  proxyParked.value = false
  pinHost = host
  el.style.position = 'absolute'
  el.style.top = '0px'
  el.style.left = '0px'
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.transform = ''
  pinTo.value = host

  pinRo?.disconnect()
  pinRo = new ResizeObserver(syncPinnedMask)
  pinRo.observe(host)
  void nextTick(syncPinnedMask)
}

function unpinFrame(morph = 1) {
  const el = frame.value
  if (!el) return
  if (proxyHost) {
    const host = proxyHost
    const box = proxyPose() ?? liveBox
    proxyParked.value = false
    proxyHost = null
    proxyKind = null
    host.removeAttribute('data-flow-surface-proxy-active')
    if (box) {
      const next = morphBox(box)
      el.style.position = 'absolute'
      applyBox(el, next)
      liveBox = next
      writeMaskBox(next, morph)
      flushFlowSurfacePath(next)
    }
    return
  }
  if (!pinTo.value) return
  const r = el.getBoundingClientRect()
  pinRo?.disconnect()
  pinRo = null
  const box = roundBox({
    top: r.top,
    left: r.left,
    width: Math.max(1, r.width),
    height: Math.max(1, r.height),
  })
  // Freeze in viewport coords so the teleport back to the shell doesn't jump.
  el.style.position = 'fixed'
  applyBox(el, box)
  liveBox = box
  writeMaskBox(box, morph)
  flushFlowSurfacePath(box)
  pinTo.value = null
  pinHost = null
  void nextTick(() => {
    if (!frame.value || pinTo.value) return
    frame.value.style.position = 'absolute'
    // Scroll may already have painted a newer free-flight pose while Teleport
    // was moving the frame back into the shell. Do not restore the stale pin.
    applyBox(frame.value, liveBox ?? box)
  })
}

function pinFrame(hop: MobileHop) {
  const host = pinSlot(hop)
  const el = frame.value
  if (!host || !el) return
  if (proxyHost === host) {
    return
  }
  const box = readBox(host)
  if (!box) return
  parkFrameOnProxy(host, 'kado', box)
}

function settleHop(hop: MobileHop) {
  pinFrame(hop)
}

/** Live viewport box for “Kado” — pin slot already includes margin pad. */
function wordPose(): SurfaceBox | null {
  const slot = pinSlot('word')
  const live = readBox(slot)
  if (live) {
    lastWordDoc = {
      top: live.top + window.scrollY,
      left: live.left + window.scrollX,
      width: live.width,
      height: live.height,
    }
    return live
  }
  if (lastWordDoc) return docToViewport(lastWordDoc)
  return null
}

/** A missing late-created word ref must never strand the Surface in Cases. */
function caseReturnPose(): SurfaceBox | null {
  return wordPose()
    ?? readBox(props.toEl)
    ?? readBox(props.stoneEl)
}

/** Live viewport box for the hop destination. */
function hopPose(hop: MobileHop): SurfaceBox | null {
  if (hop === 'term') return readBox(pinSlot('term')) ?? readBox(props.termEl)
  return wordPose()
}

function killHopTween() {
  hopTween?.kill()
  hopTween = null
  mobileScrubBridge = null
  hopFromBox = null
  hopProgress = 0
}

/**
 * Single entry for stage changes.
 * Forward-lock only blocks reverse *bounce* right after an animated forward hop;
 * intentional upward scroll clears the lock.
 */
function requestStage(next: MobileStage, animate: boolean) {
  if (mobileCaseHopOwnsFrame()) return
  if (!stageChangesAllowed()) {
    // During quiet boot only allow snapping back to scrub paint — never pin.
    if (next === 'scrub' && mobileStage !== 'scrub') {
      mobileStage = 'scrub'
      killHopTween()
      paintHeroRest()
    }
    return
  }

  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const curRank = STAGE_RANK[mobileStage]
  const requestedRank = STAGE_RANK[next]
  // A cold mobile boot can finish after native scroll has crossed more than one
  // waypoint. Preserve the forward story instead of jumping Hero → Kado.
  if (requestedRank > curRank + 1) {
    next = curRank === STAGE_RANK.scrub ? 'term' : 'word'
  }
  const nextRank = STAGE_RANK[next]

  if (next === mobileStage && !hopTween) return
  if (next === mobileStage && hopTween) return

  if (nextRank < curRank && now < stageLockUntil) return

  // Lock only for animated forward hops (not boot snaps).
  if (animate && nextRank > curRank) {
    stageLockUntil = now + STAGE_FORWARD_LOCK_MS
  }

  if (next === 'scrub') enterScrub(animate)
  else tweenToHop(next, animate)
}

function tweenToHop(hop: MobileHop, animate: boolean) {
  if (!gsapMod || !frame.value) return
  const dest = hopPose(hop)
  if (!dest) return

  const wasPinned = frameDocked()
  const fromRect = wasPinned
    ? (proxyPose() ?? readBox(frame.value))
    : null
  unpinFrame()
  mobileStage = hop
  paintCaseSurfaceTone()
  killHopTween()

  const startHop = () => {
    if (!frame.value) return
    if (fromRect) {
      const from = roundBox({
        top: fromRect.top,
        left: fromRect.left,
        width: Math.max(1, fromRect.width),
        height: Math.max(1, fromRect.height),
      })
      applyBox(frame.value, from)
      liveBox = from
    }
    const from = liveBox ?? dest
    if (!animate || systemReducedMotion()) {
      paintBox(dest, 1)
      settleHop(hop)
      return
    }

    let fallbackDest = { ...dest }
    hopFromBox = { ...from }
    const hopFromDoc = viewportToDoc(hopFromBox)
    const hopDestDoc = readDocBox(pinSlot(hop)) ?? viewportToDoc(dest)
    hopProgress = 0
    const gsap = gsapMod!.default
    const proxy = { t: 0 }
    hopTween = gsap.to(proxy, {
      t: 1,
      duration: HOP_DURATION,
      ease: HOP_EASE,
      onUpdate: () => {
        hopProgress = proxy.t
        paintBox(docToViewport(lerpBox(hopFromDoc, hopDestDoc, hopProgress)), 1)
      },
      onComplete: () => {
        hopTween = null
        hopFromBox = null
        hopProgress = 0
        const finalDest = hopPose(hop) ?? fallbackDest
        paintBox(finalDest, 1)
        settleHop(hop)
        // Continue toward the latest scroll-derived stage after a skipped
        // threshold, and let the Cases gate proceed only after `word` settles.
        requestAnimationFrame(() => {
          if (stageChangesAllowed()) reconcileFromScroll()
        })
      },
    })
  }

  if (wasPinned) void nextTick(startHop)
  else startHop()
}

/**
 * Hand control back to the scrub corridor. A skipped multi-waypoint reverse
 * uses the same normalized velocity cap instead of snapping a skipped pin → Hero.
 */
function enterScrub(animate: boolean, fromOverride?: SurfaceBox | null) {
  const current = fromOverride ?? proxyPose() ?? liveBox ?? readBox(frame.value)
  const currentMorph = flowSurfaceMask.morph
  mobileStage = 'scrub'
  killHopTween()
  const wasPinned = frameDocked()
  unpinFrame()
  const paint = () => {
    if (!heroPose || !stonePose) return
    const p = scrubProgressAt(window.scrollY)
    scrubTargetP = p
    if (
      !animate
      || !current
      || systemReducedMotion()
    ) {
      scrubLiveP = p
      paintScrubAt(p)
      return
    }
    mobileScrubBridge = {
      from: { ...current },
      fromMorph: currentMorph,
      progress: 0,
    }
    // Threshold callbacks may have pinned the DOM to an already skipped
    // waypoint. Restore the case corridor's last actually painted box before
    // the bridge starts so no stale pin flashes for one frame.
    paintBox(current, currentMorph)
    ensureTick()
  }
  if (wasPinned) void nextTick(paint)
  else paint()
}

function stageFromScroll(): MobileStage {
  const stoneMark = props.stoneEl ?? props.toEl
  const body = props.bodyEl
  if (!stoneMark || !body) return 'scrub'

  const y = window.scrollY
  // Body is needed for corridor capture; the final handoff prefers Kado.
  // During boot / unloaded stone image, markers sit near 0 and every hop looks “active”.
  if (!markersReliable()) {
    if (props.fromEl) {
      const top =
        sectionOf(props.fromEl).getBoundingClientRect().top + window.scrollY
      if (y <= top + window.innerHeight * 0.85) return 'scrub'
    }
    // Mid-page with bad markers — keep current stage, don't invent hops.
    return mobileStage
  }

  // Kado `top 20%` is owned by the direct Cases handoff trigger.
  const squareMark = props.wordEl ?? body
  const squareAt = props.wordEl ? 0.2 : 0.5
  if (y >= scrollYForTopAt(squareMark, squareAt)) return 'word'
  if (y >= scrollYForCenterTop(stoneMark)) return 'word'
  if (y >= scrollYForTopAt(stoneMark, 0.1)) return 'term'
  return 'scrub'
}

function mobileCaseHandoffBounds() {
  if (mobileCaseHandoffY) return mobileCaseHandoffY
  const mark = props.wordEl ?? props.bodyEl
  if (!mark) return null
  const fraction = (position: string, fallback: number) => {
    const match = position.match(/(-?\d+(?:\.\d+)?)%$/)
    const percent = match ? Number.parseFloat(match[1]!) : Number.NaN
    return Number.isFinite(percent) ? percent / 100 : fallback
  }
  const markDoc = readDocBox(mark) ?? (props.wordEl ? lastWordDoc : null)
  if (!markDoc) return null
  const viewportHeight = stableMobileTriggerViewportHeight()
  mobileCaseHandoffY = {
    forwardY:
      markDoc.top - viewportHeight * fraction(MOBILE_CASE_HOP_FORWARD, 0.3),
  }
  return mobileCaseHandoffY
}

/** Live crossing: Cases top reaches 90% of the stable viewport while scrolling upward. */
function crossedMobileCaseReverseMarker(
  scrollingUp: boolean,
  scrollDelta: number,
) {
  if (!mobileCaseArrived || !props.caseSectionEl) return false
  const top = props.caseSectionEl.getBoundingClientRect().top
  const match = MOBILE_CASE_HOP_REVERSE.match(/(-?\d+(?:\.\d+)?)%$/)
  const percent = match ? Number.parseFloat(match[1]!) / 100 : 0.9
  const line = stableMobileTriggerViewportHeight() * percent
  // If layout restored directly inside Cases, derive the prior live top from
  // this native scroll delta so the first large upward step cannot skip 90%.
  const previousTop = lastCaseSectionTop ?? (top + scrollDelta)

  if (scrollingUp) {
    caseReverseIntentPx += Math.max(0, -scrollDelta)
  } else if (scrollDelta > 1) {
    caseReverseIntentPx = 0
  }
  if (top <= line) mobileCaseReverseArmed = true
  lastCaseSectionTop = top

  const crossedArmedLine = !!(
    scrollingUp
    && mobileCaseReverseArmed
    && previousTop != null
    && previousTop < line
    && top >= line
  )
  const deliberateReturnAboveLine = scrollingUp
    && top >= line
    && caseReverseIntentPx >= MOBILE_CASE_DIRECTION_REVERSAL_PX

  if (crossedArmedLine || deliberateReturnAboveLine) {
    caseReverseIntentPx = 0
    return true
  }
  return false
}

function syncMobileStage(animate: boolean) {
  requestStage(stageFromScroll(), animate)
}

let lastScrollY = 0
/** Ignore ST onEnter/onLeaveBack while boot layout is settling. */
let suppressStageCallbacks = false
let layoutResyncTimers: number[] = []
let removeLayoutResync: (() => void) | null = null
/** fonts.ready is already resolved after first load — re-then() must not loop. */
let fontsResyncBound = false
let captureFailCount = 0
let poseResizeObserver: ResizeObserver | null = null
let contactResizeTimer = 0
let poseResyncRaf = 0
let removeStoneLoadResync: (() => void) | null = null

/** Offscreen/lazy waypoints can settle after the bounded startup retries. */
function schedulePoseResync() {
  if (poseResyncRaf || hostUnmounted || !keepAliveActive) return
  poseResyncRaf = requestAnimationFrame(() => {
    poseResyncRaf = 0
    if (hostUnmounted || !keepAliveActive) return
    resyncAfterLayout()
  })
}

function clearLayoutResync() {
  for (const id of layoutResyncTimers) window.clearTimeout(id)
  layoutResyncTimers = []
  removeLayoutResync?.()
  removeLayoutResync = null
}

function scheduleCaptureRetry() {
  captureFailCount += 1
  if (captureFailCount > 10) {
    return
  }
  const delay = Math.min(60 * captureFailCount, 480)
  layoutResyncTimers.push(
    window.setTimeout(() => {
      resyncAfterLayout()
    }, delay),
  )
}

function scheduleLayoutResync() {
  clearLayoutResync()
  // Fewer beats — each used to stack with a second full morph on SPA home entry.
  const delays = [120, 500, 2000]
  for (const ms of delays) {
    layoutResyncTimers.push(
      window.setTimeout(() => {
        resyncAfterLayout()
      }, ms),
    )
  }

  const stone = props.stoneEl
  const onStone = () => resyncAfterLayout()
  if (stone instanceof HTMLImageElement) {
    if (!stone.complete) {
      stone.addEventListener('load', onStone, { once: true })
      removeLayoutResync = () => stone.removeEventListener('load', onStone)
    }
  }

  // Only bind once: document.fonts.ready stays resolved forever after first load.
  // Re-arming .then() on every capture-fail → infinite morph.start/fail/end microtasks.
  if (!fontsResyncBound && document.fonts?.ready) {
    fontsResyncBound = true
    void document.fonts.ready.then(() => {
      resyncAfterLayout()
    })
  }
}

function resyncAfterLayout() {
  if (!gsapMod || !stMod || !frame.value) return
  if (!props.fromEl || !props.toEl) return
  if (morphBooting) return
  // Corridor never built (first paint missed refs) — full rebuild, not a soft sync.
  if (mobileTriggers.length === 0 && !trigger) {
    buildMorph()
    return
  }
  const ok = capturePoses()
  if (!ok) {
    ensureHeroRestPlaceholder()
    bootAlignHeroVisibility()
    scheduleCaptureRetry()
    return
  }
  captureFailCount = 0
  if (mobileActive) {
    suppressStageCallbacks = true
    paintMobileScrollCorridor()
    if (stageChangesAllowed()) scheduleDeferredRefresh(stMod.ScrollTrigger)
    suppressStageCallbacks = false
    return
  } else if (trigger) {
    paintDesktop()
    ensureTick()
  }
}

/** Scroll-driven stage reconcile — catches missed leaveBacks when scrolling up. */
function reconcileFromScroll() {
  lastScrollY = window.scrollY
  paintMobileScrollCorridor(lastScrollY)
}

/** Named navigation requests a landing snapshot through the shared route contract. */
function paintAnchorDestination(targetId: HomeAnchorTarget) {
  caseMediaActive = false
  setSurfaceDocked(false)
  setSurfaceReady(false)
  setCaseMediaVisible(false)
  clearCaseMediaFlight()
  setContactStageProgress(0)
  clearAboutTitleContrast()
  publishHeroHorizontalMorph(targetId === 'home' ? 0 : 1)
  if (targetId === 'contact') {
    paintAboutToContactSegment(1)
    return
  }
  if (targetId === 'about') {
    paintFormatsToAboutSegment(1)
    const box = aboutSurfacePose()
    if (!anchorSample && mobileActive && box) parkMobileAboutWaypoint(box)
    return
  }
  paintAboutSurfaceTone(0)
  if (targetId === 'services') {
    const track = mobileActive ? readBox(props.formatsSurfaceEl) : null
    const box = mobileActive && track ? mobileFormatsSettledBox(track) : formatsSurfacePose()
    if (box) paintBox(box, 1)
    return
  }
  const box = heroLivePose()
  if (!box) return
  syncStageRest(box)
  if (!anchorSample && mobileActive) pinMobileHeroRevealFrame(box)
  else paintBox(box, 0)
}

function captureCurrentSurfaceSnapshot(box: SurfaceBox): SurfaceVisualSnapshot {
  return {
    box: { ...box },
    stage: stageRestBox(),
    morph: flowSurfaceMask.morph,
    horizontalMorph: flowSurfaceMask.heroHorizontalMorph,
    tone: currentSurfaceTone(),
    contactProgress: contactStageProgress.value,
    aboutOpacity: Number.parseFloat(lastAboutTitleOpacity) || 0,
  }
}

function beginAnchorSurfaceTrip(targetId: string, scrollTop: number) {
  if (!isHomeAnchorTarget(targetId)) return null
  if (!keepAliveActive || morphBooting || !frame.value || !liveBox) return null
  if (systemReducedMotion()) return null
  const source = proxyPose() ?? (pinTo.value ? readBox(frame.value) : liveBox)
  if (!source) return null
  returnDockScrollY = null
  releaseHomeReturnSnapshot()
  const destinationS = HOME_ANCHOR_DESTINATIONS[targetId].desktopProgress
  const route = planSurfaceRoute(desktopLiveS, destinationS)
  const motion: NonNullable<typeof anchorMotion> = {
    phase: 'scroll',
    from: captureCurrentSurfaceSnapshot(source),
    route,
    elapsed: 0,
    updatedAt: 0,
    targetId,
    scrollComplete: false,
    startScrollY: window.scrollY,
    forward: scrollTop > window.scrollY,
    scrollTop,
    fromScrollY: window.scrollY,
  }
  anchorMotion = motion
  // Named navigation owns this transition. Its morph clocks reveal the scene;
  // a stale reverse-scroll flag must not swap in the manual-scroll curve.
  flowSurfaceMask.heroReturning = false
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  killHopTween()
  killCaseSettleTween()
  killFormatsSettleTween()
  killAboutSettleTween()
  clearCaseMediaReveal()
  endMobileCaseTransformPaint()
  unpinFrame(motion.from.morph)
  proxyParked.value = false
  caseMediaActive = false
  setSurfaceDocked(false)
  setSurfaceReady(false)
  setCaseMediaVisible(false)
  clearCaseMediaFlight()
  paintBox(motion.from.box!, motion.from.morph)
  const approach = (top = motion.scrollTop) => {
    if (anchorMotion !== motion || motion.phase === 'settle') return
    motion.scrollTop = top
    motion.fromScrollY = window.scrollY
    if (!mobileActive) {
      const longTrip = Math.abs(motion.scrollTop - motion.startScrollY) > stableViewportHeight() * 0.75
      if (longTrip) {
        // Follow navigation direction after the source has left with the page.
        const from = motion.from.box
        if (from) {
          from.top = motion.forward ? -from.height - 24 : stableViewportHeight() + 24
        }
      } else if (liveBox) {
        motion.from.box = { ...liveBox }
      }
    }
    motion.phase = 'settle'
    motion.updatedAt = performance.now()
    capturePoses()
    stMod?.ScrollTrigger.update()
    ensureTick()
  }
  const settle = (top = window.scrollY) => {
    if (anchorMotion !== motion) return
    motion.scrollTop = top
    motion.scrollComplete = true
    approach()
    ensureTick()
  }
  const cancel = () => {
    if (anchorMotion !== motion) return
    if (motion.phase === 'settle' && liveBox && frame.value) {
      motion.from = captureCurrentSurfaceSnapshot(liveBox)
      motion.fromScrollY = window.scrollY
      motion.elapsed = 0
      motion.updatedAt = performance.now()
    }
    motion.targetId = null
    settle()
  }
  return { approach, settle, cancel }
}

/** Ask the existing corridor for its endpoint without docking or painting it. */
function paintAnchorSurfaceHandoff(now: number) {
  const motion = anchorMotion
  const el = frame.value
  if (!motion || !el || motion.phase === 'scroll') return
  const sample = {
    box: null as SurfaceBox | null,
    stage: stageRestBox(),
    morph: 1,
    horizontalMorph: flowSurfaceMask.heroHorizontalMorph,
    tone: currentSurfaceTone(),
    aboutOpacity: 0,
    contactProgress: contactStageProgress.value,
  }
  anchorSample = sample
  try {
    if (motion.targetId) paintAnchorDestination(motion.targetId)
    else if (mobileActive) paintMobileScrollCorridor(window.scrollY)
    else paintDesktop(computeDesktopTarget())
  } finally {
    anchorSample = null
  }
  if (!mobileActive && motion.targetId && sample.box) {
    // Aim at the landing viewport pose, not a moving endpoint during Lenis's tail.
    sample.box = { ...sample.box, top: sample.box.top - (motion.scrollTop - window.scrollY) }
  }
  if (motion.targetId === 'home' && sample.box) sample.stage = { ...sample.box }
  setSurfaceReady(false)
  setCaseMediaVisible(false)
  motion.elapsed += Math.min(64, Math.max(0, now - motion.updatedAt))
  motion.updatedAt = now
  if (systemReducedMotion()) motion.elapsed = ANCHOR_SURFACE_DURATION_MS
  const progress = clampUnit(motion.elapsed / ANCHOR_SURFACE_DURATION_MS)
  const eased = smoothUnit(progress)
  const documentSpace = mobileActive && (!motion.targetId
    || HOME_ANCHOR_DESTINATIONS[motion.targetId].mobileSpace === 'document')
  const from = documentSpace && motion.from.box
    ? {
        ...motion.from,
        box: {
          ...motion.from.box,
          top: motion.from.box.top - (window.scrollY - motion.fromScrollY),
        },
      }
    : motion.from
  const mixed = mixSurfaceVisualSnapshot(from, sample, eased)
  if (mixed.stage) syncStageRest(mixed.stage)
  if (mixed.box) {
    paintBox(mixed.box, mixed.morph)
    paintAboutTitleContrast(mixed.box, mixed.aboutOpacity)
  }
  publishHeroHorizontalMorph(mixed.horizontalMorph)
  publishSurfaceTone(mixed.tone)
  setContactStageProgress(mixed.contactProgress)
  if (progress < 1) {
    raf = requestAnimationFrame(tick)
    return
  }
  // Keep the named destination until the scroll driver's last correction is done.
  if (!motion.scrollComplete) return
  capturePoses()
  stMod?.ScrollTrigger.update()
  anchorMotion = null
  // Home has a pre-morph scroll corridor below zero. Its visible rest pose at
  // scrollY=0 is not waypoint 0 (the Hero -> Kado morph start), so commit the
  // real scroll clock before returning ownership to ordinary scrolling.
  desktopLiveS = motion.targetId && motion.targetId !== 'home'
    ? HOME_ANCHOR_DESTINATIONS[motion.targetId].desktopProgress
    : computeDesktopTarget()
  if (motion.targetId) {
    paintAnchorDestination(motion.targetId)
  } else if (mobileActive) paintMobileScrollCorridor(window.scrollY)
  else paintDesktop(desktopLiveS)
}

function tick(now: number) {
  raf = 0
  if (!keepAliveActive || suspendDetachedSurfaceHost()) return
  if (anchorMotion) {
    if (document.hidden) return
    paintAnchorSurfaceHandoff(now)
    return
  }
  if (desktopReturnOwnsPaint()) return
  if (!lastTs) lastTs = now
  const dt = Math.min(0.064, Math.max(0, (now - lastTs) / 1000))
  lastTs = now

  // Mobile is event-painted from the authoritative applied-scroll contract.
  // A queued tick may still survive a mode switch; reconcile once and stop.
  if (mobileActive) {
    paintMobileScrollCorridor(window.scrollY)
    return
  }

  const sTarget = computeDesktopTarget()
  const snapMorph = useMobileCorridor()
  if (snapMorph) {
    desktopLiveS = sTarget
    paintDesktop(sTarget)
    return
  }

  if (!Number.isFinite(sTarget)) {
    desktopLiveS = 0
    paintDesktop(0)
    return
  }

  // One continuous target across Hero → Kado → Cases. Never retarget to the
  // middle waypoint: that made the exponential follow decelerate to rest at
  // Kado before it was allowed to continue toward Hero.
  const touchesCaseSegment = desktopLiveS > 1 || sTarget > 1
  const returningInsideHero = sTarget < desktopLiveS
    && sTarget < 1
    && desktopLiveS <= 1
  if (returningInsideHero) {
    flowSurfaceMask.heroReturning = true
  } else if (
    sTarget > desktopLiveS
    || sTarget >= 1
    || desktopLiveS <= SURFACE_MORPH_EPSILON
  ) {
    // Preserve reverse ownership if the user pauses midway. Dropping it merely
    // because live reached target would swap opacity curves on that exact frame.
    flowSurfaceMask.heroReturning = false
  }
  const baseMaxVelocity = returningInsideHero
    ? HERO_RETURN_MAX_VELOCITY
    : SURFACE_MORPH_MAX_VELOCITY
  const route = planSurfaceRoute(desktopLiveS, sTarget, {
    baseMaxVelocity,
    // Keep the carefully paced final Hero reveal out of catch-up mode. Every
    // other stale multi-waypoint route may compress without stopping at old WPs.
    catchUpMaxVelocity: returningInsideHero
      ? HERO_RETURN_MAX_VELOCITY
      : SURFACE_MORPH_CATCH_UP_MAX_VELOCITY,
  })
  desktopLiveS = updateContinuousProgress(desktopLiveS, sTarget, dt, {
    lag: touchesCaseSegment ? CASE_SCRUB_LAG : props.plan.lag,
    maxVelocity: route.maxVelocity,
    epsilon: SURFACE_MORPH_EPSILON,
  })

  paintDesktop(desktopLiveS)

  if (Math.abs(sTarget - desktopLiveS) >= SURFACE_MORPH_EPSILON) {
    raf = requestAnimationFrame(tick)
  }
}

function ensureTick() {
  if (!keepAliveActive || suspendDetachedSurfaceHost()) return
  if (!raf) {
    // Seed the clock at scheduling time. Resetting it to zero here made every
    // self-scheduled mobile follow frame compute dt=0, so the shared corridor
    // stayed frozen at its initial segment while the document kept scrolling.
    lastTs = performance.now()
    raf = requestAnimationFrame(tick)
  }
}

function killMorph() {
  const preserveDesktopDetailReturnDock = desktopReturnOwnsPaint()
  anchorMotion = null
  anchorSample = null
  caseHopGen += 1
  formatsHopGen += 1
  aboutHopGen += 1
  endMobileCaseTransformPaint()
  trigger?.kill()
  trigger = null
  caseTrigger?.kill()
  caseTrigger = null
  formatsTrigger?.kill()
  formatsTrigger = null
  aboutTrigger?.kill()
  aboutTrigger = null
  contactTrigger?.kill()
  contactTrigger = null
  desktopTargetS = preserveDesktopDetailReturnDock ? DESKTOP_CASE_DOCK_S : 0
  desktopLiveS = preserveDesktopDetailReturnDock ? DESKTOP_CASE_DOCK_S : 0
  mobileCaseProgress = 0
  mobileCaseArrived = false
  mobileCaseHandoffY = null
  mobileCaseReverseArmed = false
  caseReverseIntentPx = 0
  lastCaseSectionTop = null
  mobileScrubBridge = null
  caseMediaActive = preserveDesktopDetailReturnDock
  setSurfaceReturning(false)
  setCaseSurfaceDocked(preserveDesktopDetailReturnDock)
  setSurfaceReady(preserveDesktopDetailReturnDock)
  setCaseMediaVisible(preserveDesktopDetailReturnDock)
  clearCaseMediaReveal()
  clearCaseMediaFlight()
  frame.value?.style.removeProperty('--flow-surface-tone')
  lastCaseToneCss = ''
  for (const t of mobileTriggers) t.kill()
  mobileTriggers = []
  killHopTween()
  killCaseSettleTween()
  killFormatsSettleTween()
  killAboutSettleTween()
  mobileFormatsProgress = 0
  mobileFormatsScrollDirection = null
  mobileFormatsRequested = false
  mobileFormatsArrived = false
  mobileAboutProgress = 0
  mobileAboutArrived = false
  setContactStageProgress(0)
  mobileScrollBounds = null
  mobileCorridorS = 0
  mobileCorridorLastY = null
  mobileCorridorDirection = 'forward'
  clearAboutTitleContrast()
  unpinFrame(flowSurfaceMask.morph)
  pinRo?.disconnect()
  pinRo = null
  clearLayoutResync()
  suppressStageCallbacks = false
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

/** Last corridor identity — skip full rebuild when only stone/term/body refs settle. */
let lastFromEl: HTMLElement | null = null
let lastToEl: HTMLElement | null = null
let lastPlan: SurfaceMorphPlan | null = null
let lastCaseSectionEl: HTMLElement | null = null
let lastCaseMediaEl: HTMLElement | null = null
let lastFormatsSectionEl: HTMLElement | null = null
let lastFormatsSurfaceEl: HTMLElement | null = null
let lastAboutSectionEl: HTMLElement | null = null
let lastAboutSurfaceEl: HTMLElement | null = null
let lastAboutTitleEl: HTMLElement | null = null
let lastAboutEndEl: HTMLElement | null = null
let lastContactSectionEl: HTMLElement | null = null
let lastContactSurfaceEl: HTMLElement | null = null

/** Prevent re-entrant buildMorph ↔ ScrollTrigger.refresh softlocks (SPA return to `/`). */
let morphGen = 0
let morphWatchTimer = 0
let morphBooting = false
/** After SPA mount, markers/layout thrash — pin/Teleport here freezes the tab. */
let morphQuietUntil = 0
let refreshDepth = 0

function stageChangesAllowed() {
  if (!keepAliveActive || morphBooting || suppressStageCallbacks) return false
  if (typeof performance !== 'undefined' && performance.now() < morphQuietUntil) {
    return false
  }
  return true
}

function beginMorphQuiet(ms = 1600) {
  if (typeof performance === 'undefined') return
  morphQuietUntil = Math.max(morphQuietUntil, performance.now() + ms)
}

function safeRefresh(ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger) {
  const refreshing = (ScrollTrigger as typeof ScrollTrigger & { isRefreshing?: boolean }).isRefreshing
  if (refreshing || refreshDepth > 0) {
    return
  }
  refreshDepth += 1
  try {
    ScrollTrigger.refresh()
  } catch {
    /* refresh can race with teardown */
  } finally {
    refreshDepth -= 1
  }
}

/** Keep ScrollTrigger.refresh off the first home-entry frame (felt as a hitch). */
function scheduleDeferredRefresh(
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger,
  after?: () => void,
) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      safeRefresh(ScrollTrigger)
      after?.()
    })
  })
}

function buildMobileMorph(ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger) {
  const body = props.bodyEl
  const triggerFrom = sectionOf(props.fromEl!)
  if (!body || !heroPose || !stonePose) return

  // Block stage/pin changes while ST is sorting itself out — Teleport pin during
  // refresh is what hard-froze the tab on logo→home navigations.
  suppressStageCallbacks = true

  // ScrollTrigger owns range measurement only. Applied-scroll publication owns
  // paint order, so an ST callback cannot race the same frame with another box.
  captureMobileScrollBounds()
  mobileCorridorS = mobileCorridorTargetAt(window.scrollY)
  mobileCorridorLastY = window.scrollY
  const corridorEnd = props.contactSectionEl
    ?? props.aboutSectionEl
    ?? props.formatsSectionEl
    ?? props.caseSectionEl
    ?? body
  mobileTriggers.push(
    ScrollTrigger.create({
      trigger: triggerFrom,
      endTrigger: corridorEnd,
      start: 'top top',
      end: 'bottom top',
      invalidateOnRefresh: true,
      onRefresh: () => {
        if (morphBooting) return
        if (mobileViewportHeightOnlyChange()) {
          paintMobileScrollCorridor()
          return
        }
        captureMobilePoses()
        paintMobileScrollCorridor()
      },
    }),
  )
  lastScrollY = window.scrollY
  paintMobileScrollCorridor()
  scheduleDeferredRefresh(ScrollTrigger)
  scheduleLayoutResync()
}

function buildMorph() {
  if (!gsapMod || !stMod || !frame.value) return
  if (morphBooting) {
    return
  }
  // A rebuild tears down the current corridor before it knows whether all
  // remounted page refs can already be captured. During a case-detail return
  // those refs settle over several frames. Keep the already-authoritative case
  // raster visible if this attempt aborts; the next successful paint will take
  // ownership and set the correct state for the current scroll segment.
  const restoreCaseMediaOnAbort = caseMediaVisible.value
  const restoreAbortedCaseMedia = () => {
    if (restoreCaseMediaOnAbort) setCaseMediaVisible(true)
  }
  const gen = ++morphGen
  morphBooting = true
  suppressStageCallbacks = true
  try {
    killMorph()
    // killMorph clears suppress — keep boot quiet.
    suppressStageCallbacks = true
    if (gen !== morphGen) {
      restoreAbortedCaseMedia()
      return
    }

    // Host mounts before page sections — keep retrying until slots exist.
    if (!props.fromEl || !props.toEl) {
      bootAlignHeroVisibility()
      scheduleLayoutResync()
      restoreAbortedCaseMedia()
      return
    }

    // Always pin a visible hero rest first — corridor capture must not gate first paint.
    ensureHeroRestPlaceholder()

    const gsap = gsapMod.default
    const { ScrollTrigger } = stMod
    gsap.registerPlugin(ScrollTrigger)
    parseEase = (name: string) => gsap.parseEase(name)

    if (!capturePoses()) {
      bootAlignHeroVisibility()
      scheduleCaptureRetry()
      restoreAbortedCaseMedia()
      return
    }
    captureFailCount = 0
    if (gen !== morphGen) {
      restoreAbortedCaseMedia()
      return
    }

    const reduced = systemReducedMotion()
    if (reduced && mobileActive) {
      buildMobileMorph(ScrollTrigger)
      paintMobileScrollCorridor()
      homeMotionReady.value = true
      announceSurfaceReady()
      return
    }
    if (reduced) {
      target.h = 1
      target.v = 1
      live.h = 1
      live.v = 1
      paintDesktop()
      homeMotionReady.value = true
      announceSurfaceReady()
      return
    }

    target.h = 0
    target.v = 0
    live.h = 0
    live.v = 0
    liveBox = null
    mobileStage = 'scrub'
    stageLockUntil = 0

    if (mobileActive) {
      buildMobileMorph(ScrollTrigger)
      // A cold /#cases load has no preceding Hero → Kado journey. Place the
      // surface at its actual initial viewport target before the first paint.
      if (initialCasesHashEntry.value) {
        const dest = caseMediaPose()
        if (dest) {
          mobileCaseProgress = 1
          mobileCaseArrived = true
          caseMediaActive = true
          setCaseSurfaceDocked(true)
          paintBox(dest, 1)
          requestAnimationFrame(() => {
            pinCaseFrame()
          })
        }
      }
      // A detail → home return already has its own fullscreen image flight.
      // Dock the real surface immediately after the mobile corridor has painted
      // its initial rest pose, while that overlay is still fully covering it.
      if (returningHomeFromCaseDetail()) {
        const dest = caseMediaPose()
        if (dest) dockMobileCaseFrameUnderDetailReturn(dest)
      }
      homeMotionReady.value = true
      announceSurfaceReady()
      lastFromEl = props.fromEl ?? null
      lastToEl = props.toEl ?? null
      lastPlan = props.plan ?? null
      lastCaseSectionEl = props.caseSectionEl ?? null
      lastCaseMediaEl = props.caseMediaEl ?? null
      lastFormatsSectionEl = props.formatsSectionEl ?? null
      lastFormatsSurfaceEl = props.formatsSurfaceEl ?? null
      lastAboutSectionEl = props.aboutSectionEl ?? null
      lastAboutSurfaceEl = props.aboutSurfaceEl ?? null
      lastAboutTitleEl = props.aboutTitleEl ?? null
      lastAboutEndEl = props.aboutEndEl ?? null
      lastContactSectionEl = props.contactSectionEl ?? null
      lastContactSurfaceEl = props.contactSurfaceEl ?? null
      return
    }

    const triggerFrom = sectionOf(props.fromEl!)
    const triggerTo = sectionOf(props.toEl!)

    trigger = ScrollTrigger.create({
      trigger: triggerFrom,
      endTrigger: triggerTo,
      start: () => {
        const revealOffset = Math.max(0, triggerFrom.offsetHeight - stableViewportHeight())
        return `top+=${revealOffset} top`
      },
      end: 'center center',
      invalidateOnRefresh: true,
      onUpdate: () => {
        ensureTick()
      },
      onRefresh: () => {
        if (morphBooting) return
        capturePoses()
        ensureTick()
      },
    })

    if (props.caseSectionEl && props.caseMediaEl) {
      // ONE scrub both ways — same lag as hero→kado. No hop / no second undock ST.
      caseTrigger = ScrollTrigger.create({
        trigger: props.caseSectionEl,
        start: CASE_SCRUB_START,
        end: CASE_SCRUB_END,
        invalidateOnRefresh: true,
        onUpdate: () => {
          ensureTick()
        },
        onRefresh: () => {
          if (morphBooting) return
          ensureTick()
        },
      })
    } else {
      caseTrigger = null
    }

    if (props.formatsSectionEl && props.formatsSurfaceEl) {
      formatsTrigger = ScrollTrigger.create({
        trigger: props.formatsSectionEl,
        start: FORMATS_SCRUB_START,
        end: FORMATS_SCRUB_END,
        invalidateOnRefresh: true,
        onUpdate: () => {
          ensureTick()
        },
        onRefresh: () => {
          if (morphBooting) return
          ensureTick()
        },
      })
    } else {
      formatsTrigger = null
    }

    if (props.aboutSectionEl && props.aboutSurfaceEl) {
      aboutTrigger = ScrollTrigger.create({
        trigger: props.aboutSectionEl,
        start: ABOUT_SCRUB_START,
        end: ABOUT_SCRUB_END,
        invalidateOnRefresh: true,
        onUpdate: () => {
          ensureTick()
        },
        onRefresh: () => {
          if (morphBooting) return
          ensureTick()
        },
      })
    } else {
      aboutTrigger = null
    }

    if (props.aboutEndEl && props.contactSurfaceEl) {
      contactTrigger = ScrollTrigger.create({
        trigger: props.aboutEndEl,
        endTrigger: props.contactSurfaceEl,
        start: CONTACT_SCRUB_START,
        end: () => {
          const box = contactSurfacePose()
          return box
            ? contactSettleScrollY(window.scrollY + box.top, window.innerHeight)
            : 'top 18%'
        },
        invalidateOnRefresh: true,
        onUpdate: () => {
          ensureTick()
        },
        onRefresh: () => {
          if (morphBooting) return
          ensureTick()
        },
      })
    } else {
      contactTrigger = null
    }

    const s = computeDesktopTarget()
    desktopTargetS = s
    desktopLiveS = s
    paintDesktop(s)
    homeMotionReady.value = true
    announceSurfaceReady()
    ensureTick()

    scheduleDeferredRefresh(ScrollTrigger, () => {
      if (gen !== morphGen || !trigger) return
      const curS = computeDesktopTarget()
      desktopTargetS = curS
      desktopLiveS = curS
      paintDesktop(curS)
    })
    scheduleLayoutResync()
    lastFromEl = props.fromEl ?? null
    lastToEl = props.toEl ?? null
    lastPlan = props.plan ?? null
    lastCaseSectionEl = props.caseSectionEl ?? null
    lastCaseMediaEl = props.caseMediaEl ?? null
    lastFormatsSectionEl = props.formatsSectionEl ?? null
    lastFormatsSurfaceEl = props.formatsSurfaceEl ?? null
    lastAboutSectionEl = props.aboutSectionEl ?? null
    lastAboutSurfaceEl = props.aboutSurfaceEl ?? null
    lastAboutTitleEl = props.aboutTitleEl ?? null
    lastAboutEndEl = props.aboutEndEl ?? null
    lastContactSectionEl = props.contactSectionEl ?? null
    lastContactSurfaceEl = props.contactSurfaceEl ?? null
  } finally {
    if (gen === morphGen) {
      beginMorphQuiet(1800)
      morphBooting = false
      suppressStageCallbacks = false
    }
  }
}

function mobileViewportHeightOnlyChange() {
  const width = window.innerWidth
  const previousWidth = surfaceViewportWidth
  surfaceViewportWidth = width
  return useMobileCorridor() && previousWidth > 0 && width === previousWidth
}

function onResize() {
  if (!keepAliveActive || suspendDetachedSurfaceHost()) return
  if (mobileViewportHeightOnlyChange()) return
  capturePoses()
  if (mobileActive) {
    paintMobileScrollCorridor()
    return
  }
  paintDesktop()
  ensureTick()
}

function onAppliedSurfaceFrame(scrollFrame: AppliedScrollFrame) {
  if (!keepAliveActive || suspendDetachedSurfaceHost()) return
  if (surfacePaintOwner.value === 'return-dock') {
    if (returnDockScrollY === null) {
      returnDockScrollY = scrollFrame.y
      returnDockInputRevision = scrollFrame.inputRevision
      return
    }
    // Scroll position is not proof of scroll ownership. Route/hash restoration
    // and Lenis reconciliation also publish applied frames; only fresh input
    // may release the atomically committed case dock.
    if (scrollFrame.inputRevision <= returnDockInputRevision) return
    if (Math.abs(scrollFrame.y - returnDockScrollY) <= 0.5) return
    returnDockScrollY = null
    returnDockInputRevision = scrollFrame.inputRevision
    releaseHomeReturnSnapshot()
    if (mobileActive) {
      paintMobileScrollCorridor(scrollFrame.y)
      return
    }
    // Topology and paint ownership are separate. The complete corridor should
    // have been built under the proxy; recover it if a late remount missed it.
    if (!trigger) {
      buildMorph()
      return
    }
    capturePoses()
    stMod?.ScrollTrigger.update()
  } else if (!mobileActive && returningHomeFromCaseDetail()) {
    // Route restoration and refresh may publish scroll frames while the proxy
    // still owns paint. They prepare topology only and cannot claim paint.
    return
  }
  if (anchorMotion) {
    if (anchorMotion.phase === 'scroll' && !mobileActive) {
      const offset = scrollFrame.y - anchorMotion.startScrollY
      const from = anchorMotion.from.box
      if (from) {
        const box = { ...from, top: from.top - offset }
        paintBox(box, anchorMotion.from.morph)
      }
    } else ensureTick()
    return
  }
  if (mobileActive) {
    paintMobileScrollCorridor(scrollFrame.y)
    return
  }
  if (caseFramePinned()) {
    syncPinnedMask()
    return
  }
  if (mobileActive || hopTween) return
  if (paintForwardHeroRevealFrame(scrollFrame)) return
  ensureTick()
}

function onAnchorVisibilityChange() {
  if (document.hidden || anchorMotion?.phase !== 'settle') return
  anchorMotion.updatedAt = performance.now()
  ensureTick()
}

onMounted(async () => {
  resetFlowSurfaceMaskSession()
  hostUnmounted = false
  mobileSectionBootPending.value = useMobileCorridor()
    && !!window.location.hash
    && !systemReducedMotion()
    && !returningHomeFromCaseDetail()
  initialCasesHashEntry.value = window.location.hash === '#cases'
    && initialHomeDocument.value
    && !returningHomeFromCaseDetail()
  const coldDirectEntry = initialHomeDocument.value
    && !returningHomeFromCaseDetail()
    && !window.location.hash
  await nextTick()
  // Let the route/page DOM settle before ST — avoids refresh↔pin softlock on SPA entry.
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  if (hostUnmounted) return
  claimSurfaceDomOwnership()
  connectAppliedScrollFrames()
  removeAnchorMotionOwner = registerHomeAnchorMotion(beginAnchorSurfaceTrip)
  document.addEventListener('visibilitychange', onAnchorVisibilityChange)
  // Paint the real Hero surface and copy before loading the scroll engine.
  // This hands off the SSR primer without putting GSAP on the LCP path.
  bootAlignHeroVisibility()
  ensureHeroRestPlaceholder()
  surfaceViewportWidth = window.innerWidth
  window.addEventListener('resize', onResize, { passive: true })
  if (coldDirectEntry) {
    // The intro owns the critical 640 ms clip-path window. Loading GSAP,
    // ScrollTrigger and measuring the full scroll corridor inside that window
    // caused a reproducible one-frame stop on a genuinely cold cache.
    if (homeIntroUnlocked.value) scheduleColdMotionBoot()
    else {
      stopIntroUnlockMotionWatch = watch(
        homeIntroUnlocked,
        (unlocked) => {
          if (!unlocked) return
          stopIntroUnlockMotionWatch?.()
          stopIntroUnlockMotionWatch = null
          scheduleColdMotionBoot()
        },
        { flush: 'post' },
      )
    }
  } else void bootMotionEngine()
})

onUnmounted(() => {
  hostUnmounted = true
  removeAnchorMotionOwner?.()
  removeAnchorMotionOwner = null
  document.removeEventListener('visibilitychange', onAnchorVisibilityChange)
  poseResizeObserver?.disconnect()
  poseResizeObserver = null
  if (contactResizeTimer) window.clearTimeout(contactResizeTimer)
  contactResizeTimer = 0
  removeStoneLoadResync?.()
  removeStoneLoadResync = null
  if (poseResyncRaf) cancelAnimationFrame(poseResyncRaf)
  poseResyncRaf = 0
  if (motionBootTimer) window.clearTimeout(motionBootTimer)
  motionBootTimer = 0
  if (motionIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(motionIdleId)
  }
  motionIdleId = null
  removeMotionIntent?.()
  removeMotionIntent = null
  stopIntroUnlockMotionWatch?.()
  stopIntroUnlockMotionWatch = null
  morphGen += 1
  morphBooting = false
  lastFromEl = null
  lastToEl = null
  lastPlan = null
  lastCaseSectionEl = null
  lastCaseMediaEl = null
  lastFormatsSectionEl = null
  lastFormatsSurfaceEl = null
  lastAboutSectionEl = null
  lastAboutSurfaceEl = null
  lastAboutTitleEl = null
  lastAboutEndEl = null
  lastContactSectionEl = null
  lastContactSurfaceEl = null
  surfaceViewportWidth = 0
  fontsResyncBound = false
  captureFailCount = 0
  if (morphWatchTimer) window.clearTimeout(morphWatchTimer)
  clearLayoutResync()
  releaseClipPathEl?.()
  releaseClipPathEl = null
  releaseLiveBoxNudge?.()
  releaseLiveBoxNudge = null
  disconnectAppliedScrollFrames()
  killMorph()
  window.removeEventListener('resize', onResize)
})

onDeactivated(() => {
  keepAliveActive = false
  disconnectAppliedScrollFrames()
  anchorMotion = null
  returnDockScrollY = null
  returnDockInputRevision = appliedScrollInputRevision()
  if (raf) cancelAnimationFrame(raf)
  raf = 0
})

onActivated(() => {
  void nextTick(() => {
    requestAnimationFrame(() => {
      if (hostUnmounted || !hasConnectedSurfaceHost()) return
      keepAliveActive = true
      claimSurfaceDomOwnership()
      connectAppliedScrollFrames()
      capturePoses()
      onResize()
      ensureTick()
    })
  })
})

watch(clipPathEl, (el) => {
  releaseClipPathEl?.()
  releaseClipPathEl = el ? registerFlowSurfaceClipPathEl(el) : null
})

watch(
  [() => props.fromEl, () => props.toEl, () => props.stoneEl, () => props.contactSurfaceEl],
  ([from, to, stone, contact]) => {
    poseResizeObserver?.disconnect()
    if (contactResizeTimer) window.clearTimeout(contactResizeTimer)
    contactResizeTimer = 0
    removeStoneLoadResync?.()
    removeStoneLoadResync = null
    poseResizeObserver = new ResizeObserver((entries) => {
      if (entries.some((entry) => entry.target !== contact)) schedulePoseResync()
      if (!entries.some((entry) => entry.target === contact)) return
      // The pinned mask follows each resize; recapture the full corridor only
      // after the form expansion settles, avoiding global layout reads per frame.
      if (contactResizeTimer) window.clearTimeout(contactResizeTimer)
      contactResizeTimer = window.setTimeout(() => {
        contactResizeTimer = 0
        if (!morphBooting && keepAliveActive) contactTrigger?.refresh()
        schedulePoseResync()
      }, 100)
    })
    if (from) poseResizeObserver.observe(from)
    if (to) poseResizeObserver.observe(to)
    if (contact) poseResizeObserver.observe(contact)
    if (stone instanceof HTMLImageElement) {
      stone.addEventListener('load', schedulePoseResync)
      removeStoneLoadResync = () => stone.removeEventListener('load', schedulePoseResync)
      // This image sizes the Kado waypoint even when a hash starts below it.
      // Do not let native lazy loading postpone the whole Surface corridor.
      if (window.location.hash) stone.loading = 'eager'
    }
  },
  { immediate: true, flush: 'post' },
)

watch(
  () =>
    [
      props.fromEl,
      props.toEl,
      props.stoneEl,
      props.termEl,
      props.bodyEl,
      props.caseSectionEl,
      props.caseMediaEl,
      props.formatsSectionEl,
      props.formatsSurfaceEl,
      props.aboutSectionEl,
      props.aboutSurfaceEl,
      props.aboutTitleEl,
      props.aboutEndEl,
      props.contactSectionEl,
      props.contactSurfaceEl,
      props.plan,
    ] as const,
  () => {
    if (morphWatchTimer) window.clearTimeout(morphWatchTimer)
    morphWatchTimer = window.setTimeout(() => {
      morphWatchTimer = 0
      const from = props.fromEl ?? null
      const to = props.toEl ?? null
      const plan = props.plan ?? null
      const hasCorridor = !!trigger || mobileTriggers.length > 0
      const sameCorridor =
        hasCorridor
        && from === lastFromEl
        && to === lastToEl
        && plan === lastPlan
        && props.caseSectionEl === lastCaseSectionEl
        && props.caseMediaEl === lastCaseMediaEl
        && props.formatsSectionEl === lastFormatsSectionEl
        && props.formatsSurfaceEl === lastFormatsSurfaceEl
        && props.aboutSectionEl === lastAboutSectionEl
        && props.aboutSurfaceEl === lastAboutSurfaceEl
        && props.aboutTitleEl === lastAboutTitleEl
        && props.aboutEndEl === lastAboutEndEl
        && props.contactSectionEl === lastContactSectionEl
        && props.contactSurfaceEl === lastContactSurfaceEl
      if (sameCorridor) {
        // Stone/term/body often arrive a tick later — soft resync, not kill+rebuild.
        resyncAfterLayout()
        ensureTick()
        return
      }
      fromPose = null
      toPose = null
      heroRestPose = null
      liveBox = null
      mobileActive = false
      buildMorph()
    }, 64)
  },
)

// Word appears after line-fill — refresh doc cache only (no corridor rebuild).
watch(
  () => props.wordEl,
  (el) => {
    const doc = readDocBox(el)
    if (doc) lastWordDoc = doc
    mobileCaseHandoffY = null
    if (el && !trigger && mobileTriggers.length === 0) {
      // The mobile word is created after the Hero intro gate. A cold hash
      // must still start a corridor if its earlier geometry capture failed.
      schedulePoseResync()
      return
    }
    if (el && mobileActive) {
      captureMobileScrollBounds()
      paintMobileScrollCorridor()
    }
  },
)

watch(activeCaseId, async () => {
  mobileCaseHandoffY = null
  await nextTick()
  if (mobileActive) {
    captureMobilePoses()
    paintMobileScrollCorridor()
    return
  }
  if (props.caseMediaEl?.hasAttribute('data-case-media-flight')) {
    // A case switch can change the figure's aspect ratio while the raster is
    // between Cases and a neighbouring waypoint. The scroll clock may already
    // be settled, so repaint explicitly instead of waiting for another wheel
    // frame to rebase the flight onto the incoming case geometry.
    paintDesktop(desktopLiveS)
    ensureTick()
    return
  }
  if (caseFramePinned()) {
    syncPinnedMask()
  } else if (caseSurfaceReady.value) {
    const dest = caseMediaPose()
    if (dest) paintBox(dest, 1)
  }
})

// KeepAlive rebuilds and deferred ScrollTrigger refreshes may finish after the
// proxy transition. The shared committed snapshot is the final authority: any
// active desktop host must restore the dock even if an earlier local teardown
// reset its own visual flags.
watch(
  [surfacePaintOwner, () => props.caseMediaEl],
  async ([owner, mediaEl]) => {
    if (owner !== 'return-dock' || !mediaEl) return
    await nextTick()
    if (!hasConnectedSurfaceHost()) return
    returnDockScrollY = window.scrollY
    returnDockInputRevision = appliedScrollInputRevision()
    if (mobileActive || morphBooting) return
    const dest = caseMediaPose()
    if (dest) dockDesktopCaseFrameUnderDetailReturn(dest)
  },
  { flush: 'post' },
)

// The Cases media ref can arrive just after the corridor itself. Complete the
// same hidden handoff then, but never consume it before a live mobile corridor
// exists: a later buildMorph() would otherwise reset the prepared frame.
watch(
  [caseDetailHomeReturnPending, () => props.caseMediaEl],
  ([pending, mediaEl]) => {
    if (
      !pending
      || !mediaEl
      || !mobileActive
      || mobileTriggers.length === 0
      || morphBooting
    ) return
    const dest = caseMediaPose()
    if (dest) dockMobileCaseFrameUnderDetailReturn(dest)
  },
  { flush: 'post' },
)

</script>

<template>
  <div
    ref="shellEl"
    data-flow-surface-host
    class="pointer-events-none fixed inset-x-0 top-0 z-[5] h-[var(--app-screen)]"
  >
    <svg
      width="0"
      height="0"
      class="absolute left-0 top-0 overflow-hidden"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath :id="FLOW_SURFACE_CLIP_ID" clipPathUnits="userSpaceOnUse">
          <path ref="clipPathEl" :d="flowSurfaceMask.path" />
        </clipPath>
      </defs>
    </svg>

    <Teleport :to="pinTo || 'body'" :disabled="!pinTo">
      <div
        ref="frame"
        data-flow-surface-frame
        class="absolute overflow-visible"
        :class="{
          'flow-surface-frame--boot-hidden': !frameBootReady,
          'flow-surface-frame--case-hidden': caseSurfaceReady,
          'flow-surface-frame--proxy-hidden': proxyParked,
          'flow-surface-frame--boot-pending': mobileSectionBootPending,
        }"
        style="top: var(--layout-surface-top); left: var(--layout-margin); width: calc(100% - var(--layout-margin) * 2); height: calc(100% - var(--layout-surface-top) - var(--layout-margin));"
      >
        <FlowSurface
          mode="window"
          class="inset-0 size-full"
          :class="{ 'flow-surface--hero-entry-open': heroSceneEntryActive }"
          :tone-class="toneClass"
          tone-color="var(--flow-surface-tone, var(--palette-stone))"
          :tone-opacity="heroSceneEntryActive ? 0 : 1"
          :active="!caseSurfaceReady"
        >
          <HomeHeroStage
            v-if="stageRest.w > 2"
            :rest-top="stageRest.top"
            :rest-left="stageRest.left"
            :stage-width="stageRest.w"
            :stage-height="stageRest.h"
            :section-el="heroSectionEl"
            :to-el="toEl"
            :route-end-el="stoneEl"
            @scene-entry-change="heroSceneEntryActive = $event"
          />
          <HomeContactStage
            :progress="contactStageProgress"
            :target-el="contactFieldsEl"
          />
        </FlowSurface>
      </div>
    </Teleport>
  </div>
</template>

<style>
.flow-surface-frame--boot-hidden,
.flow-surface-frame--case-hidden,
.flow-surface-frame--proxy-hidden,
.flow-surface-frame--boot-pending {
  opacity: 0;
}

/* The cold scene rises as one translucent layer. Restore the Surface mask only
   after it settles, otherwise the movement reads as a vertical crop reveal. */
.flow-surface--hero-entry-open > .flow-surface__clip {
  overflow: visible !important;
  border-radius: 0 !important;
  clip-path: none !important;
  -webkit-clip-path: none !important;
}

</style>
