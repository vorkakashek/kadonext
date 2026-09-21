<script setup lang="ts">
/**
 * Home cases — one viewport stage + left rail switcher.
 * Grid: full 12-column editorial stage with a compact navigation rail.
 * The figure owns the project media and its case-to-case transition.
 * Flow Surface only uses the figure as a geometry target between sections.
 */
import {
  homeCaseDetailPath,
  type HomeCase,
} from '~/utils/homeCases'
import { CASE_MEDIA_FLIGHT_START_EVENT } from '~/utils/flowSurfaceContract'
import { warmCaseDetailRoute } from '~/utils/caseDetailRouteWarmup'
import {
  isAppleTouchDevice,
  isCoarsePointer,
  isNarrowViewport,
} from '~/utils/mobileViewport'
import { onNavWaveEnter, onNavWaveLeave } from '~/utils/navWaveHover'

const { t } = useI18n()
const localePath = useLocalePath()
const homeCases = useHomeCases()

const rootEl = ref<HTMLElement | null>(null)
const introEl = ref<HTMLElement | null>(null)
const mediaEl = ref<HTMLElement | null>(null)
const bgTrackEl = ref<HTMLElement | null>(null)

const stageEl = ref<HTMLElement | null>(null)
const railEl = ref<HTMLElement | null>(null)
const railListEl = ref<HTMLElement | null>(null)
const blurbEl = ref<HTMLElement | null>(null)
const mobileTailEl = ref<HTMLElement | null>(null)
const gestureHintEl = ref<HTMLElement | null>(null)
/** Avoid SSR Teleport into the page-local colour host. */
const mountBgPortal = ref(false)
const mobileCases = ref(false)
const caseMediaReady = ref(false)
let mobileCasesViewportWidth = 0
/**
 * Freeze the largest mobile viewport once per page load. The browser toolbar can
 * then move without shrinking the Cases colour field or exposing the section
 * above it.
 */
const mobileCasesHeight = ref<number | null>(null)
const caseGestureHintSeen = useCookie<boolean>('kadonext-case-gesture-hint-v2', {
  default: () => false,
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
  sameSite: 'lax',
})
const showCaseGestureHint = computed(
  () => mobileCases.value && !caseGestureHintSeen.value,
)
const casesIntroTitle = computed(() => t('home.cases.title'))
const casesIntroTitleLines = computed(() => (
  casesIntroTitle.value.split('\n').map((line) => Array.from(line))
))

function caseMediaAspectRatio(item: HomeCase) {
  if (mobileCases.value && item.media.mobileWidth && item.media.mobileHeight) {
    return `${item.media.mobileWidth} / ${item.media.mobileHeight}`
  }
  const heightScale = item.id === 'audience' || item.id === 'keys-store' ? 0.85 : 1
  return `${item.media.width} / ${item.media.height * heightScale}`
}

const {
  activeCaseId: activeId,
  casePhase,
  surfaceDocked: caseSurfaceDocked,
  surfaceReady: caseSurfaceReady,
  surfaceReturning: caseSurfaceReturning,
  caseMediaVisible,
  homeReturnMediaDocked,
  routePhase,
  selectCase: selectHomeCase,
  setCaseInverse,
  beginCaseSwitch,
  completeCaseSwitch,
} = useHomeExperience()
const switching = computed(() => casePhase.value === 'switching')
/** Restarted for every case; appears only after the surface/media have settled. */
const showCaseArrow = ref(false)
let caseArrowTimer = 0
/**
 * The first case image should not compete with the hero's initial payload.
 * Once the brand reveal is complete, warm and decode it while the browser is idle
 * so the Kado → Cases handoff has a ready raster.
 */
const preload = useBrandPreload()
const {
  openCaseDetail,
} = useCaseDetailTransition()

const caseDetailHomeReturnActive = computed(() => routePhase.value === 'returning-home')
const hideCaseCopyDuringDetailReturn = computed(() => (
  caseDetailHomeReturnActive.value
  && !homeReturnMediaDocked.value
))
const showLocalCaseMedia = computed(() => (
  (caseMediaVisible.value || homeReturnMediaDocked.value)
  && (!caseDetailHomeReturnActive.value || homeReturnMediaDocked.value)
))

const activeCase = computed(
  () => homeCases.value.find((c) => c.id === activeId.value) ?? homeCases.value[0],
)
const activeBlurb = computed(() => activeCase.value?.blurb ?? '')

const sections = computed(() => {
  const el = rootEl.value
  return el ? [el] : []
})

defineExpose({
  sections,
  rootEl,
  mediaEl,
})

function onRailBtnClick(item: HomeCase) {
  void selectCase(item)
}

function openCaseDetailFromMedia(item: HomeCase) {
  const media = mediaEl.value
  if (!media) return
  const rect = media.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return
  const paintedImage = media.querySelector<HTMLImageElement>(
    `[data-case-layer="${item.id}"] img`,
  ) ?? media.querySelector<HTMLImageElement>('img')
  const imageRect = paintedImage?.getBoundingClientRect()
  openCaseDetail({
    to: localePath(homeCaseDetailPath(item)),
    origin: 'home',
    src: item.media.src,
    proxySrc: paintedImage?.currentSrc || undefined,
    webpSrcset: item.media.webpSrcset,
    avifSrcset: item.media.avifSrcset,
    alt: item.media.alt,
    wash: item.wash,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    imageRect: imageRect
      ? { top: imageRect.top, left: imageRect.left, width: imageRect.width, height: imageRect.height }
      : undefined,
  })
}

function onCaseDetailLink(item: HomeCase, e: MouseEvent) {
  e.preventDefault()
  openCaseDetailFromMedia(item)
}

function warmCaseDetail(item: HomeCase) {
  void warmCaseDetailRoute(localePath(homeCaseDetailPath(item)))
}

let caseSwipeStart: { x: number; y: number; pointerId: number } | null = null
/** Prevent the synthetic link click that follows a completed horizontal swipe. */
let suppressCaseLinkClick = false
let suppressCaseLinkClickTimer = 0
const CASE_SWIPE_MIN_PX = 52
const CASE_SWIPE_HORIZONTAL_RATIO = 1.75

function isIntentionalHorizontalCaseSwipe(dx: number, dy: number) {
  const horizontal = Math.abs(dx)
  const vertical = Math.abs(dy)
  return horizontal >= CASE_SWIPE_MIN_PX
    && horizontal >= vertical * CASE_SWIPE_HORIZONTAL_RATIO
}

let caseGestureStart: { x: number; y: number; pointerId: number } | null = null

function dismissCaseGestureHint() {
  caseGestureHintSeen.value = true
}

function dismissCaseGestureHintFromAction() {
  dismissCaseGestureHint()
}

function onCaseGesturePointerDown(e: PointerEvent) {
  if (!e.isPrimary) return
  caseGestureStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
  if (e.currentTarget instanceof HTMLElement) {
    e.currentTarget.setPointerCapture(e.pointerId)
  }
}

function onCaseGesturePointerCancel() {
  caseGestureStart = null
}

function onCaseGesturePointerUp(e: PointerEvent) {
  const start = caseGestureStart
  caseGestureStart = null
  if (!start || start.pointerId !== e.pointerId) return

  const dx = e.clientX - start.x
  const dy = e.clientY - start.y
  const horizontalSwipe = isIntentionalHorizontalCaseSwipe(dx, dy)
  if (horizontalSwipe) {
    e.preventDefault()
    dismissCaseGestureHint()
    selectAdjacentCase(dx < 0 ? 1 : -1)
  }
}

function onCaseStagePointerDown(e: PointerEvent) {
  if (!mobileCases.value || !e.isPrimary) return
  // Links remain normal tap targets. We still capture their pointer sequence so
  // a horizontal drag across either the title or the image can switch cases.
  if (
    e.target instanceof Element
    && e.target.closest('button, .cases-gesture-hint')
  ) return
  caseSwipeStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
  if (e.currentTarget instanceof HTMLElement) {
    e.currentTarget.setPointerCapture(e.pointerId)
  }
}

function onCaseStagePointerCancel() {
  caseSwipeStart = null
}

function onCaseStagePointerUp(e: PointerEvent) {
  const start = caseSwipeStart
  caseSwipeStart = null
  if (!start || start.pointerId !== e.pointerId || !mobileCases.value) return

  const dx = e.clientX - start.x
  const dy = e.clientY - start.y
  if (!isIntentionalHorizontalCaseSwipe(dx, dy)) return
  // Browsers dispatch a click after pointerup, including when the gesture began
  // on a link. Suppress that one click so the swipe does not open the case.
  e.preventDefault()
  suppressCaseLinkClick = true
  if (suppressCaseLinkClickTimer) window.clearTimeout(suppressCaseLinkClickTimer)
  suppressCaseLinkClickTimer = window.setTimeout(() => {
    suppressCaseLinkClick = false
    suppressCaseLinkClickTimer = 0
  }, 0)
  selectAdjacentCase(dx < 0 ? 1 : -1)
}

function onCaseStageClickCapture(e: MouseEvent) {
  if (!suppressCaseLinkClick) return
  suppressCaseLinkClick = false
  if (suppressCaseLinkClickTimer) window.clearTimeout(suppressCaseLinkClickTimer)
  suppressCaseLinkClickTimer = 0
  e.preventDefault()
  e.stopPropagation()
}

function scrollActiveCaseLinkIntoView(behavior: ScrollBehavior = 'smooth') {
  const list = railListEl.value
  const active = list?.querySelector<HTMLElement>('.cases-rail__btn--active')
  if (!list || !active) return

  const listBox = list.getBoundingClientRect()
  const activeBox = active.getBoundingClientRect()
  const inlinePad = Number.parseFloat(getComputedStyle(list).paddingLeft) || 0
  const target = Math.max(
    0,
    Math.min(
      list.scrollWidth - list.clientWidth,
      list.scrollLeft + activeBox.left - listBox.left - inlinePad,
    ),
  )
  list.scrollTo({ left: target, behavior })
}

/** Center the incoming mobile label before it grows into the active state. */
function railTargetForCase(caseId: string) {
  const list = railListEl.value
  const button = list?.querySelector<HTMLElement>(
    `.cases-rail__btn[data-case-id="${caseId}"]`,
  )
  if (!list || !button) return null

  const listBox = list.getBoundingClientRect()
  const buttonBox = button.getBoundingClientRect()
  return Math.max(
    0,
    Math.min(
      list.scrollWidth - list.clientWidth,
      list.scrollLeft + buttonBox.left - listBox.left - (list.clientWidth - buttonBox.width) / 2,
    ),
  )
}

async function tweenRailToCase(
  gsap: typeof import('gsap').default,
  caseId: string,
) {
  if (!mobileCases.value || !railListEl.value) return
  const target = railTargetForCase(caseId)
  if (target == null || Math.abs(target - railListEl.value.scrollLeft) < 1) return

  const tween = gsap.to(railListEl.value, {
    scrollLeft: target,
    duration: 0.36,
    ease: 'power2.inOut',
    overwrite: true,
  })
  switchTl = tween
  await waitTimeline(tween)
}

function revealActiveCaseUnderline() {
  const active = railListEl.value?.querySelector<HTMLElement>(
    '.cases-rail__btn--active',
  )
  if (!active) return
  void onNavWaveEnter({ currentTarget: active })
}

