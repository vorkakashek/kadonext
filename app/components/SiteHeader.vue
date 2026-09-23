<script setup lang="ts">
import { isMobileChromeHeightOnlyResize, isThumbNav } from '~/utils/mobileViewport'
import { headerLinks } from '~/utils/siteNav'
import { setChipBgOrigin } from '~/utils/chipHoverBg'
import { preloadHomeSceneAssets } from '~/utils/preloadHomeMotion'
import { CHIP_FIT_EASE, CHIP_FIT_S } from '~/utils/chipFit'

const {
  open: canvasOpen,
  surfaceOn: canvasSurface,
  busy: menuBusy,
  toggleCanvas,
  fabLabelOn,
  registerFabFit,
  pageIrisLive,
} = usePageCanvas()
const route = useRoute()
const nuxtApp = useNuxtApp()
const { locale, t } = useI18n()
const localePath = useLocalePath()
const routeBasePath = computed(() => baseRoutePath(route.path))
const homeCases = useHomeCases()
const links = headerLinks
/** Optimistic “you are here” so the chip fill doesn’t wait for the iris hop. */
// URL fragments never reach SSR. Apply them only after the header hydrates.
const navHerePath = ref(stripLocalePrefix(route.fullPath).replace(/#.*$/, ''))
let navHydrated = false
const scrolled = ref(false)
const canvasForced = computed(() => canvasSurface.value || canvasOpen.value)
/** Menu pins the bar to the default wide layout — never the compact scroll state. */
const headerCollapsed = computed(
  () => scrolled.value && !canvasForced.value,
)
/** Expand with morph after PageIris finishes (stay compact under the sand). */
let pendingExpand = false
/** A case cover can hide the route swap; reveal a compact mobile FAB only after it lifts. */
let pendingFabExpandAfterCaseTransition = false
const shellEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)
const fabEl = ref<HTMLElement | null>(null)
const logoImgEl = ref<HTMLElement | null>(null)
const logoLettersEl = ref<SVGGElement | null>(null)
const logoMarkEl = ref<SVGUseElement | null>(null)
const isOverCases = ref(false)
const mobileMarkOverCases = ref(false)
const isOverAboutSurface = ref(false)
const mobileMarkOverAboutSurface = ref(false)
const mobileHeader = ref(false)
const mobileScrollMarkOn = ref(false)
/** Desktop keeps the compact mark while the reader moves down on any page. */
const desktopScrollMarkOn = ref(false)
const { activeCaseId, caseInverse } = useHomeExperience()
const {
  closeCaseDetail,
  active: caseDetailTransitionActive,
  request: caseDetailTransitionRequest,
} = useCaseDetailTransition()
const returningToHomeCases = computed(() => (
  caseDetailTransitionActive.value
  && caseDetailTransitionRequest.value?.direction === 'close'
  && stripLocalePrefix(caseDetailTransitionRequest.value.to) === '/#cases'
))
const detailCase = computed(() => {
  const match = /^\/projects\/([^/]+)$/.exec(routeBasePath.value)
  return match ? homeCases.value.find((item) => item.id === match[1]) : undefined
})
const detailInverse = computed(() => !!detailCase.value?.inverse)
const activeHomeCaseInverse = computed(() => (
  homeCases.value.find(item => item.id === activeCaseId.value)?.inverse
  ?? caseInverse.value
))

function onCaseDetailBack(event: MouseEvent) {
  const item = detailCase.value
  if (!item) return
  event.preventDefault()
  const paintedDetailImage = document.querySelector<HTMLImageElement>(
    '.case-detail__first-screen .case-detail__image',
  )
  closeCaseDetail({
    src: item.media.src,
    proxySrc: paintedDetailImage?.currentSrc || undefined,
    webpSrcset: item.media.webpSrcset,
    avifSrcset: item.media.avifSrcset,
    mobileSrc: item.media.mobileSrc,
    mobileWebpSrcset: item.media.mobileWebpSrcset,
    mobileAvifSrcset: item.media.mobileAvifSrcset,
    alt: item.media.alt,
    wash: item.wash,
  })
}
const logoInverted = computed(
  () => detailInverse.value
    || isOverAboutSurface.value
    || (isOverCases.value && activeHomeCaseInverse.value),
)
const mobileScrollMarkVisible = computed(
  () => mobileHeader.value && mobileScrollMarkOn.value && !canvasForced.value,
)
const mobileScrollMarkInverted = computed(
  () => detailInverse.value
    || mobileMarkOverAboutSurface.value
    || (mobileMarkOverCases.value && activeHomeCaseInverse.value),
)
const navEl = ref<HTMLElement | null>(null)
const menuBtnEl = ref<HTMLElement | null>(null)
const menuSlotEl = ref<HTMLElement | null>(null)
const caseBackEl = ref<HTMLElement | null>(null)
const caseMobileBackEl = ref<HTMLElement | null>(null)
/** Shared geometry keeps every thumb-zone control on one baseline. */
const { bottomExtra: fabBottomExtra, style: fabStyle } = useMobileFabGeometry()
const thumbNav = ref(false)
const introPending = ref(true)
const initialHomeDocument = useState<boolean>('initial-home-document', () => false)
const homeSurfaceReady = useState<boolean>('home-surface-ready', () => false)
const homeIntroHeaderReady = useState<boolean>('home-intro-header-ready', () => false)
const homeIntroUnlocked = useState<boolean>('home-intro-gate-unlocked', () => false)

let lastFabScrollY = 0
const FAB_LABEL_DIR_PX = 8
/** After menu close, ignore the scroll restoration jump so the word stays visible. */
let fabLabelHoldUntil = 0
let lastMobileLogoScrollY: number | null = null
/** Startup hash/layout corrections are not a reader's scroll direction. */
let mobileLogoDirectionArmed = !(import.meta.client && window.location.hash)
let lastDesktopLogoScrollY: number | null = null
let desktopLogoCollapsePending = false
let desktopLogoWantsCompact = false

function onChipPointer(e: PointerEvent | FocusEvent) {
  const el = e.currentTarget
  if (el instanceof HTMLElement) setChipBgOrigin(el, e)
}

function onMenuHoverEnter(e: PointerEvent) {
  const el = e.currentTarget
  if (!(el instanceof HTMLElement)) return
  setChipBgOrigin(el, e)
  el.classList.add('is-chip-hover')
}

function onMenuHoverLeave(e: PointerEvent) {
  const el = e.currentTarget
  if (!(el instanceof HTMLElement)) return
  const next = e.relatedTarget
  if (next instanceof Node && el.contains(next)) return
  el.classList.remove('is-chip-hover')
}

/** After busy ends, :hover may be true while the fill class was cleared. */
function restoreMenuHoverFill() {
  for (const el of [menuBtnEl.value, fabEl.value]) {
    if (!(el instanceof HTMLElement)) continue
    if (el.matches(':hover')) el.classList.add('is-chip-hover')
    else el.classList.remove('is-chip-hover')
  }
}

function navPathKey(path: string) {
  return path.replace(/\/+$/, '') || '/'
}

function isNavHere(to: string) {
  return navPathKey(navHerePath.value) === navPathKey(to)
}

function markNavHere(to: string, e?: PointerEvent) {
  if (
    e
    && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
  ) {
    return
  }
  navHerePath.value = to
}

function onNavPointerDown(to: string, e: PointerEvent) {
  markNavHere(to, e)
}

async function onLogoClick(event: MouseEvent) {
  if (
    event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || routeBasePath.value !== '/'
  ) {
    return
  }

  event.preventDefault()
  // Drop a stale section hash as well, so reload/back keeps the home hero.
  if (route.hash) {
    await navigateTo(localePath('/'), { replace: true })
  } else {
    nuxtApp.$scrollToSection(document.documentElement)
  }
}

watch(() => route.fullPath, (path) => {
  const baseFullPath = stripLocalePrefix(path)
  navHerePath.value = navHydrated ? baseFullPath : baseFullPath.replace(/#.*$/, '')
})

/** Page canvas pins body (scrollY→0) — ignore that fake scroll for collapse morph. */
function canvasLocksScroll() {
  return (
    canvasSurface.value
    || canvasOpen.value
    || document.documentElement.classList.contains('page-canvas-lock')
  )
}

/** Wait before collapse so a tiny nudge doesn’t snap the bar */
const COLLAPSE_DELAY_MS = 140
const ANIM_DURATION = 0.58
const ANIM_EASE = 'power3.inOut'
/** Below this, skip scroll collapse (no 1-col side gutters, keep full vertical inset). */
const COLLAPSE_MIN_WIDTH = 768
let collapseTimer = 0
let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let logoCasesSt: { kill: () => void } | null = null
let mobileMarkCasesSt: { kill: () => void } | null = null
let aboutToneTriggers: { kill: () => void }[] = []
let homeLogoDirectionSt: import('gsap/ScrollTrigger').ScrollTrigger | null = null
let logoToneTries = 0
let logoToneSyncRaf = 0
let logoMorphTl: { kill: () => void } | null = null
let fabFitTl: { kill: () => void } | null = null
let fabFitResolve: (() => void) | null = null
let headerPostIntroSetupDone = false
let stopHeaderIntroUnlockWatch: (() => void) | null = null

/**
 * ScrollTrigger is useful for regular scrolling, but its `isActive` can be
 * stale for a paint while HMR rebuilds the cases layout. Read the two actual
 * boxes when we resync so the logo tone never waits for another user scroll.
 */
function syncLogoCasesToneFromLayout() {
  if (routeBasePath.value !== '/') {
    isOverCases.value = false
    mobileMarkOverCases.value = false
    isOverAboutSurface.value = false
    mobileMarkOverAboutSurface.value = false
    return
  }
  const cases = document.getElementById('cases')
  const logo = logoImgEl.value
  if (!cases || !logo) return

  const caseBox = cases.getBoundingClientRect()
  const logoBox = logo.getBoundingClientRect()
  // Keep the inverse tone through the last half of the logo: at the lower
  // boundary it switches exactly when the Cases bottom crosses logo centre.
  const logoCenter = logoBox.top + logoBox.height / 2
  isOverCases.value = caseBox.top <= logoBox.bottom && caseBox.bottom >= logoCenter
  const mobileMarkBox = document
    .querySelector<HTMLElement>('.mobile-scroll-mark')
    ?.getBoundingClientRect() ?? fabEl.value?.getBoundingClientRect()
  const mobileMarkCenter = mobileMarkBox
    ? mobileMarkBox.top + mobileMarkBox.height / 2
    : window.innerHeight
  mobileMarkOverCases.value = (
    caseBox.top <= mobileMarkCenter
    && caseBox.bottom >= mobileMarkCenter
  )
  // Only the upper About surface is dark; its biography continues on sand.
  const aboutBox = document
    .querySelector<HTMLElement>('#about .home-about__surface')
    ?.getBoundingClientRect()
  isOverAboutSurface.value = !!aboutBox
    && aboutBox.top <= logoBox.bottom && aboutBox.bottom >= logoCenter
  mobileMarkOverAboutSurface.value = !!aboutBox
    && aboutBox.top <= mobileMarkCenter && aboutBox.bottom >= mobileMarkCenter
}

async function setupLogoCasesTrigger() {
  logoCasesSt?.kill()
  logoCasesSt = null
  mobileMarkCasesSt?.kill()
  mobileMarkCasesSt = null
  aboutToneTriggers.forEach(trigger => trigger.kill())
  aboutToneTriggers = []
  isOverAboutSurface.value = false
  mobileMarkOverAboutSurface.value = false
  homeLogoDirectionSt?.kill()
  homeLogoDirectionSt = null

  if (routeBasePath.value !== '/') {
    isOverCases.value = false
    mobileMarkOverCases.value = false
    logoToneTries = 0
    return
  }

  await nextTick()
  const cases = document.getElementById('cases')
  const logo = logoImgEl.value
  if (!logo) return
  if (!cases) {
    mobileMarkOverCases.value = false
    if (logoToneTries < 24) {
      logoToneTries += 1
      requestAnimationFrame(() => {
        void setupLogoCasesTrigger()
      })
    }
    return
  }
  logoToneTries = 0

  if (!gsapMod) gsapMod = (await import('gsap')).default
  if (!stMod) {
    const mod = await import('gsap/ScrollTrigger')
    stMod = mod.ScrollTrigger
    gsapMod.registerPlugin(stMod)
  }

  // Use the photo's resting frame, so its levitation does not move the boundary.
  const stone = document.querySelector<HTMLElement>('.kado-stone-wrap')
  if (stone) {
    homeLogoDirectionSt = stMod.create({
      trigger: stone,
      start: 'top top',
      end: 'max',
      invalidateOnRefresh: true,
      onRefresh: () => {
        syncDesktopScrollMark()
        syncMobileScrollMark()
      },
    })
  }
  syncDesktopScrollMark()
  syncMobileScrollMark()

  logoCasesSt = stMod.create({
    trigger: cases,
    start: () => {
      const r = logo.getBoundingClientRect()
      return `top ${Math.round(r.bottom)}px`
    },
    end: () => {
      const r = logo.getBoundingClientRect()
      return `bottom ${Math.round(r.top + r.height / 2)}px`
    },
    invalidateOnRefresh: true,
    onToggle: (self) => {
      isOverCases.value = self.isActive
    },
    onRefresh: (self) => {
      isOverCases.value = self.isActive
    },
  })
  mobileMarkCasesSt = stMod.create({
    trigger: cases,
    start: () => {
      const r = fabEl.value?.getBoundingClientRect()
      return `top ${Math.round(r ? r.top + r.height / 2 : window.innerHeight)}px`
    },
    end: () => {
      const r = fabEl.value?.getBoundingClientRect()
      return `bottom ${Math.round(r ? r.top + r.height / 2 : window.innerHeight)}px`
    },
    invalidateOnRefresh: true,
    onToggle: (self) => {
      mobileMarkOverCases.value = self.isActive
    },
    onRefresh: (self) => {
      mobileMarkOverCases.value = self.isActive
    },
  })
  const aboutSurface = document.querySelector<HTMLElement>('#about .home-about__surface')
  if (aboutSurface) {
    aboutToneTriggers = [
      stMod.create({
        trigger: aboutSurface,
        start: () => `top ${Math.round(logo.getBoundingClientRect().bottom)}px`,
        end: () => {
          const r = logo.getBoundingClientRect()
          return `bottom ${Math.round(r.top + r.height / 2)}px`
        },
        invalidateOnRefresh: true,
        onToggle: self => { isOverAboutSurface.value = self.isActive },
        onRefresh: self => { isOverAboutSurface.value = self.isActive },
      }),
      stMod.create({
        trigger: aboutSurface,
        start: () => {
          const r = fabEl.value?.getBoundingClientRect()
          return `top ${Math.round(r ? r.top + r.height / 2 : window.innerHeight)}px`
        },
        end: () => {
          const r = fabEl.value?.getBoundingClientRect()
          return `bottom ${Math.round(r ? r.top + r.height / 2 : window.innerHeight)}px`
        },
        invalidateOnRefresh: true,
        onToggle: self => { mobileMarkOverAboutSurface.value = self.isActive },
        onRefresh: self => { mobileMarkOverAboutSurface.value = self.isActive },
      }),
    ]
  }
  syncLogoCasesToneFromLayout()
  scheduleLogoCasesToneSync(true)
}

function refreshLogoCasesTone() {
  if (!logoCasesSt || !stMod) return
  try {
    stMod.refresh()
  } catch {
    /* The header remains usable if ScrollTrigger is already being torn down. */
  }
}

/**
 * Browser scroll restoration can finish after the header and its trigger mount.
 * Re-read the trigger on the next painted frames so a direct load into Cases
 * receives the same logo tone as a normal scroll into the section.
 */
function scheduleLogoCasesToneSync(refresh = false) {
  if (logoToneSyncRaf) cancelAnimationFrame(logoToneSyncRaf)
  logoToneSyncRaf = requestAnimationFrame(() => {
    logoToneSyncRaf = requestAnimationFrame(() => {
      logoToneSyncRaf = 0
      if (refresh) refreshLogoCasesTone()
      if (logoCasesSt && stMod) stMod.update()
      syncLogoCasesToneFromLayout()
    })
  })
}

function onPageShow() {
  onScroll()
  scheduleLogoCasesToneSync(true)
}

async function gsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  return gsapMod
}

const LOGO_VARIANTS = {
  ru: {
    asset: '/brand/kado-logo.svg',
    viewBox: '0 0 81 27',
    width: 81,
    height: 27,
    /** The «ō» centre in the supplied KADŌ artwork's viewBox. */
    markCentreX: 71.67,
  },
  en: {
    asset: '/brand/kado-logo-en.svg',
    viewBox: '0 0 3248 1088',
    width: 3248,
    height: 1088,
    markCentreX: 2871.11,
  },
} as const
const logoVariant = computed(() => LOGO_VARIANTS[locale.value])

function logoMarkExpandedX() {
  // SVG transforms use viewBox units, not rendered CSS pixels. Move the
  // original glyph centre onto the square compact frame's centre.
  return logoVariant.value.height / 2 - logoVariant.value.markCentreX
}

async function animateDesktopLogo(compact: boolean, immediate = false) {
  const frame = logoImgEl.value
  const letters = logoLettersEl.value
  const mark = logoMarkEl.value
  if (!frame || !letters || !mark) return

  const g = await gsap()
  logoMorphTl?.kill()
  logoMorphTl = null

  const compactX = logoMarkExpandedX()
  const compactWidth = frame.offsetHeight
  const expandedWidth = frame.offsetHeight * logoVariant.value.width / logoVariant.value.height
  const reduce = prefersReducedMotion()
  if (immediate || reduce) {
    g.set(frame, { width: compact ? compactWidth : expandedWidth })
    g.set(letters, { autoAlpha: compact ? 0 : 1 })
    g.set(mark, {
      attr: { x: compact ? compactX : 0 },
      clearProps: 'transform',
    })
    return
  }

  const tl = g.timeline({ defaults: { overwrite: 'auto' } })
  logoMorphTl = tl

  if (compact) {
    // Continue from the rendered state when fast reverse scrolling interrupts
    // the opposite morph. Resetting `x` here made the «о» visibly jump before
    // it could travel into its compact frame.
    tl.to(letters, { autoAlpha: 0, duration: 0.34, ease: 'power2.out' }, 0)
      .to(
        mark,
        { attr: { x: compactX }, duration: 0.68, ease: 'power3.inOut' },
        0.16,
      )
      .to(
        frame,
        { width: compactWidth, duration: 0.68, ease: 'power3.inOut' },
        0.16,
      )
  } else {
    // The counterpart above also has to start from the interrupted frame:
    // `to()` picks up the live attribute/opacity values after kill().
    tl.to(
      frame,
      { width: expandedWidth, duration: 0.68, ease: 'power3.inOut' },
      0,
    )
      .to(mark, { attr: { x: 0 }, duration: 0.68, ease: 'power3.inOut' }, 0)
      .to(letters, { autoAlpha: 1, duration: 0.34, ease: 'power2.out' }, 0.52)
  }
}

function canCollapseHeader() {
  return window.matchMedia(`(min-width: ${COLLAPSE_MIN_WIDTH}px)`).matches
}

/** Resolve a CSS size token to used px (clamp/min/var all work). */
let tokenProbe: HTMLDivElement | null = null
let tokenCache: {
  content: number
  gutter: number
  margin: number
  inset: number
  headerContent: number
} | null = null

function measureTokenWidth(cssWidth: string): number {
  if (typeof document === 'undefined') return 0
  if (!tokenProbe) {
    tokenProbe = document.createElement('div')
    tokenProbe.style.cssText =
      'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;height:0'
    document.body.appendChild(tokenProbe)
  }
  tokenProbe.style.width = cssWidth
  return tokenProbe.getBoundingClientRect().width
}

function refreshTokens() {
  tokenCache = {
    content: measureTokenWidth('var(--layout-content)'),
    gutter: measureTokenWidth('var(--layout-gutter)'),
    margin: measureTokenWidth('var(--layout-margin)'),
    inset: measureTokenWidth('var(--layout-header-inset)'),
    headerContent: measureTokenWidth('var(--layout-header-content)'),
  }
}

function tokensNow() {
  if (!tokenCache) refreshTokens()
  return tokenCache!
}

/**
 * Expanded: full shell, no side pad (logo at col 1), full header-inset.
 * Collapsed (md+): content band + side pad = empty cols 1 & 12; tighter vertical inset.
 * Mobile stays expanded — no 1-col edge gutters and no vertical inset shrink.
 */
function layoutMetrics() {
  const shell = shellEl.value
  const expanded = shell?.clientWidth ?? 0
  const t = tokensNow()
  const contentBand = t.content
  const collapsed = Math.min(expanded, contentBand > 0 ? contentBand : expanded)
  const gutter = t.gutter
  const margin = t.margin
  const inset = t.inset || margin
  const headerContent = t.headerContent || 32
  const collapse = headerCollapsed.value && canCollapseHeader()
  /** Offset to column 2 on a 12-col track of width `collapsed` */
  const sidePad = collapse ? (collapsed + gutter) / 12 : 0
  /** Mobile: vertical insets −15%; top logo gap +20% on top of that. */
  const mobile = !canCollapseHeader()
  const insetY = mobile ? inset * 0.85 : inset
  const insetTop = mobile ? insetY * 1.2 : insetY
  const logoH = mobile ? headerContent * 1.1 : headerContent

  return {
    expanded,
    collapsed,
    collapseSides: collapse,
    sidePad,
    height: collapse
      ? inset * 0.5 + headerContent + inset
      : insetTop + logoH + insetY,
    paddingTop: collapse ? inset * 0.5 : insetTop,
    paddingBottom: collapse ? inset : insetY,
  }
}

function applyBox(
  bar: HTMLElement,
  width: number,
  height: number,
  paddingTop: number,
  paddingBottom: number,
  sidePad: number,
) {
  bar.style.width = `${width}px`
  bar.style.maxWidth = '100%'
  bar.style.height = `${height}px`
  bar.style.paddingTop = `${paddingTop}px`
  bar.style.paddingBottom = `${paddingBottom}px`
  bar.style.paddingLeft = `${sidePad}px`
  bar.style.paddingRight = `${sidePad}px`
}

function boxNear(
  bar: HTMLElement,
  width: number,
  height: number,
  paddingTop: number,
  paddingBottom: number,
  sidePad: number,
) {
  const n = (a: number, b: number) => Math.abs(a - b) < 1
  return (
    n(parseFloat(bar.style.width) || 0, width)
    && n(parseFloat(bar.style.height) || 0, height)
    && n(parseFloat(bar.style.paddingTop) || 0, paddingTop)
    && n(parseFloat(bar.style.paddingBottom) || 0, paddingBottom)
    && n(parseFloat(bar.style.paddingLeft) || 0, sidePad)
  )
}

async function morph(animate: boolean, onComplete?: () => void) {
  const bar = barEl.value
  if (!bar) return

  const m = layoutMetrics()
  if (m.expanded < 1) return

  const width = m.collapseSides ? m.collapsed : m.expanded
  const reduce =
    typeof window !== 'undefined'
    && prefersReducedMotion()
  const snap = !animate || reduce || boxNear(
    bar,
    width,
    m.height,
    m.paddingTop,
    m.paddingBottom,
    m.sidePad,
  )

  if (snap) {
    if (gsapMod) gsapMod.killTweensOf(bar)
    applyBox(bar, width, m.height, m.paddingTop, m.paddingBottom, m.sidePad)
    syncMenuFloat()
    onComplete?.()
    return
  }

  const g = gsapMod ?? (await gsap())
  g.to(bar, {
    width,
    height: m.height,
    paddingTop: m.paddingTop,
    paddingBottom: m.paddingBottom,
    paddingLeft: m.sidePad,
    paddingRight: m.sidePad,
    duration: ANIM_DURATION,
    ease: ANIM_EASE,
    overwrite: true,
    force3D: false,
    onUpdate: syncMenuFloat,
    onComplete: () => {
      syncMenuFloat()
      onComplete?.()
    },
  })
}

function resetHeaderWide(animate: boolean, deferFabExpand = false) {
  if (collapseTimer) {
    window.clearTimeout(collapseTimer)
    collapseTimer = 0
  }
  pendingExpand = false
  scrolled.value = false
  desktopLogoCollapsePending = false
  desktopLogoWantsCompact = false
  desktopScrollMarkOn.value = false
  window.scrollTo(0, 0)
  lastFabScrollY = 0
  if (deferFabExpand) {
    pendingFabExpandAfterCaseTransition = true
  } else {
    fabLabelOn.value = true
    void fitFabLabel(true, true)
  }
  void morph(animate)
}

function onScroll() {
  syncMenuFloat()
  syncFabLabel()
  syncDesktopScrollMark()
  syncMobileScrollMark()
  // Detail → home owns the destination scroll until the media has docked.
  // Never let its temporary scrollY=0 frame expand the header in between.
  if (returningToHomeCases.value) {
    if (collapseTimer) {
      window.clearTimeout(collapseTimer)
      collapseTimer = 0
    }
    if (canCollapseHeader() && !scrolled.value) {
      scrolled.value = true
      void morph(true)
    }
    return
  }
  if (canvasLocksScroll()) return

  const past = window.scrollY > 8

  if (!past) {
    if (collapseTimer) {
      window.clearTimeout(collapseTimer)
      collapseTimer = 0
    }
    if (scrolled.value) {
      scrolled.value = false
      void morph(true)
    }
    return
  }

  if (scrolled.value || collapseTimer) return

  collapseTimer = window.setTimeout(() => {
    collapseTimer = 0
    if (canvasLocksScroll()) return
    if (window.scrollY > 8) {
      scrolled.value = true
      const sequenceDesktopLogo = (
        !mobileHeader.value
        && desktopLogoWantsCompact
        && !desktopScrollMarkOn.value
      )
      desktopLogoCollapsePending = sequenceDesktopLogo
      void morph(true, () => {
        if (!desktopLogoCollapsePending) return
        desktopLogoCollapsePending = false
        if (
          !mobileHeader.value
          && scrolled.value
          && desktopLogoWantsCompact
          && window.scrollY > 8
          && !canvasLocksScroll()
        ) {
          desktopScrollMarkOn.value = true
        }
      })
    }
  }, COLLAPSE_DELAY_MS)
}

/**
 * On home, direction changes begin at the stone photo; other pages start at 8px.
 * The first scroll waits for the header shell to settle; later direction
 * changes stay responsive. Mobile uses its separate thumb-zone mark below.
 */
const DESKTOP_LOGO_DIR_PX = 6
function canUseLogoScrollDirection(y: number) {
  return routeBasePath.value !== '/'
    || (homeLogoDirectionSt !== null && y >= homeLogoDirectionSt.start)
}

function syncDesktopScrollMark() {
  if (mobileHeader.value) {
    desktopLogoCollapsePending = false
    desktopLogoWantsCompact = false
    desktopScrollMarkOn.value = false
    lastDesktopLogoScrollY = null
    return
  }
  if (canvasLocksScroll()) return

  if (returningToHomeCases.value) {
    desktopLogoCollapsePending = false
    desktopLogoWantsCompact = true
    desktopScrollMarkOn.value = true
    lastDesktopLogoScrollY = Math.max(0, window.scrollY || 0)
    return
  }

  const y = Math.max(0, window.scrollY || 0)
  if (y <= 8 || !canUseLogoScrollDirection(y)) {
    desktopLogoCollapsePending = false
    desktopLogoWantsCompact = false
    desktopScrollMarkOn.value = false
    lastDesktopLogoScrollY = y
    return
  }
  if (lastDesktopLogoScrollY == null) {
    lastDesktopLogoScrollY = y
    return
  }

  const dy = y - lastDesktopLogoScrollY
  if (Math.abs(dy) < DESKTOP_LOGO_DIR_PX) return
  lastDesktopLogoScrollY = y
  desktopLogoWantsCompact = dy > 0
  if (!desktopLogoWantsCompact) {
    desktopLogoCollapsePending = false
    desktopScrollMarkOn.value = false
    return
  }
  // On the first scroll away from the hero, let the bar finish collapsing
  // before the wordmark starts moving into its compact mark.
  if (!scrolled.value || desktopLogoCollapsePending) return
  desktopScrollMarkOn.value = true
}

/** Home keeps the top logo until the viewport reaches the stone photo. */
function armMobileLogoDirection(event: Event) {
  if (mobileLogoDirectionArmed || !mobileHeader.value || canvasLocksScroll()) return
  if (
    event instanceof KeyboardEvent
    && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
  ) return
  lastMobileLogoScrollY = Math.max(0, window.scrollY || 0)
  mobileLogoDirectionArmed = true
}

function syncMobileScrollMark() {
  if (!mobileHeader.value) {
    mobileScrollMarkOn.value = false
    lastMobileLogoScrollY = null
    return
  }
  if (canvasLocksScroll()) return

  const y = Math.max(0, window.scrollY || 0)
  if (!mobileLogoDirectionArmed) {
    lastMobileLogoScrollY = y
    return
  }
  if (!canUseLogoScrollDirection(y)) {
    mobileScrollMarkOn.value = false
    lastMobileLogoScrollY = y
    return
  }
  if (lastMobileLogoScrollY == null) {
    lastMobileLogoScrollY = y
    return
  }

  const dy = y - lastMobileLogoScrollY
  lastMobileLogoScrollY = y
  if (dy === 0) return
  mobileScrollMarkOn.value = dy > 0
}

function syncFabLabel() {
  if (!thumbNav.value) return
  if (canvasLocksScroll()) return
  const y = Math.max(0, window.scrollY || 0)
  if (performance.now() < fabLabelHoldUntil) {
    applyFabLabel(true)
    lastFabScrollY = y
    return
  }
  if (y <= 8) {
    applyFabLabel(true)
    lastFabScrollY = y
    return
  }
  const dy = y - lastFabScrollY
  if (Math.abs(dy) < FAB_LABEL_DIR_PX) return
  lastFabScrollY = y
  applyFabLabel(dy < 0)
}

function applyFabLabel(on: boolean, instant = false) {
  if (fabLabelOn.value === on && !instant) return
  fabLabelOn.value = on
  void fitFabLabel(on, instant)
}

async function fitFabLabel(on: boolean, instant = false) {
  const fab = fabEl.value
  if (!fab || !thumbNav.value) return
  const word = fab.querySelector('.menu-fab-word') as HTMLElement | null
  const label = fab.querySelector('.menu-sizer-menu') as HTMLElement | null
  if (!word || !label) return
  const g = await gsap()
  const reduced = prefersReducedMotion()
  const labelW = Math.ceil(label.scrollWidth)
  document.documentElement.style.setProperty(
    '--menu-fab-expanded-width',
    `${labelW + 68}px`,
  )
  document.documentElement.style.setProperty(
    '--menu-fab-current-width',
    `${on ? labelW + 68 : 40}px`,
  )
  fabFitTl?.kill()
  fabFitTl = null
  const prev = fabFitResolve
  fabFitResolve = null
  prev?.()
  if (instant || reduced) {
    g.set(word, { width: on ? labelW : 0 })
    g.set(fab, {
      paddingLeft: on ? 24 : 14,
      paddingRight: on ? 24 : 14,
      gap: on ? 8 : 0,
    })
    return
  }
  await new Promise<void>((resolve) => {
    fabFitResolve = resolve
    const tl = g.timeline({
      onComplete: () => {
        fabFitTl = null
        const r = fabFitResolve
        fabFitResolve = null
        r?.()
      },
    })
    fabFitTl = tl
    tl.to(
      word,
      {
        width: on ? labelW : 0,
        duration: CHIP_FIT_S,
        ease: CHIP_FIT_EASE,
        overwrite: true,
      },
      0,
    )
    tl.to(
      fab,
      {
        paddingLeft: on ? 24 : 14,
        paddingRight: on ? 24 : 14,
        gap: on ? 8 : 0,
        duration: CHIP_FIT_S,
        ease: CHIP_FIT_EASE,
        overwrite: true,
      },
      0,
    )
  })
}

function syncMenuFloat() {
  const slot = menuSlotEl.value
  const btn = menuBtnEl.value
  if (!slot || !btn || typeof window === 'undefined') return
  if (thumbNav.value) return
  const r = slot.getBoundingClientRect()
  const bh = btn.offsetHeight || r.height
  /* Center on the invisible grid slot so the chip shares the logo/nav row.
     Margin must stay 0 (see .menu-btn--float) so `top` maps to the border box. */
  btn.style.margin = '0'
  btn.style.top = `${Math.round(r.top + (r.height - bh) / 2)}px`
  btn.style.right = `${Math.round(window.innerWidth - r.right)}px`
}

function fitDeskChipWord() {
  const btn = menuBtnEl.value
  if (!btn || thumbNav.value) return
  const word = btn.querySelector('.menu-chip-word') as HTMLElement | null
  const sizerSelector = canvasOpen.value || canvasSurface.value
    ? '.menu-sizer-back'
    : '.menu-sizer-menu'
  const sizer = btn.querySelector(sizerSelector) as HTMLElement | null
  if (!word || !sizer) return
  word.style.width = `${Math.ceil(sizer.scrollWidth)}px`
}

watch(locale, async () => {
  await nextTick()
  requestAnimationFrame(() => {
    if (thumbNav.value && !canvasOpen.value && !canvasSurface.value) {
      void fitFabLabel(fabLabelOn.value, true)
    }
    else fitDeskChipWord()
    syncMenuFloat()
  })
}, { flush: 'post' })

function onResize() {
  if (isMobileChromeHeightOnlyResize()) {
    syncMenuFloat()
    return
  }
  desktopLogoCollapsePending = false
  refreshTokens()
  void morph(false)
  syncMenuFloat()
  refreshLogoCasesTone()
}

/**
 * Keep the FAB’s visible bottom inset equal to the right inset.
 * iOS/Android chrome show/hide changes visualViewport vs layout viewport —
 * plain `bottom: …` then drifts while `right` stays correct.
 */
function syncFabViewport() {
  const vv = window.visualViewport
  if (!vv || vv.height < 80) {
    fabBottomExtra.value = 0
    syncMenuFloat()
    return
  }
  fabBottomExtra.value = Math.min(
    96,
    Math.max(0, window.innerHeight - vv.offsetTop - vv.height),
  )
  syncMenuFloat()
}

function syncThumbNav() {
  thumbNav.value = isThumbNav()
  mobileHeader.value = thumbNav.value
  syncDesktopScrollMark()
  syncMobileScrollMark()
}

function runHeaderPostIntroSetup() {
  if (headerPostIntroSetupDone) return
  headerPostIntroSetupDone = true
  void gsap()
  void nextTick(() => {
    void fitFabLabel(fabLabelOn.value, true)
    fitDeskChipWord()
    syncMenuFloat()
    void setupLogoCasesTrigger()
  })
  void document.fonts?.ready.then(() => {
    fitDeskChipWord()
    if (thumbNav.value) void fitFabLabel(fabLabelOn.value, true)
    syncMenuFloat()
    scheduleLogoCasesToneSync(true)
  })
}

onMounted(() => {
  navHydrated = true
  navHerePath.value = stripLocalePrefix(route.fullPath)
  registerFabFit(fitFabLabel)
  refreshTokens()
  void morph(false)
  syncThumbNav()
  onScroll()
  syncFabViewport()
  const coldHomeBoot = initialHomeDocument.value
    && routeBasePath.value === '/'
    && !homeIntroUnlocked.value
  if (coldHomeBoot) {
    stopHeaderIntroUnlockWatch = watch(
      homeIntroUnlocked,
      (unlocked) => {
        if (!unlocked) return
        stopHeaderIntroUnlockWatch?.()
        stopHeaderIntroUnlockWatch = null
        runHeaderPostIntroSetup()
      },
      { flush: 'post' },
    )
  } else runHeaderPostIntroSetup()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('touchstart', armMobileLogoDirection, { passive: true })
  window.addEventListener('pointerdown', armMobileLogoDirection, { passive: true })
  window.addEventListener('wheel', armMobileLogoDirection, { passive: true })
  window.addEventListener('keydown', armMobileLogoDirection)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('resize', syncThumbNav, { passive: true })
  window.visualViewport?.addEventListener('resize', syncFabViewport)
  window.visualViewport?.addEventListener('scroll', syncFabViewport)

  void nextTick(() => animateDesktopLogo(desktopScrollMarkOn.value, true))
  watch(
    desktopScrollMarkOn,
    compact => void nextTick(() => animateDesktopLogo(compact)),
    { flush: 'post' },
  )
  watch(
    locale,
    () => void nextTick(() => animateDesktopLogo(desktopScrollMarkOn.value, true)),
    { flush: 'post' },
  )

  watch(
    canvasForced,
    (on, was) => {
      if (on) desktopLogoCollapsePending = false
      if (was && !on) {
        applyFabLabel(true, true)
        fabLabelHoldUntil = performance.now() + 160
      }
      void morph(true)
    },
    { flush: 'sync' },
  )

  watch(menuBusy, (on, was) => {
    if (was && !on) void nextTick(restoreMenuHoverFill)
  })

  // HomeCases can be hot-replaced while the viewport is already inside the
  // section. Refresh the geometric logo check when its active tone is restored.
  watch(activeHomeCaseInverse, () => scheduleLogoCasesToneSync())

  watch(
    () => route.path,
    () => {
      void setupLogoCasesTrigger()
      if (returningToHomeCases.value) {
        if (collapseTimer) {
          window.clearTimeout(collapseTimer)
          collapseTimer = 0
        }
        pendingExpand = false
        const wasCollapsed = scrolled.value && canCollapseHeader()
        scrolled.value = canCollapseHeader()
        lastFabScrollY = window.scrollY
        lastDesktopLogoScrollY = window.scrollY
        if (!mobileHeader.value) desktopScrollMarkOn.value = true
        void morph(!wasCollapsed)
        return
      }
      if (canvasForced.value) {
        pendingExpand = false
        scrolled.value = false
        return
      }
      const wasCollapsed = scrolled.value && canCollapseHeader()
      if (wasCollapsed && pageIrisLive.value) {
        // Stay compact under the sand; expand with morph after the iris opens.
        if (collapseTimer) {
          window.clearTimeout(collapseTimer)
          collapseTimer = 0
        }
        window.scrollTo(0, 0)
        lastFabScrollY = 0
        fabLabelOn.value = true
        void fitFabLabel(true, true)
        pendingExpand = true
        return
      }
      resetHeaderWide(
        wasCollapsed,
        thumbNav.value && caseDetailTransitionActive.value,
      )
    },
  )

  watch(pageIrisLive, (live, was) => {
    if (was && !live && pendingExpand) {
      resetHeaderWide(true)
    }
  })

  watch(caseDetailTransitionActive, (active, was) => {
    if (!was || active || !pendingFabExpandAfterCaseTransition) return
    pendingFabExpandAfterCaseTransition = false
    applyFabLabel(true)
  })

  const initialReveal = useInitialReveal()
  // Keep the SSR-hidden shell covered while the immediate watcher loads GSAP
  // and stages every child; uncovering earlier produces a visible → hidden →
  // animated sequence during that async gap.

  watch(
    [
      () => initialReveal.revealed.value,
      homeSurfaceReady,
      homeIntroHeaderReady,
      routeBasePath,
    ],
    async ([on, surfaceReady, headerReady, basePath]) => {
      const coldHome = initialHomeDocument.value && basePath === '/'
      if (!on || (coldHome && (!surfaceReady || !headerReady))) return
      const g = await gsap()

      const domOf = (v: unknown): HTMLElement | null => {
        if (!v) return null
        if (v instanceof HTMLElement) return v
        const el = (v as { $el?: unknown }).$el
        return el instanceof HTMLElement ? el : null
      }

      // Fade the artwork: the link's CSS transition owns scroll visibility.
      // Tweening that same opacity restarts its transition on every GSAP tick.
      const logo = logoImgEl.value
      const menuBtn = domOf(menuBtnEl.value)
      const fab = domOf(fabEl.value)
      const caseBack = domOf(caseBackEl.value)
      const caseMobileBack = domOf(caseMobileBackEl.value)
      const navLinks = navEl.value
        ? Array.from(navEl.value.querySelectorAll('.nav-link'))
        : []

      if (logo) g.set(logo, { autoAlpha: 0 })
      if (caseBack) g.set(caseBack, { autoAlpha: 0, y: -10 })
      if (navEl.value) g.set(navEl.value, { autoAlpha: 0, y: -10 })
      if (navLinks.length) g.set(navLinks, { autoAlpha: 0, y: -5 })
      if (menuBtn) g.set(menuBtn, { autoAlpha: 0, y: -10 })
      if (caseMobileBack) g.set(caseMobileBack, { autoAlpha: 0, y: 10 })
      if (fab) g.set(fab, { autoAlpha: 0, y: 10 })
      if (shellEl.value) g.set(shellEl.value, { autoAlpha: 1 })

      introPending.value = false
      await nextTick()

      const tl = g.timeline({ defaults: { ease: 'power3.out' } })
      // The pill itself participates in the reveal. Previously the shell was
      // uncovered before its children were staged, so the nav background and
      // case-back control flashed in raw while the links animated afterward.
      if (logo) {
        tl.to(logo, { autoAlpha: 1, duration: 0.28, ease: 'power1.out' }, 0.06)
      }
      if (caseBack) tl.to(caseBack, { autoAlpha: 1, y: 0, duration: 0.58 }, 0.47)
      if (navEl.value) {
        tl.to(navEl.value, { autoAlpha: 1, y: 0, duration: 0.58 }, 0.52)
      }
      if (navLinks.length) {
        tl.to(
          navLinks,
          { autoAlpha: 1, y: 0, duration: 0.48, stagger: 0.07 },
          0.62,
        )
      }
      if (menuBtn) tl.to(menuBtn, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.95)
      if (caseMobileBack) {
        tl.to(caseMobileBack, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.48)
      }
      if (fab) tl.to(fab, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.68)
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  aboutToneTriggers.forEach(trigger => trigger.kill())
  aboutToneTriggers = []
  if (collapseTimer) window.clearTimeout(collapseTimer)
  if (logoToneSyncRaf) cancelAnimationFrame(logoToneSyncRaf)
  logoToneSyncRaf = 0
  stopHeaderIntroUnlockWatch?.()
  stopHeaderIntroUnlockWatch = null
  logoCasesSt?.kill()
  logoCasesSt = null
  mobileMarkCasesSt?.kill()
  mobileMarkCasesSt = null
  homeLogoDirectionSt?.kill()
  homeLogoDirectionSt = null
  logoMorphTl?.kill()
  logoMorphTl = null
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('touchstart', armMobileLogoDirection)
  window.removeEventListener('pointerdown', armMobileLogoDirection)
  window.removeEventListener('wheel', armMobileLogoDirection)
  window.removeEventListener('keydown', armMobileLogoDirection)
  window.removeEventListener('pageshow', onPageShow)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('resize', syncThumbNav)
  window.visualViewport?.removeEventListener('resize', syncFabViewport)
  window.visualViewport?.removeEventListener('scroll', syncFabViewport)
  if (barEl.value && gsapMod) gsapMod.killTweensOf(barEl.value)
  fabFitTl?.kill()
  registerFabFit(null)
  document.documentElement.style.removeProperty('--menu-fab-expanded-width')
  document.documentElement.style.removeProperty('--menu-fab-current-width')
  tokenProbe?.remove()
  tokenProbe = null
  tokenCache = null
})
</script>

<template>
  <header
    class="pointer-events-none fixed inset-x-0 top-0 z-[113] site-header"
    :class="{
      'site-header--case': detailCase,
      'site-header--case-inverse': detailInverse,
      'site-header--case-transitioning': caseDetailTransitionActive,
      'site-header--behind-mobile-cases': mobileHeader && isOverCases,
    }"
    :inert="canvasSurface"
  >
    <!--
      GSAP tweens width + side + vertical inset together (md+ only).
      Mobile: logo centered; menu is a bottom-right FAB (thumb zone).
    -->
    <div
      ref="shellEl"
      class="w-full"
      :class="{ 'header-intro-hide': introPending }"
      :style="{ paddingInline: 'var(--layout-margin)' }"
    >
      <div
        ref="barEl"
        class="header-bar pointer-events-none mx-auto grid max-w-full items-center"
        :class="{ 'header-bar--scrolled': headerCollapsed }"
        :style="{
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          columnGap: 'var(--layout-gutter)',
        }"
      >
        <NuxtLink
          :to="localePath('/')"
          data-home-top
          class="header-logo-link pointer-events-auto row-start-1 self-center col-span-12 col-start-1 justify-self-center md:col-span-3 md:justify-self-start"
          :class="{ 'header-logo-link--mobile-scrolled': mobileScrollMarkVisible }"
          :aria-label="t('accessibility.brandHome')"
          :tabindex="canvasSurface ? -1 : 0"
          @click="onLogoClick"
          @pointerenter="preloadHomeSceneAssets"
        >
          <span
            ref="logoImgEl"
            class="header-logo"
            :class="{ 'header-logo--inverted': logoInverted }"
            :style="{ '--logo-aspect': logoVariant.width / logoVariant.height }"
          >
            <svg
              class="header-logo__svg"
              :viewBox="logoVariant.viewBox"
              fill="none"
              aria-hidden="true"
            >
              <g ref="logoLettersEl" class="header-logo__letters">
                <use :href="`${logoVariant.asset}#kado-logo-letters`" />
              </g>
              <use
                ref="logoMarkEl"
                class="header-logo__mark"
                :href="`${logoVariant.asset}#kado-logo-mark`"
              />
            </svg>
          </span>
        </NuxtLink>

        <Transition name="case-header-back">
          <button
            v-if="detailCase"
            ref="caseBackEl"
            type="button"
            class="case-header-back site-nav pointer-events-auto hidden md:row-start-1 md:self-center md:inline-flex md:col-span-2 md:col-start-4"
            :aria-label="t('common.backHome')"
            @click="onCaseDetailBack"
          >
            <span class="case-header-back__frame" aria-hidden="true">
              <SiteIcon name="arrow-left" :size="32" />
            </span>
            <span class="case-header-back__label">{{ t('common.back') }}</span>
            <span class="case-header-back__frame case-header-back__frame--after" aria-hidden="true">
              <SiteIcon name="arrow-left" :size="32" />
            </span>
          </button>
        </Transition>

        <nav
          ref="navEl"
          class="header-nav header-chip site-nav pointer-events-auto row-start-1 self-center col-span-5 col-start-6 hidden w-fit items-center justify-self-start md:flex md:col-span-3 md:col-start-8 gap-x-[-1.5rem]"
          :class="{ 'header-chip--scrolled': headerCollapsed }"
          :aria-label="t('navigation.mainLabel')"
        >
          <NuxtLink
            v-for="(link, index) in links"
            :key="link.to"
            :to="localePath(link.to)"
            class="nav-link chip-scale-host text-ink"
            :class="{
              'nav-link--here': isNavHere(link.to),
              'is-chip-on': link.to === '/projects' && isNavHere(link.to),
            }"
            :aria-current="isNavHere(link.to) ? 'page' : undefined"
            @pointerenter="onChipPointer"
            @pointerleave="onChipPointer"
            @focusin="onChipPointer"
            @pointerdown="onNavPointerDown(link.to, $event)"
          >
            <span class="chip-scale-bg" aria-hidden="true">
              <span class="chip-scale-bg__fill" />
            </span>
            <span class="nav-link__label">{{ t(link.labelKey) }}</span>
            <span v-if="index < links.length - 1" class="nav-link__comma">,</span>
          </NuxtLink>
        </nav>

        <span
          ref="menuSlotEl"
          class="header-desk-menu menu-btn menu-btn-slot header-chip site-nav row-start-1 self-center col-span-1 col-start-12 hidden items-center justify-end gap-2 justify-self-end pointer-events-none invisible md:flex"
          aria-hidden="true"
        >
          <span class="menu-chip-word">{{ t('common.menu') }}</span>
          <span class="menu-dots">
            <span class="menu-dot" />
            <span class="menu-dot" />
          </span>
        </span>

      </div>
    </div>
  </header>

  <Teleport to="body">
    <button
      ref="menuBtnEl"
      type="button"
      class="header-desk-menu menu-btn menu-btn--float header-chip site-nav chip-scale-host items-center justify-end gap-2 text-ink"
      :class="{
        'header-chip--scrolled': headerCollapsed,
        'header-intro-hide': introPending,
        'menu-chip-busy': menuBusy,
        'menu-btn--case': detailCase,
        'menu-btn--case-transitioning': caseDetailTransitionActive,
      }"
      :aria-busy="menuBusy"
      :aria-expanded="canvasOpen"
      :aria-label="canvasOpen ? t('common.closeMenu') : t('common.openMenu')"
      @pointerenter="onMenuHoverEnter"
      @pointerleave="onMenuHoverLeave"
      @click="toggleCanvas"
    >
      <span class="chip-scale-bg" aria-hidden="true">
        <span class="chip-scale-bg__fill" />
      </span>
      <span class="menu-chip-word">
        <span class="menu-chip-sizers" aria-hidden="true">
          <span class="menu-sizer-menu">{{ t('common.menu') }}</span>
          <span class="menu-sizer-back">{{ t('common.close') }}</span>
        </span>
        <span class="menu-chip-window">
          <span class="menu-chip-track">
            <span class="menu-chip-line">{{ t('common.menu') }}</span>
            <span class="menu-chip-line">{{ t('common.close') }}</span>
          </span>
        </span>
      </span>
      <span class="menu-dots" aria-hidden="true">
        <span class="menu-dot" />
        <span class="menu-dot" />
      </span>
    </button>
  </Teleport>

  <!-- Mobile thumb-zone menu — pinned to visual viewport bottom (matches right inset). -->
  <Teleport to="body">
    <Transition name="mobile-scroll-mark">
      <NuxtLink
        v-if="mobileScrollMarkVisible && !canvasSurface"
        :to="localePath('/')"
        data-home-top
        class="mobile-scroll-mark pointer-events-auto"
        :class="{ 'mobile-scroll-mark--inverted': mobileScrollMarkInverted }"
        :style="fabStyle"
        :aria-label="t('accessibility.brandHomeRu')"
        @click="onLogoClick"
        @pointerenter="preloadHomeSceneAssets"
      >
        <img src="/brand/kado-logo-ru-o.svg" alt="" width="28" height="28">
      </NuxtLink>
    </Transition>
    <button
      v-if="detailCase && !canvasSurface"
      ref="caseMobileBackEl"
      type="button"
      class="case-mobile-back site-nav pointer-events-auto"
      :class="{
        'header-intro-hide': introPending,
        'case-mobile-back--transitioning': caseDetailTransitionActive,
      }"
      :style="fabStyle"
      :aria-label="t('common.backHome')"
      @click="onCaseDetailBack"
    >
      <SiteIcon name="arrow-left" :size="32" />
    </button>
    <button
      ref="fabEl"
      type="button"
      class="menu-fab site-nav chip-scale-host pointer-events-auto flex items-center text-ink"
      :class="{
        'header-intro-hide': introPending,
        'menu-fab--compact': !fabLabelOn,
        'menu-chip-busy': menuBusy,
        'menu-fab--case': detailCase,
        'menu-fab--case-transitioning': caseDetailTransitionActive,
      }"
      :tabindex="0"
      :style="fabStyle"
      :aria-busy="menuBusy"
      :aria-expanded="canvasOpen"
      :aria-label="canvasOpen ? t('common.closeMenu') : t('common.openMenu')"
      @pointerenter="onMenuHoverEnter"
      @pointerleave="onMenuHoverLeave"
      @click="toggleCanvas"
    >
      <span class="chip-scale-bg" aria-hidden="true">
        <span class="chip-scale-bg__fill" />
      </span>
      <span class="menu-chip-word menu-fab-word" aria-hidden="true">
        <span class="menu-chip-sizers">
          <span class="menu-sizer-menu">{{ t('common.menu') }}</span>
          <span class="menu-sizer-back">{{ t('common.close') }}</span>
        </span>
        <span class="menu-chip-window">
          <span class="menu-chip-track">
            <span class="menu-chip-line">{{ t('common.menu') }}</span>
            <span class="menu-chip-line">{{ t('common.close') }}</span>
          </span>
        </span>
      </span>
      <span class="menu-dots" aria-hidden="true">
        <span class="menu-dot" />
        <span class="menu-dot" />
      </span>
    </button>
  </Teleport>