function hideActiveCaseUnderline() {
  const active = railListEl.value?.querySelector<HTMLElement>(
    '.cases-rail__btn--active',
  )
  if (!active) return
  void onNavWaveLeave({ currentTarget: active })
}

function selectAdjacentCase(direction: 1 | -1) {
  const from = homeCases.value.findIndex((item) => item.id === targetCaseId)
  const index = from >= 0 ? from : 0
  const next = homeCases.value[(index + direction + homeCases.value.length) % homeCases.value.length]
  if (next) void selectCase(next)
}

function prefersReduce() {
  return (
    typeof window !== 'undefined'
    && prefersReducedMotion()
  )
}

function isMobileCases() {
  return isAppleTouchDevice() || isNarrowViewport() || isCoarsePointer()
}

function refreshMobileCases() {
  const width = window.innerWidth
  const nextMobile = isMobileCases()
  if (width === mobileCasesViewportWidth && nextMobile === mobileCases.value) return
  mobileCasesViewportWidth = width
  mobileCases.value = nextMobile
  scheduleMobileStageCollapse()
}

function captureMobileCasesHeight() {
  if (!mobileCases.value || mobileCasesHeight.value != null) return
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;height:100lvh;'
  document.body.appendChild(probe)
  mobileCasesHeight.value = Math.ceil(probe.getBoundingClientRect().height)
  probe.remove()
}

watch(
  activeCase,
  (item) => {
    setCaseInverse(!!item?.inverse)
  },
  { immediate: true },
)

watch([activeCase, mobileCases], scheduleMobileStageCollapse, { flush: 'post' })
watch(switching, (active) => {
  if (!active) scheduleMobileStageCollapse()
})

let initialCaseWarmImage: HTMLImageElement | null = null
let initialCaseWarmScheduled = false
let firstCaseNear = false
let firstCaseObserver: IntersectionObserver | null = null
const warmedCaseMedia = new Map<string, HTMLImageElement>()

function isColdCasesHashEntry() {
  return typeof window !== 'undefined'
    && window.location.hash === '#cases'
    && !preload.revealed.value
    && !caseDetailHomeReturnActive.value
}

function warmInitialCaseMedia(priority = false) {
  if (caseMediaReady.value || initialCaseWarmImage) return
  const initial = activeCase.value ?? homeCases.value[0]
  if (!initial) return

  const image = warmCaseMedia(initial, priority)
  initialCaseWarmImage = image
  const finish = () => {
    void image.decode().catch(() => undefined).finally(() => {
      caseMediaReady.value = true
    })
  }
  if (image.complete) finish()
  else image.addEventListener('load', finish, { once: true })
  image.addEventListener('error', () => {
    caseMediaReady.value = true
  }, { once: true })
}

function warmCaseMedia(item: HomeCase, priority = false) {
  const cached = warmedCaseMedia.get(item.media.src)
  if (cached) return cached

  const image = new Image()
  warmedCaseMedia.set(item.media.src, image)
  if (priority) image.fetchPriority = 'high'
  image.srcset = item.media.avifSrcset ?? item.media.webpSrcset ?? ''
  image.sizes = '(max-width: 767px) 92vw, 42vw'
  image.src = item.media.src
  return image
}

function scheduleFirstCaseWarm() {
  const directCasesEntry = isColdCasesHashEntry()
  if (
    initialCaseWarmScheduled
    || (!directCasesEntry && (!preload.revealed.value || !firstCaseNear))
  ) return
  initialCaseWarmScheduled = true
  // At /#cases this image is in the initial viewport, not a later enhancement.
  // Start it now instead of waiting for the Hero-oriented idle budget.
  if (directCasesEntry) {
    warmInitialCaseMedia(true)
    return
  }
  const warm = () => {
    const firstCase = homeCases.value[0]
    if (firstCase) warmCaseDetail(firstCase)
    warmInitialCaseMedia()
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 1200 })
  } else {
    globalThis.setTimeout(warm, 250)
  }
}

watch(
  () => preload.revealed.value,
  scheduleFirstCaseWarm,
  { immediate: true },
)

let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let introCtx: { revert: () => void } | null = null
let railCtx: { revert: () => void } | null = null
let enterCtx: { revert: () => void } | null = null
let enterTl: { kill: () => void } | null = null
let playCasesEnterMotion: (() => void) | null = null
let resetCasesEnterMotion: (() => void) | null = null
/** Deduplicate ScrollTrigger entry and the later FlowSurface dock signal. */
let casesEnterMotionVisible = false
let switchTl: { kill: () => void } | null = null
let bgPortalRo: ResizeObserver | null = null
let blurbRo: ResizeObserver | null = null
let mobileStageCollapseSt: { kill: () => void } | null = null
let mobileStageCollapseRaf = 0
let mobileStageCollapseGen = 0

async function ensureGsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  if (!stMod) {
    const mod = await import('gsap/ScrollTrigger')
    stMod = mod.ScrollTrigger
    gsapMod.registerPlugin(stMod)
  }
  return gsapMod
}

/** Keep the colour plate under FlowSurface aligned to the cases section. */
function syncColorPlate() {
  const section = rootEl.value
  const plate = bgTrackEl.value
  if (!section || !plate) return
  const host = plate.offsetParent as HTMLElement | null
  if (!host) return
  const sectionBox = section.getBoundingClientRect()
  const hostBox = host.getBoundingClientRect()
  plate.style.top = `${sectionBox.top - hostBox.top}px`
  plate.style.height = `${sectionBox.height}px`
}

type MobileStageCollapseMetrics = {
  gap: number
  startY: number
  distance: number
}

/** Keep a full-screen opening pose, but isolate its empty part in a tail that
 * can collapse as the reader scrolls toward the next section. */
function measureMobileStageCollapse(): MobileStageCollapseMetrics | null {
  const stage = stageEl.value
  const tail = mobileTailEl.value
  if (!stage || !tail) return null

  mobileStageCollapseSt?.kill()
  mobileStageCollapseSt = null

  if (!mobileCases.value) {
    stage.style.removeProperty('min-height')
    tail.style.removeProperty('height')
    return null
  }

  // Override the CSS first-paint fallback while measuring natural content.
  stage.style.minHeight = '0px'
  tail.style.height = '0px'
  if (prefersReduce()) return null

  const naturalHeight = stage.getBoundingClientRect().height
  const viewportHeight = mobileCasesHeight.value
    ?? Math.max(document.documentElement.clientHeight, window.innerHeight, 1)
  const gap = Math.max(0, viewportHeight - naturalHeight)
  if (gap < 1) return null

  const railHeight = railEl.value?.getBoundingClientRect().height ?? 0
  const stageTop = stage.getBoundingClientRect().top + window.scrollY
  const startY = Math.max(0, stageTop - railHeight)
  const distance = Math.max(
    120,
    Math.min(viewportHeight * 0.38, Math.max(gap * 0.85, 120)),
  )
  const progress = Math.min(1, Math.max(0, (window.scrollY - startY) / distance))

  tail.style.height = `${gap * (1 - progress)}px`
  return { gap, startY, distance }
}

async function setupMobileStageCollapse(gen: number) {
  if (gen !== mobileStageCollapseGen || switching.value) return
  const metrics = measureMobileStageCollapse()
  if (!metrics) return

  await ensureGsap()
  if (
    gen !== mobileStageCollapseGen
    || switching.value
    || !mobileCases.value
    || !stageEl.value
    || !mobileTailEl.value
  ) return

  const tail = mobileTailEl.value
  mobileStageCollapseSt = stMod!.create({
    trigger: stageEl.value,
    start: metrics.startY,
    end: metrics.startY + metrics.distance,
    onUpdate: (self) => {
      tail.style.height = `${metrics.gap * (1 - self.progress)}px`
    },
  })
}

function scheduleMobileStageCollapse() {
  const gen = ++mobileStageCollapseGen
  if (mobileStageCollapseRaf) cancelAnimationFrame(mobileStageCollapseRaf)
  mobileStageCollapseRaf = requestAnimationFrame(() => {
    mobileStageCollapseRaf = 0
    void setupMobileStageCollapse(gen)
  })
}

/** Copy blocks only — the media is owned by FlowSurface. */
type StageCopyParts = {
  blurb: HTMLElement | null
  all: HTMLElement[]
}

function stageCopyParts(): StageCopyParts {
  const stage = stageEl.value
  if (!stage) {
    return {
      blurb: null,
      all: [],
    }
  }
  const blurb = stage.querySelector<HTMLElement>('.cases-blurb')
  const all = [blurb].filter(
    (el): el is HTMLElement => !!el,
  )
  return { blurb, all }
}

function railAnimTargets(): HTMLElement[] {
  const rail = railEl.value
  if (!rail) return []
  return Array.from(rail.querySelectorAll<HTMLElement>('.cases-rail__list > li'))
}

type IntroMotionParts = {
  chars: HTMLElement[]
  all: HTMLElement[]
}

function introMotionParts(): IntroMotionParts {
  const intro = introEl.value
  if (!intro) return { chars: [], all: [] }
  const chars = Array.from(
    intro.querySelectorAll<HTMLElement>('.cases-intro__char'),
  )
  return { chars, all: chars }
}

function setIntroHidden(
  gsap: typeof import('gsap').default,
  parts: IntroMotionParts,
) {
  if (parts.chars.length) gsap.set(parts.chars, { yPercent: 115 })
}

async function setupIntroMotion() {
  introCtx?.revert()
  introCtx = null

  const intro = introEl.value
  if (!intro) return

  const gsap = await ensureGsap()
  const parts = introMotionParts()
  if (prefersReduce()) {
    if (parts.all.length) gsap.set(parts.all, { clearProps: 'transform' })
    return
  }

  introCtx = gsap.context(() => {
    setIntroHidden(gsap, parts)

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      scrollTrigger: {
        trigger: intro,
        start: 'bottom bottom',
        toggleActions: 'play none none reverse',
      },
    })

    if (parts.chars.length) {
      tl.to(
        parts.chars,
        { yPercent: 0, duration: 1.1, stagger: 0.055, ease: 'power4.out' },
        0,
      )
    }
  }, intro)
}

async function setupRailMotion() {
  railCtx?.revert()
  railCtx = null

  const rail = railEl.value
  if (!rail || mobileCases.value) return

  const gsap = await ensureGsap()
  const links = railAnimTargets()
  if (!links.length) return
  if (prefersReduce()) {
    gsap.set(links, { clearProps: 'opacity,visibility,transform' })
    gsap.set(rail, {
      '--cases-rule-scale': 1,
      '--cases-backdrop-opacity': 1,
      '--cases-backdrop-scale': 1,
    })
    return
  }

  railCtx = gsap.context(() => {
    let tailRetracted = false
    const syncBackdropTail = () => {
      const stickyTop = Number.parseFloat(getComputedStyle(rail).top)
      if (!Number.isFinite(stickyTop)) return
      const next = rail.getBoundingClientRect().top < stickyTop - 1
      if (next === tailRetracted) return
      tailRetracted = next
      rail.classList.toggle('cases-rail--tail-retracted', next)
    }

    stMod?.create({
      trigger: rootEl.value,
      start: 'top bottom',
      end: 'bottom top',
      onRefresh: syncBackdropTail,
      onUpdate: syncBackdropTail,
    })

    gsap.set(links, { opacity: 0, y: 28, clearProps: 'visibility' })
    gsap.set(rail, {
      '--cases-rule-scale': 0,
      '--cases-backdrop-opacity': 0,
      '--cases-backdrop-scale': 0,
    })
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      scrollTrigger: {
        trigger: rail,
        start: 'bottom bottom',
        toggleActions: 'play none none reverse',
      },
    })
    tl.to(links, {
      opacity: 1,
      y: 0,
      duration: 1.1,
      stagger: 0.14,
    })
    tl.to(rail, {
      '--cases-rule-scale': 1,
      duration: 1.1,
      ease: 'power3.out',
    }, 0)
    tl.to(rail, {
      '--cases-backdrop-opacity': 1,
      '--cases-backdrop-scale': 1,
      duration: 1.1,
      ease: 'power3.out',
    }, 0.5)
    tl.set(links, { clearProps: 'opacity,transform' }, '>')
  }, rail)
}

const COPY_IN = {
  blurbY: 20,
  delay: 0.4,
  // The description should settle after the media, not compete with its morph.
  dur: 0.75 * 1.75,
} as const

const COPY_OUT = {
  blurbY: 16,
  dur: 0.35,
} as const

function setCopyHidden(
  gsap: typeof import('gsap').default,
  parts: StageCopyParts,
) {
  if (parts.blurb) {
    gsap.set(parts.blurb, {
      opacity: 0,
      x: 0,
      y: COPY_IN.blurbY,
      clearProps: 'visibility',
    })
  }
}

/** Description rises in after each media morph. */
function tweenCopyIn(
  tl: {
    to: (
      targets: HTMLElement | HTMLElement[],
      vars: Record<string, unknown>,
      position?: number | string,
    ) => unknown
  },
  parts: StageCopyParts,
  at = 0,
) {
  if (parts.blurb) {
    tl.to(
      parts.blurb,
      { opacity: 1, y: 0, duration: COPY_IN.dur, ease: 'power3.out' },
      at + COPY_IN.delay,
    )
  }
}

/** Reverse of the description entrance. */
function tweenCopyOut(
  tl: {
    to: (
      targets: HTMLElement | HTMLElement[],
      vars: Record<string, unknown>,
      position?: number | string,
    ) => unknown
  },
  parts: StageCopyParts,
  at = 0,
) {
  if (parts.blurb) {
    tl.to(
      parts.blurb,
      {
        opacity: 0,
        y: COPY_OUT.blurbY,
        duration: COPY_OUT.dur,
        ease: 'power2.in',
      },
      at + 0.05,
    )
  }
}

async function setupEnterMotion() {
  enterCtx?.revert()
  enterCtx = null
  playCasesEnterMotion = null
  resetCasesEnterMotion = null
  casesEnterMotionVisible = false

  const section = rootEl.value
  if (!section) return

  const gsap = await ensureGsap()
  if (prefersReduce()) {
    const rail = mobileCases.value ? railAnimTargets() : []
    const parts = stageCopyParts()
    if (rail.length) gsap.set(rail, { clearProps: 'opacity,visibility,transform' })
    if (parts.all.length) {
      gsap.set(parts.all, { clearProps: 'opacity,visibility,transform' })
    }
    return
  }

  let localEnter: { kill: () => void } | null = null

  const playIn = () => {
    if (switching.value || casesEnterMotionVisible) return
    // On touch layouts the sticky rail must not cover the incoming Surface.
    // Its entrance is owned by the settled-case signal below, not the section
    // ScrollTrigger, so it starts only after the flight has reached the card.
    if (mobileCases.value && (!caseSurfaceDocked.value || caseSurfaceReturning.value)) return
    localEnter?.kill()
    enterTl?.kill()
    const rail = mobileCases.value ? railAnimTargets() : []
    const railPanel = mobileCases.value ? railEl.value : null
    const parts = stageCopyParts()
    if (!rail.length && !parts.all.length) return
    casesEnterMotionVisible = true

    if (railPanel) {
      gsap.set(railPanel, { autoAlpha: 0, pointerEvents: 'none' })
    }
    if (rail.length) {
      gsap.set(
        rail,
        mobileCases.value
          ? { opacity: 0, clearProps: 'visibility,transform' }
          : { opacity: 0, y: 28, clearProps: 'visibility' },
      )
    }
    setCopyHidden(gsap, parts)

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    localEnter = tl
    enterTl = tl
    if (railPanel) {
      tl.to(railPanel, { autoAlpha: 1, duration: 0.5 }, 0)
      tl.set(railPanel, { pointerEvents: 'auto' }, 0.18)
      tl.call(revealActiveCaseUnderline, [], 0.18)
    }
    if (rail.length) {
      tl.to(
        rail,
        mobileCases.value
          ? { opacity: 1, duration: 1.1, stagger: 0.14 }
          : { opacity: 1, y: 0, duration: 1.1, stagger: 0.14 },
        0,
      )
    }
    tweenCopyIn(tl, parts, rail.length ? 0.18 : 0)
    if (rail.length) {
      tl.set(rail, { clearProps: 'opacity,transform' }, '>')
    }
    if (railPanel) {
      tl.set(railPanel, { clearProps: 'opacity,visibility,pointerEvents' }, '>')
    }
  }

  const resetOut = () => {
    if (switching.value || !casesEnterMotionVisible) return
    casesEnterMotionVisible = false
    localEnter?.kill()
    enterTl?.kill()
    const rail = mobileCases.value ? railAnimTargets() : []
    const railPanel = mobileCases.value ? railEl.value : null
    const parts = stageCopyParts()
    if (!rail.length && !parts.all.length) {
      enterTl = null
      localEnter = null
      return
    }

    const tl = gsap.timeline({ defaults: { ease: 'power2.in' } })
    localEnter = tl
    enterTl = tl
    if (railPanel) {
      tl.set(railPanel, { pointerEvents: 'none' }, 0)
      tl.to(railPanel, { autoAlpha: 0, duration: 0.55 }, 0)
    }
    if (rail.length) {
      tl.to(
        rail,
        mobileCases.value
          ? { opacity: 0, duration: 0.55, stagger: 0.05 }
          : { opacity: 0, y: 20, duration: 0.55, stagger: 0.05 },
        0,
      )
    }
    tweenCopyOut(tl, parts, 0)
  }

  playCasesEnterMotion = playIn
  resetCasesEnterMotion = resetOut

  enterCtx = gsap.context(() => {
    const rail = mobileCases.value ? railAnimTargets() : []
    const railPanel = mobileCases.value ? railEl.value : null
    const parts = stageCopyParts()
    if (railPanel) {
      gsap.set(railPanel, { autoAlpha: 0, pointerEvents: 'none' })
    }
    if (rail.length) {
      gsap.set(
        rail,
        mobileCases.value
          ? { opacity: 0, clearProps: 'visibility,transform' }
          : { opacity: 0, y: 28, clearProps: 'visibility' },
      )
    }
    setCopyHidden(gsap, parts)

    const st = stMod!.create({
      trigger: section,
      // Later than before (~15%): was top 48% → top 33%.
      start: 'top 33%',
      end: 'bottom 18%',
      onEnter: playIn,
      onEnterBack: playIn,
      onLeave: resetOut,
      // Mobile reverse exit is owned by FlowSurface when Cases top reaches 90%.
      onLeaveBack: () => {
        if (!mobileCases.value) resetOut()
      },
    })
    if (st.isActive) {
      if (mobileCases.value && caseSurfaceReturning.value) resetOut()
      else playIn()
    }
  }, section)
}

watch([caseSurfaceReturning, caseSurfaceDocked], ([returning, docked]) => {
  if (!mobileCases.value) return
  if (returning) resetCasesEnterMotion?.()
  else if (docked) playCasesEnterMotion?.()
}, { flush: 'sync' })

function waitTimeline(tl: gsap.core.Animation) {
  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    // Empty / already-finished timelines never fire onComplete if we attach late.
    const dur = typeof tl.totalDuration === 'function' ? tl.totalDuration() : 0
    const prog = typeof tl.progress === 'function' ? tl.progress() : 0
    if (!(dur > 0) || prog >= 1) {
      finish()
      return
    }
    tl.eventCallback('onComplete', finish)
    tl.eventCallback('onInterrupt', finish)
  })
}

let switchGen = 0
// The home route remounts after a case-detail return while `activeId` is kept
// in Nuxt state. Start from that persisted selection; otherwise returning from
// any non-Audience case makes the first Audience click look like a no-op.
let targetCaseId = activeId.value
let heightTl: { kill: () => void } | null = null
let railPositionTl: { kill: () => void } | null = null
let mediaGeometryTl: { kill: () => void } | null = null
const CASE_MEDIA_GEOMETRY_DURATION = 0.9
const CASE_MEDIA_SURFACE_INSET_PX = 1

function clearCaseMediaSurfaceResize(media: HTMLElement | null) {
  if (!media) return
  media.removeAttribute('data-case-media-resize')
  media.style.removeProperty('--cases-media-surface-width')
  media.style.removeProperty('--cases-media-surface-height')
}

function cancelCaseMediaGeometry(preserveSurfaceFlight = false) {
  const media = mediaEl.value
  const localMedia = media?.querySelector<HTMLElement>('[data-case-local-media]')
  mediaGeometryTl?.kill()
  mediaGeometryTl = null
  clearCaseMediaSurfaceResize(media)

  if (media) {
    if (gsapMod) gsapMod.set(media, { clearProps: 'transform,transformOrigin' })
    else {
      for (const property of [
        'transform',
        'transform-origin',
        'translate',
        'rotate',
        'scale',
      ]) media.style.removeProperty(property)
    }
  }
  if (!localMedia || preserveSurfaceFlight) return

  if (gsapMod) {
    gsapMod.set(localMedia, {
      clearProps: 'inset,left,top,right,bottom,width,height',
    })
    return
  }
  for (const property of [
    'inset',
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
  ]) localMedia.style.removeProperty(property)
}

function onCaseMediaFlightStart() {
  // The event is fired before FlowSurface writes its fixed geometry, so this
  // cleanup cannot erase the new owner. This also covers scrolling that begins
  // halfway through an already-running local case resize.
  cancelCaseMediaGeometry(false)
}

function clearCaseArrow() {
  showCaseArrow.value = false
  if (caseArrowTimer) {
    window.clearTimeout(caseArrowTimer)
    caseArrowTimer = 0
  }
}

function scheduleCaseArrow(delay = 300) {
  clearCaseArrow()
  if (!mobileCases.value || !caseSurfaceReady.value || switching.value) return
  caseArrowTimer = window.setTimeout(() => {
    caseArrowTimer = 0
    if (mobileCases.value && caseSurfaceReady.value && !switching.value) {
      showCaseArrow.value = true
    }
  }, delay)
}

watch([caseSurfaceReady, switching], ([ready, isSwitching]) => {
  if (!ready || isSwitching) clearCaseArrow()
  else scheduleCaseArrow()
})

watch(activeId, () => clearCaseArrow())

function onMediaLayoutReady() {
  requestAnimationFrame(() => {
    scheduleMobileStageCollapse()
  })
}