</template>

<style scoped>
/* Hide the header shell and teleported controls until the intro stages them.
   Controls need extra specificity because their base styles set visibility. */
.header-intro-hide,
.site-nav.header-intro-hide {
  opacity: 0;
  visibility: hidden;
}

.site-header {
  isolation: isolate;
  transition: opacity 0.32s var(--motion-ease, ease), visibility 0.32s;
}

/* The sticky mobile case switcher occupies the logo row. Let the section sit
   above the wordmark while keeping the teleported thumb-zone menu untouched. */
.site-header--behind-mobile-cases {
  z-index: 9;
}

/* The mobile cases rail owns the upper edge. Suppress the full wordmark for
   the whole overlap; the teleported lower mark remains available. */
.site-header--behind-mobile-cases .header-logo-link {
  pointer-events: none;
  opacity: 0 !important;
  visibility: hidden;
  transition: none !important;
}

.site-header--case {
  color: var(--palette-ink, #171915);
}

/* Keep the full header as a stable navigation layer during case transitions.
   Interaction is paused while the cover owns the page, but nothing fades. */
.site-header--case-transitioning .header-nav,
.menu-btn--case-transitioning,
.menu-fab--case-transitioning,
.case-mobile-back--transitioning {
  pointer-events: none !important;
  opacity: 0;
  transform: translateY(0.5rem);
}

/* The desktop return action is the control that starts the cover. Moving it
   down on that same click reads as a sharp layout jump, unlike the passive
   header chrome. Keep its origin fixed while it fades under the transition. */
.site-header--case-transitioning .case-header-back {
  pointer-events: none !important;
  opacity: 0;
  transform: none;
}

.header-nav,
.case-header-back,
.case-mobile-back,
.menu-btn--float,
.menu-fab {
  transition: opacity 0.28s var(--motion-ease, ease);
}

/* Mobile case return mirrors the thumb-zone menu: an icon-only companion on
   its left, with the same viewport-safe lower inset. */
.case-mobile-back {
  --header-chip-bg: var(--semantic-bg-control);
  position: fixed;
  right: calc(
    2 * var(--layout-margin) + var(--safe-right, 0px)
    + var(--menu-fab-current-width, 40px) + 8px
  );
  bottom: calc(2 * var(--layout-margin) + var(--safe-bottom, 0px));
  z-index: 114;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 42px;
  height: 42px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  appearance: none;
  cursor: pointer;
  color: var(--palette-milk, #f5f1e8);
  background-color: var(--header-chip-bg);
  transition:
    right 0.52s cubic-bezier(0.645, 0.045, 0.355, 1),
    opacity 0.28s var(--motion-ease, ease),
    transform 0.28s var(--motion-ease, ease);
}

.case-mobile-back svg {
  width: 22px;
  height: 22px;
}

@media (hover: hover) and (pointer: fine) {
  .nav-link:hover,
  .nav-link:focus-visible,
  .menu-btn:hover,
  .menu-btn:focus-visible,
  .menu-fab:hover,
  .menu-fab:focus-visible {
    color: var(--palette-milk, #f5f1e8) !important;
  }
}

/* Under the menu overlay; above the SPA hop veil so chrome stays put. */
html.page-canvas-surface .site-header {
  z-index: 100;
}

html.page-iris-lock:not(.page-canvas-surface) .site-header {
  z-index: 113;
}

/* Sand iris + nav fill clash — keep only the link group clear while the hop
   covers. The menu control stays dark so it does not flash transparent. */
html.page-iris-lock .header-nav.header-chip,
html.page-iris-lock .header-nav.header-chip--scrolled {
  background-color: transparent !important;
  color: var(--palette-ink, #171915) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  transition: none;
}

/* Instant while the close overlay still covers — a 0.32s fade after zoom
   looks like the header remounting. */
html.page-canvas-lock .site-header,
html.page-canvas-lock .menu-fab,
html.page-canvas-lock .menu-btn--float {
  transition: none;
}

.header-bar {
  box-sizing: border-box;
}

.header-logo-link {
  min-width: max-content;
  cursor: pointer;
}

.mobile-scroll-mark {
  position: fixed;
  left: calc(2 * var(--layout-margin) + var(--safe-left, 0px));
  z-index: 114;
  display: flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  transition:
    opacity 0.28s var(--motion-ease, ease),
    transform 0.28s var(--motion-ease, ease);
}

.mobile-scroll-mark img {
  display: block;
  width: 28px;
  height: 28px;
  /* Match the menu FAB's 1px optical lift from its asymmetric vertical padding. */
  transform: translateY(-1px);
  transition: filter 0.35s var(--motion-ease, ease);
}

.mobile-scroll-mark--inverted img {
  filter: brightness(0) invert(1);
}

.mobile-scroll-mark-enter-active,
.mobile-scroll-mark-leave-active {
  transition:
    opacity 0.28s var(--motion-ease, ease),
    transform 0.28s var(--motion-ease, ease);
}

.mobile-scroll-mark-enter-from,
.mobile-scroll-mark-leave-to {
  opacity: 0;
  transform: translateY(calc(100% + 0.75rem));
}

.header-logo {
  --header-logo-height: calc(var(--layout-header-content) * 0.84375);
  --logo-aspect: 3;

  position: relative;
  display: block;
  width: calc(var(--header-logo-height) * var(--logo-aspect));
  height: var(--header-logo-height);
  max-width: none;
  overflow: hidden;
  transition: filter 0.35s var(--motion-ease, ease);
  will-change: width;
}

.header-logo__svg {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  width: calc(var(--header-logo-height) * var(--logo-aspect));
  height: 100%;
  max-width: none;
  overflow: visible;
}

.header-logo__letters,
.header-logo__mark {
  will-change: opacity;
}

.header-logo__mark {
  transform: none;
}

.header-logo--inverted {
  filter: brightness(0) invert(1);
}

.case-header-back {
  position: relative;
  align-items: center;
  justify-content: center;
  border: 0;
  width: 8.5rem;
  min-height: 0;
  padding: 8px 0.9rem;
  overflow: hidden;
  cursor: pointer;
  appearance: none;
  border-radius: 999px;
  background-color: var(--palette-sand);
  color: var(--palette-ink, #171915);
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
  line-height: 1;
  font: inherit;
  transition:
    opacity 0.28s var(--motion-ease, ease),
    background-color 0.35s var(--motion-ease, ease),
    color 0.35s var(--motion-ease, ease);
}

.case-header-back-enter-active,
.case-header-back-leave-active {
  transition:
    opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-header-back-enter-from,
.case-header-back-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}

.case-header-back__frame {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  display: flex;
  width: 26px;
  height: 26px;
  transform: translate3d(0, calc(-50% + 2px), 0);
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-header-back__frame svg {
  width: 100%;
  height: 100%;
}

.case-header-back__label {
  transform: translate3d(1rem, var(--header-text-optical-y), 0);
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-header-back__frame--after {
  right: 0.75rem;
  left: auto;
  transform: translate3d(calc(100% + 0.9rem), calc(-50% + 2px), 0);
}

@media (hover: hover) and (pointer: fine) {
  .case-header-back:hover,
  .case-header-back:focus-visible {
    background-color: var(--palette-ink, #171915);
    color: var(--palette-milk, #f5f1e8);
  }

  .case-header-back:hover .case-header-back__frame:not(.case-header-back__frame--after),
  .case-header-back:focus-visible .case-header-back__frame:not(.case-header-back__frame--after) {
    transform: translate3d(calc(-100% - 0.9rem), calc(-50% + 2px), 0);
  }

  .case-header-back:hover .case-header-back__label,
  .case-header-back:focus-visible .case-header-back__label {
    transform: translate3d(-1rem, var(--header-text-optical-y), 0);
  }

  .case-header-back:hover .case-header-back__frame--after,
  .case-header-back:focus-visible .case-header-back__frame--after {
    transform: translate3d(0, calc(-50% + 2px), 0);
  }
}

.header-logo-link {
  transition:
    opacity 0.28s var(--motion-ease, ease),
    transform 0.28s var(--motion-ease, ease);
}

/* Direction state must win over inline values left by page transitions. */
.header-logo-link--mobile-scrolled {
  pointer-events: none;
  opacity: 0 !important;
  transform: translateY(calc(-100% - var(--layout-header-inset))) !important;
}

@media (max-width: 767px) {
  .header-logo {
    --header-logo-height: calc(var(--layout-header-content) * 1.1 * 0.84375);
  }
}

.header-chip,
.menu-fab {
  --header-chip-bg: var(--semantic-bg-control);
}

.header-chip {
  /* 8dp chrome: 8 / 12 */
  padding: 8px 12px;
  margin: -8px -12px;
  border-radius: 8px;
  background-color: var(--header-chip-bg);
  color: var(--palette-milk, #f5f1e8);
  transition: background-color 0.58s cubic-bezier(0.645, 0.045, 0.355, 1);
}

/* Desktop nav pill: small inline chrome so hover fills sit inside the group. */
@media (min-width: 768px) {
  /* One desktop control height: nav pill, back action and floating menu.
     Keep link boxes untouched so their radial hover fills still cover the
     same individual hit areas. */
  .case-header-back,
  .header-nav.header-chip,
  .header-desk-menu.menu-btn {
    box-sizing: border-box;
    height: calc(1.25em + 16px);
    min-height: 0;
  }

  .header-nav.header-chip {
    padding-left: 4px;
    padding-right: 4px;
    margin-left: -4px;
    margin-right: -4px;
    background-color: var(--palette-sand);
    color: var(--palette-ink, #171915);
  }
}

/* Nav group shares one pill surface (not per-link chips). */
.site-nav.header-chip:not(.menu-btn) {
  border-radius: 9999px;
}

.header-chip--scrolled {
  background-color: var(--header-chip-bg);
}

/* backdrop-filter is a scroll-compositor tax on mobile Chrome too — solid only. */
@media (max-width: 767px) {
  .header-chip--scrolled {
    background-color: var(--header-chip-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

@supports not (-webkit-touch-callout: none) {
  @media (min-width: 768px) {
    .header-chip {
      backdrop-filter: blur(0);
      -webkit-backdrop-filter: blur(0);
      transition:
        background-color 0.58s cubic-bezier(0.645, 0.045, 0.355, 1),
        backdrop-filter 0.58s cubic-bezier(0.645, 0.045, 0.355, 1),
        -webkit-backdrop-filter 0.58s cubic-bezier(0.645, 0.045, 0.355, 1);
    }

    .header-chip--scrolled {
      background-color: var(--header-chip-bg);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
}

.menu-btn {
  position: relative;
  cursor: pointer;
  border-radius: 9999px;
  padding-block: 8px;
  /* ~1.5× chip horizontal padding (2× then −25%) */
  padding-inline: 18px;
  margin-inline: -18px;
}

.menu-btn--float {
  position: fixed;
  z-index: 114;
  pointer-events: auto;
  display: none;
  /* Fixed `top` is the margin edge — any leftover chip margin
     (-8px from .header-chip) lifts the whole control off the header axis. */
  margin: 0;
}

@media (min-width: 768px) and (pointer: fine) {
  .menu-btn--float {
    display: inline-flex;
  }
}

.menu-chip-busy {
  /* Keep hit-testing — pointer-events:none clears :hover and it won’t
     return until the next move (often looks like hover “falls off”). */
  cursor: default;
}

.menu-chip-word {
  position: relative;
  z-index: 1;
  display: block;
  flex: 0 0 auto;
  overflow: hidden;
  height: 1.25em;
  width: 0;
}

.menu-btn-slot .menu-chip-word {
  width: max-content;
  transform: none;
}

.menu-chip-sizers {
  position: absolute;
  left: 0;
  top: 0;
  width: max-content;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
}

.menu-chip-sizers span {
  display: block;
  width: max-content;
}

.menu-chip-window {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.menu-chip-track {
  display: flex;
  flex-direction: column;
}

.menu-chip-line {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 1.25em;
  white-space: nowrap;
  transform: translateY(var(--header-text-optical-y));
}

/* The mobile FAB's text sits optically low inside its pill. */
.menu-fab .menu-chip-line {
  transform: translateY(calc(var(--header-text-optical-y) - 2px));
}

.menu-btn:disabled,
.menu-fab:disabled {
  pointer-events: none;
  cursor: default;
  opacity: 0.55;
}

.menu-dots {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transform-origin: center center;
  transition: transform 0.32s var(--motion-ease, ease);
  will-change: transform;
}

.menu-dot {
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: currentColor;
}

.menu-btn:hover .menu-dots,
.menu-btn:focus-visible .menu-dots,
.menu-btn:active .menu-dots,
.menu-btn[aria-expanded='true'] .menu-dots {
  transform: rotate(90deg);
}

html.page-canvas-surface .menu-dots {
  transition: none;
}

html.page-canvas-surface .menu-btn:hover .menu-dots,
html.page-canvas-surface .menu-fab:hover .menu-dots,
html.page-canvas-surface .menu-btn:focus-visible .menu-dots,
html.page-canvas-surface .menu-fab:focus-visible .menu-dots,
html.page-canvas-surface .menu-btn[aria-expanded='true'] .menu-dots,
html.page-canvas-surface .menu-fab[aria-expanded='true'] .menu-dots {
  transform: none;
}

.menu-fab {
  position: fixed;
  top: auto;
  left: auto;
  right: calc(2 * var(--layout-margin) + var(--safe-right, 0px));
  bottom: calc(2 * var(--layout-margin) + var(--safe-bottom, 0px));
  z-index: 114;
  display: flex;
  box-sizing: border-box;
  height: 42px;
  margin: 0;
  gap: 8px;
  border: 0;
  cursor: pointer;
  appearance: none;
  font: inherit;
  color: var(--palette-milk, #f5f1e8);
  border-radius: 9999px;
  padding: 10px 24px;
  opacity: 1;
  visibility: visible;
  background-color: var(--header-chip-bg);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.header-nav .chip-scale-bg__fill,
.menu-btn--float .chip-scale-bg__fill,
.menu-fab .chip-scale-bg__fill {
  background-color: var(--semantic-bg-control-hover);
}

/* The link group stays a light editorial surface; only its active hover inverts. */
.header-nav .chip-scale-bg__fill {
  background-color: var(--palette-ink, #171915);
}

.nav-link,
.menu-btn--float,
.menu-fab {
  color: var(--palette-milk, #f5f1e8) !important;
  transition: color 0.3s var(--motion-ease, ease);
}

.menu-fab {
  transition:
    color 0.3s var(--motion-ease, ease),
    opacity 0.28s var(--motion-ease, ease),
    transform 0.28s var(--motion-ease, ease);
}

.header-nav .nav-link {
  color: var(--palette-ink, #171915) !important;
}

.header-nav .nav-link.is-chip-on {
  color: var(--palette-milk, #f5f1e8) !important;
}

@media (hover: hover) and (pointer: fine) {
  .header-nav .nav-link:hover,
  .header-nav .nav-link:focus-visible {
    color: var(--palette-milk, #f5f1e8) !important;
  }
}

.menu-fab:hover .menu-dots,
.menu-fab:focus-visible .menu-dots,
.menu-fab:active .menu-dots,
.menu-fab[aria-expanded='true'] .menu-dots {
  transform: rotate(90deg);
}

/* Desktop + mouse: header chip owns «меню». Phones keep the FAB even in landscape. */
@media (min-width: 768px) and (pointer: fine) {
  .menu-fab {
    display: none;
  }

  .case-mobile-back {
    display: none;
  }
}

@media (max-width: 767.98px), (pointer: coarse) {
  .header-desk-menu {
    display: none !important;
  }
}

.menu-fab-word {
  display: block;
  overflow: hidden;
  flex: 0 0 auto;
  min-width: 0;
}

@media (max-width: 767.98px), (pointer: coarse) {
  .menu-fab-word {
    width: max-content;
  }
}

.menu-fab-word__clip {
  display: block;
  width: max-content;
}

.site-nav {
  /* Fixel's ink sits slightly high inside its line box. Keep one shared
     optical correction instead of asymmetric padding per control. */
  --header-text-optical-y: 1px;

  /* Between nav and lead — lead was too large for the chip row */
  font-size: calc((var(--type-nav) + var(--type-lead)) * 0.5);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.nav-link {
  position: relative;
  z-index: 0;
  display: inline-flex;
  align-items: baseline;
  cursor: pointer;
  text-decoration: none;
  gap: 0;
  padding: 8px 18px;
  margin: -8px -4px;
  border-radius: 9999px;
  background: transparent;
}

.nav-link__label {
  position: relative;
  z-index: 1;
  transform: translateY(var(--header-text-optical-y));
}

.nav-link__comma {
  position: relative;
  z-index: 1;
  margin-left: 0.02em;
  transform: translateY(var(--header-text-optical-y));
}

@media not all {
  .menu-fab,
  .menu-fab-word,
  .menu-dots {
    transition: none;
  }

  .menu-btn:hover .menu-dots,
  .menu-btn:focus-visible .menu-dots,
  .menu-btn:active .menu-dots {
    transform: none;
  }
}
</style>