function tweenSectionHeight(
  gsap: typeof import('gsap').default,
  el: HTMLElement,
  fromH: number,
  toH: number,
) {
  if (Math.abs(toH - fromH) < 2) {
    gsap.set(el, { clearProps: 'height' })
    return 0
  }

  heightTl?.kill()
  gsap.set(el, { height: fromH })
  // Let the colour field settle with the content instead of snapping after the
  // media changes pose. Larger geometry changes get a little more time, while
  // small switches still feel responsive.
  const duration = sectionHeightDuration(fromH, toH)

  const settleToNaturalHeight = (targetH: number, pass = 0) => {
    const tween = gsap.to(el, {
      height: targetH,
      duration: pass === 0 ? duration : Math.min(0.42, duration * 0.45),
      ease: 'power3.inOut',
      onComplete: () => {
        if (heightTl !== tween) return

        const renderedH = el.getBoundingClientRect().height
        el.style.height = 'auto'
        const naturalH = el.offsetHeight

        // Intrinsic media and font metrics can settle during the first tween.
        // Reconcile that late layout while the explicit height still owns the
        // colour plate, then hand back to auto only when both sizes agree.
        if (pass < 2 && Math.abs(naturalH - renderedH) >= 2) {
          gsap.set(el, { height: renderedH })
          settleToNaturalHeight(naturalH, pass + 1)
          return
        }

        gsap.set(el, { clearProps: 'height' })
        heightTl = null
      },
    })
    heightTl = tween
  }

  settleToNaturalHeight(toH)
  return duration
}

function sectionHeightDuration(fromH: number, toH: number) {
  const viewportH = Math.max(window.innerHeight, 1)
  const distance = Math.min(Math.abs(toH - fromH) / viewportH, 1)
  return 0.9 + distance * 0.45
}

function railIsBottomStopped(rail: HTMLElement) {
  const stickyTop = Number.parseFloat(getComputedStyle(rail).top)
  if (!Number.isFinite(stickyTop)) return false
  return rail.getBoundingClientRect().top < stickyTop - 1
}

function tweenStoppedRailPosition(
  gsap: typeof import('gsap').default,
  rail: HTMLElement | null,
  previousTop: number | null,
  shouldCompensate: boolean,
  duration: number,
) {
  if (!rail || previousTop === null || !shouldCompensate) return

  const offset = previousTop - rail.getBoundingClientRect().top
  if (Math.abs(offset) < 1) return

  railPositionTl?.kill()
  gsap.set(rail, { y: offset })
  railPositionTl = gsap.to(rail, {
    y: 0,
    duration,
    ease: 'power3.inOut',
    clearProps: 'transform',
    onComplete: () => {
      railPositionTl = null
    },
  })
}

/**
 * The case figure owns this FLIP only while the Surface is parked. During a
 * scroll flight FlowSurface owns the raster geometry end-to-end.
 */
function tweenCaseMediaGeometry(
  gsap: typeof import('gsap').default,
  from: DOMRect | null,
) {
  const media = mediaEl.value
  const localMedia = media?.querySelector<HTMLElement>('[data-case-local-media]')
  if (!media || !localMedia || !from) return
  const to = media.getBoundingClientRect()
  if (from.width < 2 || from.height < 2 || to.width < 2 || to.height < 2) return

  const x = from.left - to.left
  const y = from.top - to.top
  const scaleX = from.width / to.width
  const scaleY = from.height / to.height
  if (
    Math.abs(x) < 0.5
    && Math.abs(y) < 0.5
    && Math.abs(scaleX - 1) < 0.002
    && Math.abs(scaleY - 1) < 0.002
  ) return

  mediaGeometryTl?.kill()
  media.setAttribute('data-case-media-resize', '')
  gsap.set(media, {
    '--cases-media-surface-width': `${Math.max(1, from.width - CASE_MEDIA_SURFACE_INSET_PX * 2)}px`,
    '--cases-media-surface-height': `${Math.max(1, from.height - CASE_MEDIA_SURFACE_INSET_PX * 2)}px`,
  })
  // Translate the figure itself so its position follows a compositor-backed
  // FLIP. Resize only the crop window; scaling the figure would squash the
  // screenshot whenever the incoming case has another aspect ratio.
  gsap.set(media, {
    x,
    y,
    transformOrigin: '0 0',
  })
  gsap.set(localMedia, {
    inset: 'auto',
    left: 0,
    top: 0,
    right: 'auto',
    bottom: 'auto',
    width: from.width,
    height: from.height,
  })
  const timeline = gsap.timeline({
    onComplete: () => {
      mediaGeometryTl = null
      clearCaseMediaSurfaceResize(media)
    },
  })
  timeline.to(media, {
    x: 0,
    y: 0,
    '--cases-media-surface-width': `${Math.max(1, to.width - CASE_MEDIA_SURFACE_INSET_PX * 2)}px`,
    '--cases-media-surface-height': `${Math.max(1, to.height - CASE_MEDIA_SURFACE_INSET_PX * 2)}px`,
    duration: CASE_MEDIA_GEOMETRY_DURATION,
    ease: 'power3.inOut',
    clearProps: 'transform,transformOrigin',
  }, 0)
  timeline.to(localMedia, {
    width: to.width,
    height: to.height,
    duration: CASE_MEDIA_GEOMETRY_DURATION,
    ease: 'power3.inOut',
    clearProps: 'inset,left,top,right,bottom,width,height',
  }, 0)
  mediaGeometryTl = timeline
}

async function selectCase(item: HomeCase) {
  if (targetCaseId === item.id) return
  targetCaseId = item.id
  warmCaseMedia(item)

  const gsap = await ensureGsap()

  if (prefersReduce()) {
    selectHomeCase(item.id, !!item.inverse)
    await nextTick()
    measureMobileStageCollapse()
    scheduleMobileStageCollapse()
    scrollActiveCaseLinkIntoView('auto')
    revealActiveCaseUnderline()
    scheduleCaseArrow()
    return
  }

  const gen = ++switchGen
  beginCaseSwitch()
  mobileStageCollapseSt?.kill()
  mobileStageCollapseSt = null

  hideActiveCaseUnderline()

  enterTl?.kill()
  enterTl = null
  switchTl?.kill()
  switchTl = null
  heightTl?.kill()
  heightTl = null
  railPositionTl?.kill()
  railPositionTl = null
  const surfaceOwnsMediaFlight = mediaEl.value
    ?.hasAttribute('data-case-media-flight') ?? false
  cancelCaseMediaGeometry(surfaceOwnsMediaFlight)

  // On mobile, move the rail before activating the incoming link.
  await tweenRailToCase(gsap, item.id)
  if (gen !== switchGen) return

  // Animate old copy out before the next figure changes its dimensions.
  const parts = stageCopyParts()
  const out = gsap.timeline({ defaults: { ease: 'power2.in' } })
  switchTl = out
  tweenCopyOut(out, parts, 0)
  await waitTimeline(out)
  if (gen !== switchGen) return

  // Update the case DOM. The outgoing/incoming rasters and the figure geometry
  // transition locally; FlowSurface is no longer part of this timeline.
  const root = rootEl.value
  const rail = railEl.value
  const mediaRectBeforeLayout = surfaceOwnsMediaFlight
    ? null
    : (mediaEl.value?.getBoundingClientRect() ?? null)
  const wasRailBottomStopped = !!rail && railIsBottomStopped(rail)
  const railTopBeforeLayout = rail?.getBoundingClientRect().top ?? null
  const fromH = root?.offsetHeight ?? 0
  if (root && fromH) gsap.set(root, { height: fromH })
  selectHomeCase(item.id, !!item.inverse)
  await nextTick()
  if (gen !== switchGen) return
  measureMobileStageCollapse()
  revealActiveCaseUnderline()
  if (!mediaEl.value?.hasAttribute('data-case-media-flight')) {
    tweenCaseMediaGeometry(gsap, mediaRectBeforeLayout)
  }
  if (root && fromH) {
    root.style.height = 'auto'
    const toH = root.offsetHeight
    gsap.set(root, { height: fromH })
    const heightDuration = tweenSectionHeight(gsap, root, fromH, toH)
    // A sticky item constrained by the section's bottom edge is laid out again
    // as soon as the incoming case changes the grid height. Preserve its visual
    // position and ease the resulting offset away with the section resize.
    tweenStoppedRailPosition(
      gsap,
      rail,
      railTopBeforeLayout,
      wasRailBottomStopped,
      heightDuration,
    )
  }
  // Animate new copy in.
  const nextParts = stageCopyParts()
  setCopyHidden(gsap, nextParts)
  const inn = gsap.timeline({ defaults: { ease: 'power3.out' } })
  switchTl = inn
  tweenCopyIn(inn, nextParts, 0)
  await waitTimeline(inn)

  if (gen === switchGen) {
    completeCaseSwitch()
    switchTl = null
  }
}

onMounted(async () => {
  refreshMobileCases()
  captureMobileCasesHeight()
  // A history return mounts HomeCases while the transition proxy is already
  // waiting to dock. Do not route this raster through the normal near-viewport
  // idle warmup. Mount it immediately under the opaque proxy, then let the
  // transition wait for the real element to decode before the handoff.
  if (caseDetailHomeReturnActive.value) {
    firstCaseNear = true
    initialCaseWarmScheduled = true
    warmInitialCaseMedia(true)
    caseMediaReady.value = true
  }
  mountBgPortal.value = true
  await nextTick()
  mediaEl.value?.addEventListener(
    CASE_MEDIA_FLIGHT_START_EVENT,
    onCaseMediaFlightStart,
  )
  scheduleMobileStageCollapse()
  if (rootEl.value && typeof IntersectionObserver !== 'undefined') {
    firstCaseObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        firstCaseNear = true
        firstCaseObserver?.disconnect()
        firstCaseObserver = null
        scheduleFirstCaseWarm()
      },
      { rootMargin: '140% 0px' },
    )
    firstCaseObserver.observe(rootEl.value)
  } else {
    firstCaseNear = true
    scheduleFirstCaseWarm()
  }
  syncColorPlate()
  await setupIntroMotion()
  await setupRailMotion()
  await setupEnterMotion()
  scrollActiveCaseLinkIntoView('auto')
  revealActiveCaseUnderline()
  window.addEventListener('resize', syncColorPlate, { passive: true })
  window.addEventListener('resize', refreshMobileCases, { passive: true })

  if (rootEl.value && typeof ResizeObserver !== 'undefined') {
    bgPortalRo = new ResizeObserver(syncColorPlate)
    bgPortalRo.observe(rootEl.value)
  }
  if (blurbEl.value && typeof ResizeObserver !== 'undefined') {
    blurbRo?.disconnect()
    blurbRo = new ResizeObserver(() => {
      scheduleMobileStageCollapse()
    })
    blurbRo.observe(blurbEl.value)
  }
  void document.fonts?.ready.then(() => {
    scheduleMobileStageCollapse()
  })
})

onBeforeUnmount(() => {
  completeCaseSwitch()
  clearCaseArrow()
  if (suppressCaseLinkClickTimer) {
    window.clearTimeout(suppressCaseLinkClickTimer)
    suppressCaseLinkClickTimer = 0
  }
  switchTl?.kill()
  switchTl = null
  heightTl?.kill()
  heightTl = null
  railPositionTl?.kill()
  railPositionTl = null
  mediaEl.value?.removeEventListener(
    CASE_MEDIA_FLIGHT_START_EVENT,
    onCaseMediaFlightStart,
  )
  cancelCaseMediaGeometry(
    mediaEl.value?.hasAttribute('data-case-media-flight') ?? false,
  )
  enterTl?.kill()
  enterTl = null
  introCtx?.revert()
  introCtx = null
  railCtx?.revert()
  railCtx = null
  enterCtx?.revert()
  enterCtx = null
  playCasesEnterMotion = null
  resetCasesEnterMotion = null
  casesEnterMotionVisible = false
  bgPortalRo?.disconnect()
  bgPortalRo = null
  blurbRo?.disconnect()
  blurbRo = null
  firstCaseObserver?.disconnect()
  firstCaseObserver = null
  mobileStageCollapseSt?.kill()
  mobileStageCollapseSt = null
  if (mobileStageCollapseRaf) cancelAnimationFrame(mobileStageCollapseRaf)
  mobileStageCollapseRaf = 0
  window.removeEventListener('resize', syncColorPlate)
  window.removeEventListener('resize', refreshMobileCases)
})
</script>

<template>
  <section
    id="cases"
    ref="rootEl"
    class="home-cases pointer-events-auto relative z-10 w-full"
    :class="{
      'home-cases--inverse': activeCase?.inverse,
      'home-cases--mobile': mobileCases,
    }"
    :data-case-id="activeCase?.id"
    :aria-label="t('home.cases.sectionLabel', { title: activeCase?.title ?? '' })"
    :style="mobileCasesHeight ? { '--cases-mobile-h': `${mobileCasesHeight}px` } : undefined"
    @pointerdown="onCaseStagePointerDown"
    @pointerup="onCaseStagePointerUp"
    @pointercancel="onCaseStagePointerCancel"
    @click.capture="onCaseStageClickCapture"
  >
    <Teleport v-if="mountBgPortal" to="#home-cases-bg-host">
      <div
        ref="bgTrackEl"
        class="cases-colour-plate"
        :style="{ backgroundColor: activeCase?.wash }"
        aria-hidden="true"
      />
    </Teleport>

    <Transition name="cases-gesture-hint">
      <div
        v-if="showCaseGestureHint"
        ref="gestureHintEl"
        class="cases-gesture-hint"
        role="button"
        tabindex="0"
        :aria-label="t('home.cases.gestureLabel')"
        @pointerdown="onCaseGesturePointerDown"
        @pointerup="onCaseGesturePointerUp"
        @pointercancel="onCaseGesturePointerCancel"
        @click="dismissCaseGestureHintFromAction"
        @keydown.enter.prevent="dismissCaseGestureHintFromAction"
        @keydown.space.prevent="dismissCaseGestureHintFromAction"
      >
        <div class="cases-gesture-hint__content">
          <SiteIcon
            name="hand-move"
            class="cases-gesture-hint__icon cases-gesture-hint__hand"
            :size="32"
            :stroke="2"
          />
          <p class="cases-gesture-hint__copy">
            <span>{{ t('home.cases.gestureSwipe') }}</span>
            <span>{{ t('home.cases.gestureDismiss') }}</span>
          </p>
        </div>
      </div>
    </Transition>

    <div
      class="cases-inner relative z-[1] mx-auto grid w-full"
      :style="{
        maxWidth: 'var(--layout-content-max)',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        columnGap: 'var(--layout-gutter)',
      }"
    >
      <header ref="introEl" class="cases-intro col-span-12">
        <h2
          class="cases-intro__title"
          :aria-label="`${casesIntroTitle}: ${homeCases.length}`"
        >
          <span class="sr-only">{{ casesIntroTitle }}</span>
          <span
            v-for="(line, lineIndex) in casesIntroTitleLines"
            :key="lineIndex"
            class="cases-intro__line-mask"
            aria-hidden="true"
          >
            <span class="cases-intro__line-reveal">
              <span
                v-for="(char, charIndex) in line"
                :key="`${char}-${charIndex}`"
                class="cases-intro__char"
              >{{ char === ' ' ? '\u00a0' : char }}</span>
            </span>
            <span
              v-if="lineIndex === casesIntroTitleLines.length - 1"
              class="cases-intro__count"
            >
              <span class="cases-intro__char">{{ homeCases.length }}</span>
            </span>
          </span>
        </h2>
        <div class="cases-intro__cue" aria-hidden="true">
          <SiteIcon name="arrow-down-left" size="100%" />
        </div>
      </header>

      <nav
        ref="railEl"
        class="cases-rail col-span-12 md:col-span-10 md:col-start-2 md:row-start-2"
        :class="{
          'cases-rail--detail-return': caseDetailHomeReturnActive,
          'cases-rail--detail-return-pending': hideCaseCopyDuringDetailReturn,
        }"
        :style="{ '--cases-wash': activeCase?.wash }"
        :aria-label="t('home.cases.navigationLabel')"
      >
        <ul
          ref="railListEl"
          class="cases-rail__list"
          data-lenis-prevent-horizontal
        >
          <li
            v-for="item in homeCases"
            :key="item.id"
          >
            <button
              type="button"
              class="cases-rail__btn"
              :data-case-id="item.id"
              :class="{
                'cases-rail__btn--active': item.id === activeId,
              }"
              :aria-pressed="item.id === activeId"
              :aria-busy="switching"
              @pointerenter="warmCaseMedia(item)"
              @focus="warmCaseMedia(item)"
              @pointerdown="warmCaseMedia(item)"
              @click="onRailBtnClick(item)"
            >
              <span class="cases-rail__label">{{ item.label }}</span>
              <TextLinkWave v-if="item.id === activeId" />
            </button>
          </li>
        </ul>
      </nav>

      <div
        v-if="activeCase"
        ref="stageEl"
        class="cases-stage col-span-12 md:col-span-12 md:col-start-1 md:row-start-3"
      >
        <a
          class="cases-case-link"
          :href="localePath(homeCaseDetailPath(activeCase))"
          :aria-label="t('home.cases.openCase', { title: activeCase.title })"
          @pointerenter="warmCaseDetail(activeCase)"
          @focus="warmCaseDetail(activeCase)"
          @pointerdown="warmCaseDetail(activeCase)"
          @click="onCaseDetailLink(activeCase, $event)"
        ><span class="sr-only">{{ t('home.cases.openCase', { title: activeCase.title }) }}</span></a>
        <div class="cases-stage__visual">
          <figure
            ref="mediaEl"
            class="cases-media"
            :data-case-media="activeCase.media.src"
            :data-case-surface-ready="caseSurfaceReady ? '' : undefined"
            :class="[
              `cases-media--${activeCase.media.orientation ?? 'portrait'}`,
              { 'cases-media--video': !!activeCase.media.video },
            ]"
            :style="{
              aspectRatio: caseMediaAspectRatio(activeCase),
            }"
          >
            <div
              data-case-local-media
              class="cases-media__local"
              :class="{
                'cases-media__local--visible': showLocalCaseMedia,
                'cases-media__local--return-docked': caseDetailHomeReturnActive && homeReturnMediaDocked,
              }"
              :aria-hidden="!showLocalCaseMedia"
            >
              <Transition name="cases-media-swap">
                <div
                  v-if="caseMediaReady"
                  :key="activeCase.id"
                  class="cases-media__layer"
                  :data-case-layer="activeCase.id"
                >
                  <picture class="cases-media__picture">
                    <source
                      v-if="activeCase.media.mobileAvifSrcset"
                      media="(max-width: 767.98px)"
                      type="image/avif"
                      :srcset="activeCase.media.mobileAvifSrcset"
                      sizes="92vw"
                    >
                    <source
                      v-if="activeCase.media.mobileWebpSrcset"
                      media="(max-width: 767.98px)"
                      type="image/webp"
                      :srcset="activeCase.media.mobileWebpSrcset"
                      sizes="92vw"
                    >
                    <source
                      v-if="activeCase.media.mobileSrc"
                      media="(max-width: 767.98px)"
                      :srcset="activeCase.media.mobileSrc"
                    >
                    <source
                      v-if="activeCase.media.avifSrcset"
                      type="image/avif"
                      :srcset="activeCase.media.avifSrcset"
                      :sizes="activeCase.id === 'baltika' ? '(max-width: 767px) 92vw, 58vw' : '(max-width: 767px) 92vw, 42vw'"
                    >
                    <source
                      v-if="activeCase.media.webpSrcset"
                      type="image/webp"
                      :srcset="activeCase.media.webpSrcset"
                      :sizes="activeCase.id === 'baltika' ? '(max-width: 767px) 92vw, 58vw' : '(max-width: 767px) 92vw, 42vw'"
                    >
                    <img
                      :src="activeCase.media.src"
                      :width="activeCase.media.width"
                      :height="activeCase.media.height"
                      :alt="activeCase.media.alt"
                      class="cases-media__img"
                      :class="{ 'cases-media__img--behind-video': !!activeCase.media.video }"
                      decoding="async"
                      @load="onMediaLayoutReady"
                    >
                  </picture>
                  <video
                    v-if="activeCase.media.video"
                    class="cases-media__img cases-media__video"
                    autoplay
                    muted
                    loop
                    playsinline
                    preload="metadata"
                    :poster="activeCase.media.video.poster"
                    aria-hidden="true"
                  >
                    <source
                      v-if="activeCase.media.video.mobileWebm"
                      media="(max-width: 767.98px)"
                      :src="activeCase.media.video.mobileWebm"
                      type="video/webm"
                    >
                    <source
                      v-if="activeCase.media.video.mobileMp4"
                      media="(max-width: 767.98px)"
                      :src="activeCase.media.video.mobileMp4"
                      type="video/mp4"
                    >
                    <source :src="activeCase.media.video.webm" type="video/webm">
                    <source :src="activeCase.media.video.mp4" type="video/mp4">
                  </video>
                </div>
              </Transition>
            </div>
            <span
              class="cases-case-link__icon"
              :class="{ 'is-visible': showCaseArrow }"
            >
              <SiteIcon name="arrow-right" :size="26" />
            </span>
          </figure>
        </div>

        <aside class="cases-aside">
          <p
            ref="blurbEl"
            class="cases-blurb"
            :class="{ 'cases-blurb--detail-return-pending': hideCaseCopyDuringDetailReturn }"
          >{{ activeBlurb }}</p>
        </aside>
        <div ref="mobileTailEl" class="cases-stage__mobile-tail" aria-hidden="true" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-cases {
  color: var(--palette-ink);
  /* One viewport + fluid header chrome so the fixed nav doesn’t eat the stage. */
  --cases-stage-h: calc(
    100svh + var(--layout-surface-top)
    - (var(--layout-surface-top) + var(--space-section))
    - var(--space-section)
  );
  min-height: calc(100svh + var(--layout-surface-top));
  background: transparent;
  overflow-anchor: none;
}

.home-cases--mobile {
  /* Captured once at page load; browser-chrome motion must not resize this field. */
  --cases-stage-h: auto;
  min-height: var(--cases-mobile-h, 100lvh);
  touch-action: pan-y;
}

.home-cases--inverse {
  color: var(--palette-milk, #f5f1e8);
}

.cases-inner {
  /*
    Top: header chrome + extra section gap so copy clears the fixed nav.
    Bottom: section rhythm from the fluid scale.
  */
  padding-top: calc((var(--layout-surface-top) + var(--space-section)) * 0.5);
  padding-bottom: calc(var(--space-section) * 0.96);
  padding-inline: var(--layout-margin-content);
}

.cases-intro {
  --cases-intro-title-size: clamp(3.25rem, 8.5vw, 8rem);
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: end;
  align-items: last baseline;
  column-gap: var(--layout-gutter);
  margin-bottom: clamp(2.625rem, 6vw, 5.25rem);
}

.cases-intro__title {
  margin: 0;
}

.cases-intro__title {
  position: relative;
  grid-column: 2 / span 7;
  font-size: var(--cases-intro-title-size);
  font-weight: 400;
  letter-spacing: -0.065em;
  line-height: 0.88;
}

.cases-intro__line-mask {
  position: relative;
  display: block;
  width: max-content;
}

.cases-intro__line-reveal {
  display: block;
  overflow: hidden;
  /* Cyrillic ascenders (notably «б») extend slightly above this typeface's
     compact line box. Keep a small headroom inside each reveal mask. */
  padding-top: 0.08em;
  padding-right: 0.04em;
}

.cases-intro__char {
  display: inline-block;
  will-change: transform;
}

.cases-intro__count {
  position: absolute;
  top: 0.18em;
  left: calc(100% + var(--space-2));
  overflow: hidden;
  height: 1em;
  font-size: clamp(2.5rem, 4.3vw, 4rem);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
}

.cases-intro__count .cases-intro__char {
  display: block;
}

.cases-intro__cue {
  --cases-intro-cue-size: calc(var(--cases-intro-title-size) * 0.84);
  display: flex;
  width: var(--cases-intro-cue-size);
  height: var(--cases-intro-cue-size);
  grid-column: 9 / -2;
  justify-self: end;
  color: currentColor;
}

.cases-intro__cue :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

@media (min-width: 768px) {
  .cases-inner {
    --cases-section-end-space: calc(var(--space-section) * 0.96);
    --cases-rail-stop-clearance: var(--space-6);
    padding-top: var(--space-6);
    padding-bottom: 0;
    padding-inline: 0;
    /* Reserve enough room for both the gradient's lower overhang and the blur
       kernel. The sticky area ends before the section's reduced bottom space. */
    grid-template-rows:
      auto auto auto
      calc(var(--cases-section-end-space) - var(--cases-rail-stop-clearance))
      var(--cases-rail-stop-clearance);
  }
}

@media (max-width: 767.98px) {
  .cases-intro {
    --cases-intro-title-size: clamp(3.5rem, 17vw, 5.75rem);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-bottom: clamp(2.25rem, 9.75vw, 3.75rem);
  }

  .cases-intro__title {
    max-width: 100%;
  }

  .cases-intro__title {
    font-size: var(--cases-intro-title-size);
  }
}

.cases-rail {
  display: flex;
  align-items: center;
  min-height: 0;
  transition: opacity 0.18s var(--motion-ease, ease);
}

.cases-blurb--detail-return-pending {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.cases-rail--detail-return-pending {
  pointer-events: none;
}

.cases-rail--detail-return-pending .cases-rail__list {
  visibility: hidden;
  opacity: 0;
}

.cases-rail__list {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 0.65rem;
  margin: 0;
  padding: 0;
  list-style: none;
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  overscroll-behavior-y: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  transition: opacity 0.18s var(--motion-ease, ease);
}

.cases-rail__list::-webkit-scrollbar {
  display: none;
}

@media (min-width: 768px) {
  .cases-rail {
    --cases-rule-scale: 0;
    --cases-backdrop-opacity: 0;
    --cases-backdrop-scale: 0;
    position: relative;
    align-self: start;
    height: auto;
    margin-bottom: calc(clamp(3rem, 6vw, 5.5rem) * 0.25);
  }

  .cases-rail::before {
    position: absolute;
    z-index: -1;
    top: calc(-1 * var(--space-6));
    bottom: calc(-1rem - var(--space-5) * 0.25);
    left: 50%;
    width: 100vw;
    content: '';
    pointer-events: none;
    opacity: var(--cases-return-backdrop-opacity, var(--cases-backdrop-opacity));
    background: linear-gradient(
      to top,
      color-mix(in srgb, var(--cases-wash) 4%, transparent),
      transparent 78%
    );
    mask-image: linear-gradient(to top, #000 0%, #000 46%, transparent 100%);
    -webkit-mask-image: linear-gradient(to top, #000 0%, #000 46%, transparent 100%);
    transform: translateX(-50%) scaleY(var(--cases-return-backdrop-scale, var(--cases-backdrop-scale)));
    transform-origin: bottom center;
    transition:
      bottom 0.32s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.54s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.72s cubic-bezier(0.22, 1, 0.36, 1),
      backdrop-filter 0.54s cubic-bezier(0.22, 1, 0.36, 1),
      -webkit-backdrop-filter 0.54s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: opacity, transform;
  }

  .cases-rail--detail-return {
    --cases-return-backdrop-opacity: 1;
    --cases-return-backdrop-scale: 1;
  }

  .cases-rail--detail-return-pending {
    --cases-return-backdrop-opacity: 0;
    --cases-return-backdrop-scale: 0.96;
  }

  .cases-rail--tail-retracted::before {
    bottom: 0;
  }

  @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .cases-rail::before {
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .cases-rail--detail-return-pending::before {
      backdrop-filter: blur(0);
      -webkit-backdrop-filter: blur(0);
    }
  }

  .cases-rail::after {
    position: absolute;
    right: 0;
    bottom: calc(0.7rem - 4px);
    left: 0;
    height: 1px;
    background: color-mix(in srgb, currentColor 22%, transparent);
    content: '';
    pointer-events: none;
    transform: scaleX(var(--cases-rule-scale));
    transform-origin: left center;
  }

  .cases-rail__list {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 1.15rem;
    width: fit-content;
    max-width: 100%;
    padding: 0.9rem 0 1rem;
    overflow-x: auto;
    overflow-y: hidden;
  }

  /* Match the mobile active-link rhythm: the wave sits below the glyphs,
     not directly on their baseline. */
  .cases-rail__btn :deep(.text-link-wave) {
    bottom: -0.5em;
  }
}

.cases-rail__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: auto;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: calc(var(--type-nav) * 1.5);
  letter-spacing: -0.02em;
  line-height: 1.2;
  cursor: pointer;
  opacity: 0.5;
  transition:
    color 0.35s var(--motion-ease, ease),
    opacity 0.35s var(--motion-ease, ease);
}

.cases-rail__btn:hover:not(.cases-rail__btn--active) {
  opacity: 1;
}

.cases-rail__label {
  position: relative;
  z-index: 1;
  transition: color 0.35s var(--motion-ease, ease);
}

.cases-rail__btn--active {
  opacity: 1;
}

.cases-gesture-hint {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgb(10 10 10 / 72%);
  color: #fff;
  cursor: pointer;
  touch-action: pan-y;
}

.cases-gesture-hint__content {
  position: sticky;
  top: 0;
  display: flex;
  min-height: var(--app-screen);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: var(--layout-margin-content);
  text-align: center;
}

.cases-gesture-hint__icon {
  display: block;
  flex: 0 0 auto;
  overflow: visible;
}

.cases-gesture-hint__hand {
  transform-box: fill-box;
  transform-origin: center;
  animation: cases-gesture-hand-swipe 1.65s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.cases-gesture-hint__copy {
  display: flex;
  max-width: 21rem;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.cases-gesture-hint-enter-active,
.cases-gesture-hint-leave-active {
  transition: opacity 0.32s var(--motion-ease, ease);
}

.cases-gesture-hint-enter-from,
.cases-gesture-hint-leave-to {
  opacity: 0;
}

@keyframes cases-gesture-hand-swipe {
  0%,
  18% {
    transform: translate3d(7px, 0, 0) rotate(1.5deg);
  }
  58%,
  72% {
    transform: translate3d(-7px, 0, 0) rotate(-1.5deg);
  }
  100% {
    transform: translate3d(7px, 0, 0) rotate(1.5deg);
  }
}

@media not all {
  .cases-rail,
  .cases-blurb {
    transition: none;
  }

  .cases-rail::before {
    transition: none;
  }

  .cases-rail__btn--flash .chip-scale-bg,
  .cases-rail__btn--flash .cases-rail__label,
  .cases-gesture-hint__hand {
    animation: none;
  }
}

.cases-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  align-items: stretch;
}

.cases-stage__mobile-tail {
  display: none;
}

@media (max-width: 767.98px) {
  .cases-stage {
    touch-action: pan-y;
  }

  .cases-rail {
    position: relative;
    z-index: 3;
    align-self: start;
    width: calc(100% + var(--layout-margin-content) + var(--layout-margin-content));
    margin-left: calc(-1 * var(--layout-margin-content));
    margin-right: calc(-1 * var(--layout-margin-content));
    margin-bottom: clamp(1.375rem, 6vw, 2.25rem);
  }

  .cases-rail__list {
    gap: 0.65rem;
    align-items: baseline;
    padding-inline: var(--layout-margin-content);
    padding-bottom: 0.62em;
    scroll-padding-inline: var(--layout-margin-content);
  }

  .cases-rail__btn {
    font-size: calc(var(--type-nav) * 1.5);
    transition:
      color 0.35s var(--motion-ease, ease),
      opacity 0.35s var(--motion-ease, ease);
  }

  .cases-rail__btn :deep(.text-link-wave) {
    bottom: -0.5em;
  }

  /* One mobile reading order: media → title → description → mood → role. */
  .cases-media {
    order: 1;
  }

  .cases-title {
    order: 2;
  }

  .cases-blurb {
    order: 3;
  }

  .cases-tags-motion--focus {
    order: 4;
  }

  .cases-tags-motion--role {
    order: 5;
  }

}

@media (min-width: 768px) {
  .cases-stage {
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
    row-gap: 0;
    /* Section min-height − cases-inner fluid padding. */
    min-height: var(--cases-stage-h);
    align-items: end;
  }
}

.cases-stage__visual {
  display: flex;
  flex-direction: column;
  gap: var(--layout-gutter);
  min-width: 0;
}

@media (min-width: 768px) {
  .cases-stage__visual {
    grid-column: 1 / span 5;
    align-self: end;
    justify-content: flex-end;
  }

  /* Audience: the title sits in the lower-right fifth of the mockup and
     deliberately crosses 20% of its width, instead of taking a separate row. */
  .home-cases[data-case-id='audience'] .cases-stage__visual {
    position: relative;
    display: block;
  }

  .home-cases[data-case-id='audience'] .cases-stage {
    grid-template-rows: minmax(0, 1fr) auto;
    row-gap: clamp(2rem, 4vw, 3.5rem);
  }

  .home-cases[data-case-id='audience'] .cases-title {
    position: absolute;
    z-index: 3;
    bottom: 20%;
    left: calc(var(--layout-span-4) * 0.8);
    white-space: nowrap;
  }

  /* Audience metadata has its own lower line after the visual and blurb. */
  .home-cases[data-case-id='audience'] .cases-aside,
  .home-cases[data-case-id='audience'] .cases-aside__top {
    display: contents;
  }

  .home-cases[data-case-id='audience'] .cases-tags-motion--focus {
    grid-column: 1 / span 4;
    grid-row: 2;
    justify-self: start;
  }

  .home-cases[data-case-id='audience'] .cases-tags-motion--focus .cases-tags {
    justify-content: flex-start;
    text-align: left;
  }

  .home-cases[data-case-id='audience'] .cases-tags-motion--role {
    grid-column: 6 / -1;
    grid-row: 2;
    justify-self: end;
  }

  .home-cases[data-case-id='audience'] .cases-blurb {
    grid-column: 6 / -1;
    grid-row: 1;
    align-self: end;
    width: 100%;
  }

  /* Keys Store uses the right side as one reading column. The tag rows keep
     the same right alignment as Audience, with deliberate space between each
     editorial block rather than overlapping the product frame. */
  .home-cases[data-case-id='keys-store'] .cases-stage {
    align-items: start;
  }

  .home-cases[data-case-id='keys-store'] .cases-stage__visual,
  .home-cases[data-case-id='keys-store'] .cases-aside,
  .home-cases[data-case-id='keys-store'] .cases-aside__top {
    display: contents;
  }

  .home-cases[data-case-id='keys-store'] .cases-tags-motion--focus {
    grid-column: 6 / -1;
    grid-row: 1;
    margin-bottom: clamp(1.5rem, 3vw, 2.5rem);
  }

  .home-cases[data-case-id='keys-store'] .cases-media {
    grid-column: 2 / span 5;
    grid-row: 2;
    align-self: start;
  }

  .home-cases[data-case-id='keys-store'] .cases-title {
    grid-column: 1 / span 4;
    grid-row: 3;
    width: 100%;
    margin-top: clamp(1.5rem, 3vw, 2.5rem);
    justify-self: start;
    text-align: left;
  }

  .home-cases[data-case-id='keys-store'] .cases-blurb {
    grid-column: 7 / -1;
    grid-row: 1;
    width: 100%;
    margin-top: clamp(4rem, 8vw, 7rem);
    justify-self: start;
    text-align: left;
  }

  .home-cases[data-case-id='keys-store'] .cases-tags-motion--role {
    grid-column: 6 / -1;
    grid-row: 5;
    margin-top: clamp(2.5rem, 5vw, 5rem);
  }

  /* Baltika Brew: product at the centre, with the text balanced against the
     upper and lower fifths of its square frame. */
  .home-cases[data-case-id='baltika'] .cases-stage {
    --baltika-media-size: calc(
      (var(--layout-span-5) - 4 * var(--layout-gutter)) * 0.8
      + 3 * var(--layout-gutter)
    );
    min-height: max(var(--cases-stage-h), var(--layout-span-5));
    grid-template-rows: var(--layout-span-5) auto;
    align-items: stretch;
  }

  .home-cases[data-case-id='baltika'] .cases-stage__visual,
  .home-cases[data-case-id='baltika'] .cases-aside,
  .home-cases[data-case-id='baltika'] .cases-aside__top {
    display: contents;
  }

  .home-cases[data-case-id='baltika'] .cases-media {
    grid-column: 3 / span 5;
    grid-row: 1;
    align-self: start;
    justify-self: center;
    width: var(--baltika-media-size);
  }

  .home-cases[data-case-id='baltika'] .cases-title {
    grid-column: 1 / span 2;
    grid-row: 1;
    align-self: start;
    margin-top: calc(var(--baltika-media-size) * 0.2);
  }

  .home-cases[data-case-id='baltika'] .cases-blurb {
    grid-column: 8 / -1;
    grid-row: 1;
    align-self: end;
    margin-bottom: calc(
      var(--layout-span-5) * 0.2 + var(--layout-gutter) * 0.65
    );
  }

  .home-cases[data-case-id='baltika'] .cases-tags-motion--focus {
    grid-column: 8 / -1;
    grid-row: 1;
    align-self: start;
    justify-self: end;
    width: min(18rem, 100vw);
  }

  .home-cases[data-case-id='baltika'] .cases-tags-motion--role {
    grid-column: 8 / -1;
    grid-row: 2;
    justify-self: end;
    width: min(18rem, 100vw);
    margin-top: clamp(2.5rem, 5vw, 5rem);
  }

  /* SCHMIDT: an expanded image plane, with the headline and the supporting
     copy set as two independent reading columns above it. */
  .home-cases[data-case-id='schmidt'] .cases-stage__visual,
  .home-cases[data-case-id='schmidt'] .cases-aside,
  .home-cases[data-case-id='schmidt'] .cases-aside__top {
    display: contents;
  }

  .home-cases[data-case-id='schmidt'] .cases-title {
    grid-column: 1 / span 3;
    grid-row: 1;
    align-self: start;
  }

  .home-cases[data-case-id='schmidt'] .cases-media {
    grid-column: 1 / span 6;
    grid-row: 2;
    align-self: start;
    margin-top: clamp(1.5rem, 3vw, 2.5rem);
  }

  .home-cases[data-case-id='schmidt'] .cases-tags-motion--focus {
    grid-column: 6 / -1;
    grid-row: 1;
    align-self: start;
  }

  .home-cases[data-case-id='schmidt'] .cases-blurb {
    grid-column: 6 / -1;
    grid-row: 1;
    align-self: start;
    margin-top: clamp(4rem, 8vw, 7rem);
  }

  .home-cases[data-case-id='schmidt'] .cases-tags-motion--role {
    grid-column: 6 / -1;
    grid-row: 2;
    align-self: end;
  }
}

.cases-title {
  margin: 0;
  font-size: clamp(2.5rem, 4.6vw, 4rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.cases-title__link {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  color: inherit;
  text-decoration-line: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.14em;
}

.cases-title__link > span:last-child {
  min-width: 0;
}

.cases-title__icon-frame {
  display: flex;
  flex: 0 0 auto;
  width: 0;
  margin-right: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    width 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    margin-right 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease;
}

.cases-title__icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  transform: translateX(-100%);
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (hover: hover) and (pointer: fine) {
  .cases-title__link:hover .cases-title__icon-frame,
  .cases-title__link:focus-visible .cases-title__icon-frame {
    width: 32px;
    margin-right: 0.35em;
    opacity: 1;
  }

  .cases-title__link:hover .cases-title__icon,
  .cases-title__link:focus-visible .cases-title__icon {
    transform: translateX(0);
  }
}

.cases-media {
  position: relative;
  margin: 0;
  min-width: 0;
  /* The shared Surface only targets this box; project media is rendered here. */
  isolation: isolate;
  overflow: hidden;
}

.cases-media::before,
.cases-media::after {
  position: absolute;
  z-index: 0;
  /* Keep the parked Surface safely beneath the raster's rounded edge. */
  top: 1px;
  left: 1px;
  width: var(--cases-media-surface-width, calc(100% - 2px));
  height: var(--cases-media-surface-height, calc(100% - 2px));
  border-radius: var(--flow-surface-radius, 24px);
  content: '';
  opacity: 0;
  pointer-events: none;
}

.cases-media::before {
  background: var(--palette-stone);
}

.cases-media::after {
  background-image: var(--home-surface-grain);
  background-position: 0 0;
  background-repeat: repeat;
  background-size: 224px 224px;
  mix-blend-mode: soft-light;
}

.cases-media[data-flow-surface-proxy-active]::before,
.cases-media[data-case-surface-ready]::before {
  opacity: 1;
}

.cases-media[data-flow-surface-proxy-active]::after,
.cases-media[data-case-surface-ready]::after {
  opacity: 0.2;
}

@media (max-width: 767.98px) {
  .cases-media::after {
    background-size: 176px 176px;
  }
}

.cases-media[data-case-media-flight],
.cases-media[data-case-media-resize] {
  overflow: visible;
}

.cases-case-link {
  position: absolute;
  z-index: 3;
  inset: 0;
}

.cases-case-link__icon {
  display: none;
}

@media (max-width: 767.98px) {
  .cases-case-link__icon {
    position: absolute;
    /* FlowSurface's pinned media layer uses z-10 inside this isolated figure. */
    z-index: 20;
    right: 0.75rem;
    bottom: 0.75rem;
    display: inline-flex;
    width: 2.5rem;
    height: 2.5rem;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--palette-ink, #171915);
    color: var(--palette-milk, #f5f1e8);
    opacity: 0;
    pointer-events: none;
    transform: translate3d(0, -0.5rem, 0) scale(0.88);
    transition: opacity 0.2s ease-out, transform 0.2s ease-out;
  }

  .cases-case-link__icon.is-visible {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    transition-duration: 0.45s;
    transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
}

@media (min-width: 768px) {
  .cases-case-link {
    /* The switcher starts after one empty column and occupies the next two. */
    inset-inline-start: calc(var(--layout-span-3) + var(--layout-gutter));
  }
}

.cases-media__picture {
  position: absolute;
  inset: 0;
  display: block;
}

.cases-media__local {
  --cases-media-swap-delay: 0.18s;
  --cases-media-swap-enter-duration: 0.9s;
  --cases-media-swap-leave-duration: 1.05s;
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  border-radius: var(--flow-surface-radius, 24px);
  background: transparent;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s linear;
  will-change: opacity;
}

.cases-media__local--visible {
  opacity: 1;
  transition-duration: 0s;
}

.cases-media__layer {
  position: absolute;
  z-index: 2;
  /* Bleed beneath the only rounded mask. Nested rounded clips rasterize their
     edge independently and let the gray Surface show through as a hairline. */
  inset: -1px;
  overflow: hidden;
  border-radius: 0;
  background: transparent;
  clip-path: inset(0 100% 0 0);
  transition: clip-path 0.62s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: clip-path;
}

.cases-media__local--visible .cases-media__layer {
  clip-path: inset(0 0 0 0);
}

@media (max-width: 767.98px) {
  .cases-media__local {
    transition-duration: 0.28s;
  }

  .cases-media__layer {
    /* On exit the outer wrapper owns the fade. Reset the hidden clip only
       after opacity reaches zero, so slide and fade never run together. */
    transition-delay: 0.28s;
    transition-duration: 0s;
  }

  :where(.cases-media__local--visible) .cases-media__layer {
    transition-delay: 0.15s;
    transition-duration: 1.24s;
  }
}

.cases-media__local--return-docked .cases-media__layer {
  transition: none;
}

.cases-media-swap-enter-active,
.cases-media-swap-leave-active {
  will-change: clip-path, transform;
}

.cases-media-swap-enter-active {
  z-index: 3;
  transition:
    clip-path var(--cases-media-swap-enter-duration) cubic-bezier(0.22, 1, 0.36, 1) var(--cases-media-swap-delay),
    transform var(--cases-media-swap-enter-duration) cubic-bezier(0.22, 1, 0.36, 1) var(--cases-media-swap-delay);
}

.cases-media-swap-leave-active {
  z-index: 1;
  transition:
    transform var(--cases-media-swap-leave-duration) cubic-bezier(0.16, 1, 0.3, 1) var(--cases-media-swap-delay);
}

.cases-media__local--visible .cases-media-swap-enter-from {
  clip-path: inset(0 100% 0 0);
  transform: translate3d(-3%, 0, 0);
}

.cases-media__local--visible .cases-media-swap-enter-to,
.cases-media__local--visible .cases-media-swap-leave-from {
  clip-path: inset(0 0 0 0);
  transform: translate3d(0, 0, 0);
}

.cases-media__local--visible .cases-media-swap-leave-to {
  clip-path: inset(0 0 0 0);
  transform: translate3d(5%, 0, 0);
}

.cases-media__img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 0;
  object-fit: cover;
}

.cases-media__img--behind-video {
  opacity: 0;
}

.cases-media--landscape .cases-media__img {
  width: 100%;
}

/* Baltika's motion asset is square. Give its measured surface a square pose,
   so the video can span the full width without sacrificing its top or bottom. */
.cases-media--video {
  aspect-ratio: 1;
}

.cases-media--video .cases-media__img {
  height: 100%;
  object-fit: cover;
}

@media not all {
  .cases-media__local,
  .cases-media__layer,
  .cases-media-swap-enter-active,
  .cases-media-swap-leave-active {
    transition: none;
  }
}

/* Keys Store stays deliberately narrower on desktop. Mobile uses the same
   full-width 4:5 asset as the case-detail header. */
.home-cases[data-case-id='keys-store'] .cases-media {
  width: 80%;
  justify-self: center;
}

/* SCHMIDT fills its complete assigned image track. */
.home-cases[data-case-id='schmidt'] .cases-media {
  width: 100%;
  justify-self: center;
}

/* Baltika is reduced proportionally, so the whole image remains visible
   instead of being cropped into a shallower frame. */
.home-cases[data-case-id='baltika'] .cases-media {
  width: 80%;
}

@media (max-width: 767.98px) {
  .home-cases[data-case-id='keys-store'] .cases-media,
  .home-cases[data-case-id='schmidt'] .cases-media {
    width: 100%;
  }

  .home-cases[data-case-id='keys-store'] .cases-media,
  .home-cases[data-case-id='schmidt'] .cases-media,
  .home-cases[data-case-id='baltika'] .cases-media {
    align-self: center;
  }
}

.cases-aside {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 2.5rem;
  min-width: 0;
}

@media (min-width: 768px) {
  .cases-aside {
    grid-column: 6 / span 4;
    align-self: stretch;
    padding-top: 0.35rem;
  }
}

.cases-aside__top {
  display: flex;
  flex-direction: column;
  gap: 60px;
}

.cases-tags-motion {
  display: block;
  will-change: transform, opacity;
}

.cases-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: calc(var(--layout-gutter) * 0.3);
  margin: 0;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
  line-height: 1.35;
  opacity: 0.55;
}

@media (min-width: 768px) {
  .cases-tags {
    justify-content: flex-end;
    text-align: right;
  }
}

.cases-tags__sep {
  flex: 0 0 auto;
}

.cases-tags__item {
  display: inline-block;
}

.cases-blurb {
  display: block;
  margin: 0;
  font-size: var(--type-lead);
  font-weight: 300;
  letter-spacing: -0.02em;
  line-height: 1.35;
  text-align: left;
  text-wrap: pretty;
  /* GSAP owns both switch phases. A CSS opacity transition here trails every
     frame, so the old copy is still visible when Vue moves the new text. */
  transition: none;
}

/* Editorial case poses. Navigation and media share one 12-column field. */
@media (min-width: 768px) {
  .cases-inner {
    --cases-inner-pad-block: 120px;
    --cases-rail-center: calc(
      (100svh + var(--layout-surface-top)) * 0.5
      - var(--cases-inner-pad-block)
    );
    min-height: calc(100svh + var(--layout-surface-top));
    box-sizing: border-box;
    align-items: center;
  }

  .cases-rail {
    position: sticky;
    top: calc(100svh - var(--space-5) * 0.25 - 4.25rem);
    z-index: 4;
    grid-row: 2 / 5;
    height: auto;
    align-self: start;
    margin-top: 0;
    pointer-events: auto;
  }

  .cases-stage {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-template-rows: auto auto;
    min-height: 0;
    align-self: center;
  }

  .home-cases[data-case-id] .cases-stage {
    grid-template-rows: auto auto;
    row-gap: 0;
    min-height: 0;
  }

  .cases-stage__visual,
  .cases-aside {
    display: contents;
  }

  .home-cases[data-case-id='audience'] .cases-stage__visual {
    display: contents;
  }

  .cases-media {
    grid-row: 1;
    align-self: start;
    margin: 0;
  }

  .cases-blurb {
    grid-row: 1;
    z-index: 1;
    width: 100%;
    margin: 0;
  }

  .home-cases[data-case-id='audience'] .cases-media { grid-column: 3 / span 5; }
  .home-cases[data-case-id='audience'] .cases-blurb {
    grid-column: 7 / -2;
    align-self: start;
    /* Audience media is 1856 × 2304: 20% of its rendered height. */
    margin-top: calc(var(--layout-span-5) * 0.2483);
  }

  .home-cases[data-case-id='keys-store'] .cases-media {
    grid-column: 2 / span 9;
    grid-row: 1;
    margin-top: 0;
  }
  .home-cases[data-case-id='keys-store'] .cases-blurb {
    grid-column: 3 / span 5;
    grid-row: 2;
    align-self: start;
    margin-top: clamp(2rem, 2.1vw, 2.5rem);
  }

  .home-cases[data-case-id='baltika'] .cases-media {
    grid-column: 2 / span 7;
    justify-self: start;
    width: 100%;
  }
  .home-cases[data-case-id='baltika'] .cases-blurb {
    grid-column: 9 / -2;
    align-self: start;
    /* Header is 1920 × 1090: offset copy by 30% of its rendered height. */
    margin-top: calc(var(--layout-span-7) * 1090 / 1920 * 0.3);
    margin-bottom: 0;
  }

  .home-cases[data-case-id='schmidt'] .cases-media {
    grid-column: 2 / span 9;
    grid-row: 1;
    margin-top: 0;
  }
  .home-cases[data-case-id='schmidt'] .cases-blurb {
    grid-column: 7 / -2;
    grid-row: 2;
    align-self: start;
    margin-top: clamp(2rem, 2.1vw, 2.5rem);
  }
}

@media (min-width: 1440px) {
  .home-cases[data-case-id='audience'] .cases-media { grid-column: 4 / span 5; }
  .home-cases[data-case-id='audience'] .cases-blurb { grid-column: 7 / -2; }

  .home-cases[data-case-id='keys-store'] .cases-media { grid-column: 3 / span 8; }
  .home-cases[data-case-id='keys-store'] .cases-blurb { grid-column: 4 / span 4; }

  .home-cases[data-case-id='schmidt'] .cases-media { grid-column: 3 / span 8; }
  .home-cases[data-case-id='schmidt'] .cases-blurb { grid-column: 7 / -2; }
}

@media (min-width: 1920px) {
  .home-cases[data-case-id='audience'] .cases-blurb { grid-column: 8 / span 3; }
  .home-cases[data-case-id='keys-store'] .cases-blurb { grid-column: 4 / span 3; }
  .home-cases[data-case-id='schmidt'] .cases-blurb { grid-column: 8 / span 3; }
}

@media (max-width: 767.98px) {
  .cases-inner {
    padding-top: calc((var(--layout-surface-top) + var(--space-section)) * 0.4);
  }

  .cases-rail__list > li,
  .cases-rail__btn {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .cases-aside,
  .cases-aside__top {
    gap: 0;
  }

  .cases-media {
    margin-bottom: clamp(1.5rem, 7vw, 2.5rem);
  }

  .cases-title {
    margin-bottom: 1rem;
  }

  .cases-blurb {
    margin-bottom: clamp(2.25rem, 9vw, 3.5rem);
  }

  .cases-tags-motion--focus {
    margin-bottom: 0.75rem;
  }

  .cases-tags {
    gap: 0.15rem 0.35rem;
  }
}

/* The interaction mode is input-aware, not width-only: iPad and other touch
   tablets must keep the same full-width header and top-pinned switcher as a
   phone even when their CSS viewport crosses the desktop breakpoint. */
.home-cases--mobile .cases-inner {
  padding-inline: var(--layout-margin-content);
}

.home-cases--mobile .cases-stage {
  /* Each selected case owns at least one stable mobile screen, so the section
     below cannot peek into its opening viewport before JS measures the tail. */
  min-height: var(--cases-mobile-h, 100svh);
}

.home-cases--mobile .cases-stage__mobile-tail {
  display: block;
  flex: 0 0 auto;
  width: 100%;
  height: 0;
}

.home-cases--mobile .cases-intro {
  --cases-intro-title-size: clamp(2.5rem, 14vw, 5.25rem);
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-column: 1 / -1;
  align-items: end;
  column-gap: var(--space-2);
  row-gap: 0;
}

.home-cases--mobile .cases-intro__title {
  width: 100%;
  max-width: 100%;
}

.home-cases--mobile .cases-intro__title {
  grid-column: 1;
}

.home-cases--mobile .cases-intro__cue {
  grid-column: 2;
  align-self: end;
}

.home-cases--mobile .cases-rail {
  --cases-rail-top-pad: calc(var(--layout-header-inset) * 0.85 * 1.2);
  --cases-rail-wave-clearance: calc(var(--type-nav) * 0.85);
  position: sticky;
  top: 0;
  z-index: 4;
  box-sizing: border-box;
  height: calc(
    var(--cases-rail-top-pad)
    + var(--layout-header-content) * 1.1
    + var(--cases-rail-wave-clearance)
  );
  min-height: calc(
    var(--cases-rail-top-pad)
    + var(--layout-header-content) * 1.1
    + var(--cases-rail-wave-clearance)
  );
  width: calc(100% + 2 * var(--layout-margin-content));
  grid-column: 1 / -1;
  grid-row: 2;
  margin-right: calc(-1 * var(--layout-margin-content));
  margin-left: calc(-1 * var(--layout-margin-content));
  margin-bottom: clamp(1.375rem, 6vw, 2.25rem);
  padding-top: var(--cases-rail-top-pad);
  transform: none;
  background: transparent;
}

.home-cases--mobile .cases-rail::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background-color: color-mix(in srgb, var(--cases-wash) 96%, transparent);
  content: '';
  pointer-events: none;
  mask-image: linear-gradient(
    to bottom,
    #000 0%,
    rgb(0 0 0 / 95.8%) 72%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    #000 0%,
    rgb(0 0 0 / 95.8%) 72%,
    transparent 100%
  );
  transition: background-color 0.72s cubic-bezier(0.65, 0.045, 0.355, 1);
}

.home-cases--mobile .cases-rail__list {
  box-sizing: border-box;
  height: 100%;
  width: 100%;
  max-width: none;
  align-items: center;
  padding-top: 0;
  padding-bottom: var(--cases-rail-wave-clearance);
  padding-inline: var(--layout-margin-content);
  scroll-padding-inline: var(--layout-margin-content);
}
</style>

<!-- Colour is below FlowSurface; only the colour itself transitions. -->
<style>
.cases-colour-plate {
  position: absolute;
  left: 0;
  width: 100%;
  transition: background-color 0.72s cubic-bezier(0.65, 0.045, 0.355, 1);
  pointer-events: none;
}
</style>
