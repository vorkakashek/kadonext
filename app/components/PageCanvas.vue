<script setup lang="ts">
import { canvasFrames, matchFramePath, type SiteNavFrame } from '~/utils/siteNav'
import { isNarrowViewport, isThumbNav } from '~/utils/mobileViewport'
import { preloadHomeSceneAssets } from '~/utils/preloadHomeMotion'
import {
  applyIrisClip,
  clearIrisClip,
  irisCoverFrom,
  irisGeomFromBox,
  viewportIrisBox,
  IRIS_CLOSE_EASE,
  IRIS_CLOSE_S,
  IRIS_OPEN_EASE,
  IRIS_OPEN_S,
  type IrisGeom,
} from '~/utils/irisClip'
import { CHIP_FIT_EASE, CHIP_FIT_S } from '~/utils/chipFit'
import { setChipBgOrigin } from '~/utils/chipHoverBg'

const { t } = useI18n()

const {
  open,
  busy,
  surfaceOn,
  navHopActive,
  heroGlRevealBusy,
  skipHeroIntro,
  waitForHeroSwarm,
  requestHeroGlPrewarm,
  resolveHeroGlPrewarm,
  closeCanvas,
  toggleCanvas,
  restoreFabLabel,
  fabLabelOn,
  irisLive,
  pageIrisLive,
  pageIrisHomeReveal,
} = usePageCanvas()
const route = useRoute()
const router = useRouter()

const rootEl = ref<HTMLElement | null>(null)
const maskEl = ref<HTMLElement | null>(null)
const navEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const deskEl = ref<HTMLElement | null>(null)

let lastFocus: HTMLElement | null = null
let savedScrollY = 0
let navFromCanvas = false

const shownCurrentId = ref(matchFramePath(route.fullPath))
const reducedMotion = ref(false)
const isNarrow = ref(false)
const isThumb = ref(false)
if (import.meta.client) {
  isNarrow.value = isNarrowViewport()
  isThumb.value = isThumbNav()
}

const NAV_DRAW_S = 0.44
const NAV_FLAT_S = 0.224
const NAV_LEAVE_AMP_S = 0.144
const NAV_LEAVE_WIPE_S = 0.24
const NAV_LEAVE_WIPE_DELAY = 0.048
const NAV_WAVE_AMP = 3.4
const NAV_WAVE_VB_W = 64
const LINK_ENTER_S = 0.48
const LINK_INDEX_ENTER_S = 0.34
const LINK_INDEX_LEAD_S = 0.1
const LINK_STAGGER = 0.07
const PLAQUE_ENTER_DELAY_S = 0.18

/** Hovered / focused link — drives the right-hand preview. */
const hoverId = ref<string | null>(null)
let hoverClearTimer = 0

const previewId = computed(() => hoverId.value ?? shownCurrentId.value)

const previewFrame = computed(
  () => canvasFrames.find((f) => f.id === previewId.value) ?? null,
)

/** Shots that have appeared stay parked under the next enter (no fade-out). */
const revealedPreviewIds = ref<Record<string, true>>({})

function markPreviewRevealed(id: string | null) {
  if (!id || revealedPreviewIds.value[id]) return
  revealedPreviewIds.value = { ...revealedPreviewIds.value, [id]: true }
}

function clearPreviewRevealed() {
  revealedPreviewIds.value = {}
}

function previewShotShown(id: string) {
  return !!revealedPreviewIds.value[id]
}

watch(previewId, (id) => markPreviewRevealed(id))

let gsapMod: typeof import('gsap').default | null = null
let motionGen = 0
let mailWaveTl: { kill: () => void } | null = null
let mailWaveAmp = 0
let irisTween: { kill: () => void } | null = null
let irisResolve: (() => void) | null = null
let enterTl: { kill: () => void } | null = null
let wordTween: { kill: () => void } | null = null
let dotsTween: { kill: () => void } | null = null
function killIris() {
  irisTween?.kill()
  irisTween = null
  const resolve = irisResolve
  irisResolve = null
  resolve?.()
  const clipRoot = irisClipEl()
  if (clipRoot) clipRoot.style.willChange = ''
}

function killActiveMotion() {
  killIris()
  enterTl?.kill()
  enterTl = null
  wordTween?.kill()
  wordTween = null
  dotsTween?.kill()
  dotsTween = null
  const scroller = navScrollRoot()
  if (scroller && gsapMod) gsapMod.killTweensOf(scroller)
  const chip = menuChip()
  const btn = menuButtonEl()
  if (gsapMod && chip?.dots) gsapMod.killTweensOf(chip.dots)
  if (gsapMod && chip?.word) gsapMod.killTweensOf(chip.word)
  if (gsapMod && chip?.track) gsapMod.killTweensOf(chip.track)
  if (gsapMod && btn) gsapMod.killTweensOf(btn)
}

function onShotError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.opacity = '0'
}

async function gsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  return gsapMod
}

function menuButtonEl() {
  if (typeof window === 'undefined') return null
  if (isThumb.value) {
    return document.querySelector('.menu-fab') as HTMLElement | null
  }
  return document.querySelector('.menu-btn--float') as HTMLElement | null
}

function menuChip() {
  const btn = menuButtonEl()
  if (!btn) return null
  return {
    word: btn.querySelector('.menu-chip-word') as HTMLElement | null,
    track: btn.querySelector('.menu-chip-track') as HTMLElement | null,
    dots: btn.querySelector('.menu-dots') as HTMLElement | null,
    sizerMenu: btn.querySelector('.menu-sizer-menu') as HTMLElement | null,
    sizerBack: btn.querySelector('.menu-sizer-back') as HTMLElement | null,
  }
}

function irisFallback(container: { width: number; height: number }) {
  return {
    w: 96,
    h: 40,
    cx: container.width - 56,
    cy: isThumb.value ? container.height - 56 : 36,
  }
}

function irisButtonGeom(): IrisGeom {
  const root = rootEl.value
  const canvas = root?.getBoundingClientRect()
  const laidOut = !!canvas && canvas.width > 1 && canvas.height > 1
  const container = laidOut
    ? {
        left: canvas.left,
        top: canvas.top,
        width: canvas.width,
        height: canvas.height,
      }
    : viewportIrisBox()
  const el = menuButtonEl()
  return irisGeomFromBox(
    el?.getBoundingClientRect() ?? null,
    container,
    irisFallback(container),
  )
}

/** Chip rect at tap — viewport coords match the fullscreen canvas (`inset: 0`). */
function captureMenuPill(): IrisGeom {
  const view = viewportIrisBox()
  const el = menuButtonEl()
  return irisGeomFromBox(
    el?.getBoundingClientRect() ?? null,
    view,
    irisFallback(view),
  )
}

function irisClipEl() {
  return rootEl.value
}

/** GL / scroll guard for menu→home hop — no PageIris visual layer on top. */
function setPageIrisGuard(on: boolean) {
  pageIrisLive.value = on
  pageIrisHomeReveal.value = on
  document.documentElement.classList.toggle('page-iris-lock', on)
}

async function tweenIris(opts: {
  dir: 'open' | 'close'
  pill: IrisGeom
  followMenu?: boolean
}) {
  const clipRoot = irisClipEl()
  if (!clipRoot) return
  const g = gsapMod ?? (await gsap())
  killIris()
  const seed = opts.pill
  const cover = irisCoverFrom(seed).w
  const proxy = { t: opts.dir === 'open' ? 0 : 1 }

  const paint = () => {
    const origin = opts.dir === 'open' || !opts.followMenu ? seed : irisButtonGeom()
    const r0 = Math.min(origin.w, origin.h) / 2
    applyIrisClip(clipRoot, {
      ...origin,
      w: origin.w + (cover - origin.w) * proxy.t,
      h: origin.h + (cover - origin.h) * proxy.t,
      r: r0 + (cover / 2 - r0) * proxy.t,
    })
  }

  paint()
  clipRoot.style.willChange = 'clip-path'
  await new Promise<void>((resolve) => {
    irisResolve = resolve
    irisTween = g.to(proxy, {
      t: opts.dir === 'open' ? 1 : 0,
      duration: opts.dir === 'open' ? IRIS_OPEN_S : IRIS_CLOSE_S,
      ease: opts.dir === 'open' ? IRIS_OPEN_EASE : IRIS_CLOSE_EASE,
      overwrite: true,
      onUpdate: () => {
        paint()
        if (opts.followMenu) syncNavChrome()
      },
      onComplete: () => {
        irisTween = null
        clipRoot.style.willChange = ''
        const done = irisResolve
        irisResolve = null
        done?.()
      },
    })
  })
}

function showCanvasSurface() {
  document.documentElement.classList.add('page-canvas-surface')
  resetNavVisibility()
  const root = rootEl.value
  if (root) {
    root.style.display = ''
    root.style.opacity = ''
    root.style.visibility = ''
    root.style.pointerEvents = ''
  }
  surfaceOn.value = true
}

function hideCanvasSurface() {
  stopNavChromeTrack()
  restoreFabLabel()
  resetNavVisibility()
  const root = rootEl.value
  const clipRoot = irisClipEl()
  if (root) {
    // Hide before unclip — otherwise one frame of full overlay after the disc.
    root.style.display = 'none'
    if (clipRoot) clearIrisClip(clipRoot)
    resetEnterProps()
    clearBackSlot()
    root.classList.remove('page-canvas--surface', 'page-canvas--open', 'page-canvas--iris')
    root.style.opacity = ''
    root.style.visibility = ''
    root.style.pointerEvents = ''
  }
  surfaceOn.value = false
  setIrisLive(false)
  document.documentElement.classList.remove(
    'page-canvas-surface',
    'page-canvas-iris',
  )
}

function frameIsCurrent(frame: SiteNavFrame) {
  const routePath = route.fullPath.replace(/\/+$/, '') || '/'
  const framePath = frame.to.replace(/\/+$/, '') || '/'
  return routePath === framePath
}

function homeAnchorId(to: string) {
  const hashAt = to.indexOf('#')
  return hashAt < 0 ? '' : decodeURIComponent(to.slice(hashAt + 1))
}

async function scrollToHomeAnchor(to: string) {
  const id = homeAnchorId(to)
  if (!id) return
  await nextTick()
  await waitFrames(2)
  const target = document.getElementById(id)
  if (!target) return
  const top = window.scrollY + target.getBoundingClientRect().top
  window.scrollTo({ top, left: 0, behavior: 'auto' })
}

function frameShot(frame: SiteNavFrame) {
  return isThumb.value ? frame.previewM : frame.preview
}

function linkIsHot(frame: SiteNavFrame) {
  return previewId.value === frame.id
}

function setHoverFrame(frame: SiteNavFrame | null) {
  if (hoverClearTimer) {
    window.clearTimeout(hoverClearTimer)
    hoverClearTimer = 0
  }
  hoverId.value = frame?.id ?? null
}

function onLinkLeave(e: PointerEvent) {
  const next = e.relatedTarget
  if (next instanceof Element && next.closest('.pc-link-shell')) return
  scheduleHoverClear()
}

function onShellEnter(frame: SiteNavFrame, e: PointerEvent) {
  if (!open.value) return
  const shell = e.currentTarget
  if (!(shell instanceof HTMLElement)) return
  const host = shell.querySelector('.pc-link')
  if (host instanceof HTMLElement) {
    setChipBgOrigin(host, e)
    host.classList.add('is-chip-hover')
  }
  setHoverFrame(frame)
}

function onShellLeave(e: PointerEvent) {
  const shell = e.currentTarget
  if (shell instanceof HTMLElement) {
    const host = shell.querySelector('.pc-link')
    if (host instanceof HTMLElement) host.classList.remove('is-chip-hover')
  }
  const next = e.relatedTarget
  if (next instanceof Element && next.closest('.pc-link-shell')) return
  scheduleHoverClear()
}

function scheduleHoverClear() {
  if (hoverClearTimer) window.clearTimeout(hoverClearTimer)
  /* Bridge sub-pixel / null relatedTarget gaps between abutting shells. */
  hoverClearTimer = window.setTimeout(() => {
    hoverClearTimer = 0
    hoverId.value = null
  }, 48)
}

function onLinkFocus(frame: SiteNavFrame, e: FocusEvent) {
  if (!open.value) return
  const el = e.currentTarget
  if (el instanceof HTMLElement) {
    setChipBgOrigin(el, e)
    el.classList.add('is-chip-hover')
  }
  setHoverFrame(frame)
}

function onLinkFocusOut(e: FocusEvent) {
  const el = e.currentTarget
  if (el instanceof HTMLElement) el.classList.remove('is-chip-hover')
  const next = e.relatedTarget
  if (next instanceof Element && next.closest('.pc-link-shell')) return
  scheduleHoverClear()
}

function setIrisLive(on: boolean) {
  document.documentElement.classList.toggle('page-canvas-iris', on)
  rootEl.value?.classList.toggle('page-canvas--iris', on)
  irisLive.value = on
}

function clearBackSlot() {
  const root = rootEl.value
  if (!root) return
  root.style.removeProperty('--pc-inset-top')
  root.style.removeProperty('--pc-inset-right')
  root.style.removeProperty('--pc-inset-bottom')
  root.style.removeProperty('--pc-inset-left')
  root.style.removeProperty('--pc-close-h')
  root.style.removeProperty('--pc-lead-h')
}

function setNavInset(
  root: HTMLElement,
  name:
    | '--pc-inset-top'
    | '--pc-inset-right'
    | '--pc-inset-bottom'
    | '--pc-inset-left'
    | '--pc-close-h'
    | '--pc-lead-h',
  px: number,
) {
  root.style.setProperty(name, `${Math.max(0, Math.round(px))}px`)
}

function syncNavChrome() {
  const root = rootEl.value
  if (!root || typeof window === 'undefined') return

  const vw = window.innerWidth
  const vh = window.innerHeight
  const menu = menuButtonEl()
  const logo = document.querySelector('.header-logo-link') as HTMLElement | null

  if (menu) {
    const box = menu.getBoundingClientRect()
    const right = vw - box.right
    setNavInset(root, '--pc-inset-right', right)
    setNavInset(root, '--pc-close-h', box.height)
    if (isThumb.value) {
      setNavInset(root, '--pc-inset-bottom', vh - box.bottom)
      setNavInset(root, '--pc-inset-left', right)
    } else {
      setNavInset(root, '--pc-inset-top', box.top)
    }
  }

  if (logo) {
    const box = logo.getBoundingClientRect()
    if (isThumb.value) setNavInset(root, '--pc-inset-top', box.top)
    else setNavInset(root, '--pc-inset-left', box.left)
  } else if (menu && !isThumb.value) {
    setNavInset(root, '--pc-inset-left', menu.getBoundingClientRect().left)
  }

  if (isThumb.value) {
    const lead = root.querySelector('.page-canvas__chrome-lead') as HTMLElement | null
    if (lead) setNavInset(root, '--pc-lead-h', lead.getBoundingClientRect().height)
  }
}

function syncFrameAspect() {
  const root = rootEl.value
  if (!root || typeof window === 'undefined') return
  const vw = Math.max(1, window.innerWidth)
  const vh = Math.max(1, window.innerHeight)
  root.style.setProperty('--pc-aspect', String(vw / vh))
  if (surfaceOn.value) syncNavChrome()
}

let navChromeRaf = 0
function startNavChromeTrack() {
  stopNavChromeTrack()
  const step = () => {
    syncNavChrome()
    navChromeRaf = requestAnimationFrame(step)
  }
  navChromeRaf = requestAnimationFrame(step)
}
function stopNavChromeTrack() {
  if (!navChromeRaf) return
  cancelAnimationFrame(navChromeRaf)
  navChromeRaf = 0
}

function lockScroll(lock: boolean, restoreY = savedScrollY) {
  const html = document.documentElement
  const body = document.body
  if (lock) {
    html.classList.add('page-canvas-lock')
    return
  }
  html.classList.remove('page-canvas-lock')
  // Legacy: older sessions may still have body fixed from a prior build.
  if (body.style.position === 'fixed') {
    body.style.position = ''
    body.style.top = ''
    body.style.left = ''
    body.style.right = ''
    body.style.width = ''
    window.scrollTo(0, restoreY)
    return
  }
  if (Math.abs(window.scrollY - restoreY) > 2) {
    window.scrollTo(0, restoreY)
  }
}

function frameButton(id: string) {
  return rootEl.value?.querySelector(
    `.pc-link-shell[data-frame-id="${id}"]`,
  ) as HTMLElement | null
}

function navScrollRoot() {
  return stageEl.value
}

function frameScrollTargets(frameId: string) {
  const frame = frameButton(frameId)
  const scroller = navScrollRoot()
  if (!frame || !scroller) return null

  const frameRect = frame.getBoundingClientRect()
  const box = scroller.getBoundingClientRect()
  const delta =
    frameRect.top + frameRect.height / 2 - (box.top + box.height / 2)
  return {
    scroller,
    left: scroller.scrollLeft,
    top: Math.max(0, scroller.scrollTop + delta),
  }
}

async function ensureFrameCentered(
  frameId: string,
  behavior: ScrollBehavior,
  gen?: number,
) {
  const targets = frameScrollTargets(frameId)
  if (!targets) return
  const { scroller, left, top } = targets
  const dx = Math.abs(left - scroller.scrollLeft)
  const dy = Math.abs(top - scroller.scrollTop)
  const minDelta = Math.max(10, scroller.clientHeight * 0.03)
  if (dx < minDelta && dy < minDelta) return

  const smooth = behavior === 'smooth' && !reducedMotion.value
  if (!smooth) {
    scroller.scrollLeft = left
    scroller.scrollTop = top
    await nextTick()
    return
  }

  const dist = Math.hypot(dx, dy)
  const durMs = Math.min(850, Math.max(420, dist * 0.55))
  const startLeft = scroller.scrollLeft
  const startTop = scroller.scrollTop
  const t0 = performance.now()

  await new Promise<void>((resolve) => {
    let raf = 0
    const step = (now: number) => {
      if (gen != null && gen !== motionGen) {
        cancelAnimationFrame(raf)
        resolve()
        return
      }
      const u = Math.min(1, (now - t0) / durMs)
      const e = u * u * (3 - 2 * u)
      scroller.scrollLeft = startLeft + (left - startLeft) * e
      scroller.scrollTop = startTop + (top - startTop) * e
      if (u < 1) raf = requestAnimationFrame(step)
      else resolve()
    }
    raf = requestAnimationFrame(step)
  })
}

function plaqueLinks() {
  return rootEl.value?.querySelectorAll('.pc-link-shell') ?? []
}

function plaqueEnterParts() {
  const root = rootEl.value
  const shells = Array.from(plaqueLinks()) as HTMLElement[]
  const bottomUp = [...shells].reverse()
  const indices = bottomUp
    .map(shell => shell.querySelector<HTMLElement>('.pc-link__index'))
    .filter((el): el is HTMLElement => !!el)
  const labels = bottomUp
    .map(shell => shell.querySelector<HTMLElement>('.pc-link__label'))
    .filter((el): el is HTMLElement => !!el)
  const chrome = root
    ? Array.from(root.querySelectorAll<HTMLElement>(
        '.page-canvas__eyebrow, .page-canvas__mail, .page-canvas__lang',
      ))
    : []
  const preview = root?.querySelector<HTMLElement>('.pc-preview') ?? null
  const activeBg = root?.querySelector<HTMLElement>(
    '.pc-link-shell--current .chip-scale-bg',
  ) ?? null
  return { shells, bottomUp, indices, labels, chrome, preview, activeBg }
}

function resetEnterProps() {
  if (!gsapMod) return
  const { shells, indices, labels, chrome, preview, activeBg } = plaqueEnterParts()
  const moving = [...shells, ...indices, ...labels, ...chrome]
  if (preview) moving.push(preview)
  if (moving.length) gsapMod.set(moving, { clearProps: 'opacity,visibility,transform' })
  if (activeBg) gsapMod.set(activeBg, { clearProps: 'opacity,visibility' })
}

function measureCloseWord(to: 'menu' | 'back') {
  const chip = menuChip()
  const el = to === 'menu' ? chip?.sizerMenu : chip?.sizerBack
  return Math.ceil(el?.scrollWidth ?? 0)
}

function swapCloseWord(to: 'menu' | 'back', instant = false) {
  const chip = menuChip()
  const track = chip?.track
  const box = chip?.word
  const btn = menuButtonEl()
  const fab = btn?.classList.contains('menu-fab') ? btn : null
  if (!gsapMod) return
  wordTween?.kill()
  wordTween = null
  const snap = instant || reducedMotion.value
  const yPercent = to === 'menu' ? 0 : -50
  const w = measureCloseWord(to)
  const fabPad = 24
  if (snap) {
    if (track) gsapMod.set(track, { yPercent })
    if (box && w) gsapMod.set(box, { width: w })
    if (fab) gsapMod.set(fab, { paddingLeft: fabPad, paddingRight: fabPad, gap: 8 })
    return
  }
  const expanding = to === 'back'
  const ease = expanding ? 'power3.out' : CHIP_FIT_EASE
  const tl = gsapMod.timeline({
    onComplete: () => {
      wordTween = null
    },
  })
  wordTween = tl
  if (box && w) {
    tl.to(
      box,
      { width: w, duration: CHIP_FIT_S, ease, overwrite: true },
      0,
    )
  }
  if (track) {
    tl.to(
      track,
      {
        yPercent,
        duration: CHIP_FIT_S * (expanding ? 0.62 : 0.72),
        ease: expanding ? 'power3.out' : CHIP_FIT_EASE,
        overwrite: true,
      },
      0,
    )
  }
  if (fab) {
    tl.to(
      fab,
      {
        paddingLeft: fabPad,
        paddingRight: fabPad,
        gap: 8,
        duration: CHIP_FIT_S,
        ease,
        overwrite: true,
      },
      0,
    )
  }
}

function spinCloseDots(up: boolean, instant = false) {
  const el = menuChip()?.dots
  if (!el || !gsapMod) return
  dotsTween?.kill()
  dotsTween = null
  const rotation = up ? 90 : 0
  if (instant || reducedMotion.value) {
    gsapMod.set(el, { rotation })
    return
  }
  dotsTween = gsapMod.to(el, {
    rotation,
    duration: CHIP_FIT_S,
    ease: up ? 'power3.out' : CHIP_FIT_EASE,
    overwrite: true,
    onComplete: () => {
      dotsTween = null
    },
  })
}

function resetNavVisibility() {
  const nav = navEl.value
  if (nav && gsapMod) gsapMod.set(nav, { clearProps: 'opacity,visibility' })
}

async function playPlaqueEnter() {
  const g = await gsap()
  const { shells, bottomUp, indices, labels, chrome, preview, activeBg }
    = plaqueEnterParts()
  enterTl?.kill()
  if (!shells.length) return
  g.set(shells, { autoAlpha: 1, y: 0 })
  g.set([...indices, ...labels], { autoAlpha: 0, yPercent: 120 })
  if (chrome.length) g.set(chrome, { autoAlpha: 0, y: 14 })
  if (preview) g.set(preview, { autoAlpha: 0, y: 18, scale: 0.985 })
  if (activeBg) g.set(activeBg, { autoAlpha: 0 })
  if (reducedMotion.value) {
    resetEnterProps()
    return
  }
  const tl = g.timeline({
    delay: PLAQUE_ENTER_DELAY_S,
    onComplete: () => {
      resetEnterProps()
      enterTl = null
    },
  })
  enterTl = tl
  let activeBgAt = 0.72
  bottomUp.forEach((shell, index) => {
    const at = 0.12 + index * LINK_STAGGER
    const number = shell.querySelector<HTMLElement>('.pc-link__index')
    const label = shell.querySelector<HTMLElement>('.pc-link__label')
    if (number) {
      tl.to(number, {
        autoAlpha: 1,
        yPercent: 0,
        duration: LINK_INDEX_ENTER_S,
        ease: 'power3.out',
      }, at)
    }
    if (label) {
      tl.to(label, {
        autoAlpha: 1,
        yPercent: 0,
        duration: LINK_ENTER_S,
        ease: 'power3.out',
      }, at + LINK_INDEX_LEAD_S)
    }
    if (shell.classList.contains('pc-link-shell--current')) {
      activeBgAt = at
    }
  })
  if (chrome.length) {
    tl.to(chrome, {
      autoAlpha: 1,
      y: 0,
      duration: 0.46,
      stagger: 0.06,
      ease: 'power3.out',
    }, 0.28)
  }
  if (preview) {
    tl.to(preview, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.58,
      ease: 'power3.out',
    }, 0.34)
  }
  if (activeBg) {
    tl.to(activeBg, {
      autoAlpha: 1,
      duration: 0.36,
      ease: 'power2.out',
    }, activeBgAt)
  }
}

function mailWavePath(amp: number) {
  const a = Math.max(0, amp)
  return `M1 4 Q 12 ${4 - a} 23 4 Q 34 ${4 + a} 45 4 Q 54 ${4 - a * 0.65} 63 4`
}

function mailWaveParts() {
  const root = rootEl.value
  if (!root) return null
  const path = root.querySelector('.page-canvas__mail-wave-path') as SVGPathElement | null
  const reveal = root.querySelector('.page-canvas__mail-reveal') as SVGRectElement | null
  if (!path || !reveal) return null
  return { path, reveal }
}

async function onMailEnter() {
  const parts = mailWaveParts()
  if (!parts) return
  const { path, reveal } = parts
  if (reducedMotion.value) {
    mailWaveAmp = 0
    path.setAttribute('d', mailWavePath(0))
    reveal.setAttribute('x', '0')
    reveal.setAttribute('width', String(NAV_WAVE_VB_W))
    return
  }
  const g = await gsap()
  mailWaveTl?.kill()
  const morph = { amp: NAV_WAVE_AMP }
  mailWaveAmp = NAV_WAVE_AMP
  path.setAttribute('d', mailWavePath(NAV_WAVE_AMP))
  g.set(reveal, { attr: { x: 0, width: 0 } })
  const tl = g.timeline()
  mailWaveTl = tl
  tl.to(reveal, {
    attr: { width: NAV_WAVE_VB_W },
    duration: NAV_DRAW_S,
    ease: 'none',
  })
  tl.to(morph, {
    amp: 0,
    duration: NAV_FLAT_S,
    ease: 'power2.out',
    onUpdate: () => {
      mailWaveAmp = morph.amp
      path.setAttribute('d', mailWavePath(morph.amp))
    },
  })
}

async function onMailLeave() {
  const parts = mailWaveParts()
  if (!parts) return
  const { path, reveal } = parts
  const g = await gsap()
  mailWaveTl?.kill()
  const fromAmp = mailWaveAmp
  const morph = { amp: fromAmp }
  const ampNeed = Math.max(0, NAV_WAVE_AMP - fromAmp) / NAV_WAVE_AMP
  const ampDur = NAV_LEAVE_AMP_S * ampNeed
  const wipeAt = ampDur > 0 ? NAV_LEAVE_WIPE_DELAY : 0
  const tl = g.timeline()
  mailWaveTl = tl
  if (ampDur > 0) {
    tl.to(
      morph,
      {
        amp: NAV_WAVE_AMP,
        duration: ampDur,
        ease: 'power1.out',
        onUpdate: () => {
          mailWaveAmp = morph.amp
          path.setAttribute('d', mailWavePath(morph.amp))
        },
      },
      0,
    )
  } else {
    mailWaveAmp = NAV_WAVE_AMP
    path.setAttribute('d', mailWavePath(NAV_WAVE_AMP))
  }
  tl.to(
    reveal,
    {
      attr: { x: NAV_WAVE_VB_W, width: 0 },
      duration: NAV_LEAVE_WIPE_S,
      ease: 'power1.in',
      onComplete: () => {
        mailWaveAmp = 0
        path.setAttribute('d', mailWavePath(0))
      },
    },
    wipeAt,
  )
}

async function waitForRoutePaint() {
  await nextTick()
  await waitFrames(2)
}

/** Home hero shell (stone lid) before iris exposes the GL stack. */
async function waitForHomeHeroShell(maxMs = 2400) {
  await nextTick()
  await waitFrames(2)
  const deadline = performance.now() + maxMs
  while (performance.now() < deadline) {
    if (document.querySelector('.hero-swarm-cover')) {
      await waitFrames(2)
      return
    }
    await waitFrames(1)
  }
}

/** Let a hidden WebGL canvas present at least one real frame before the iris hole shows it. */
function waitFrames(n: number) {
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

function pinPageScroll() {
  if (document.documentElement.classList.contains('page-canvas-lock')) return
  savedScrollY = window.scrollY
  lockScroll(true)
}

/** Full iris cover immediately — hides the overlay before route / gsap work hits the main thread. */
async function snapIrisCover() {
  setIrisLive(true)
  syncNavChrome()
  const start = irisButtonGeom()
  const cover = irisCoverFrom(start)
  const clipRoot = irisClipEl()
  if (clipRoot) applyIrisClip(clipRoot, cover)
  return { start, cover }
}

async function unlockSession(
  opts: { restoreScroll?: boolean } = {},
) {
  const restoreY = opts.restoreScroll === false ? 0 : savedScrollY
  if (opts.restoreScroll === false) savedScrollY = 0
  if (document.documentElement.classList.contains('page-canvas-lock')) {
    lockScroll(false, restoreY)
  } else {
    const body = document.body
    if (body.style.position === 'fixed') {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.width = ''
      window.scrollTo(0, restoreY)
    }
  }
  restoreFabLabel()
}

function isOpenRun(gen: number) {
  return gen === motionGen && open.value
}

function isCloseRun(gen: number) {
  return gen === motionGen && !open.value
}

function isHomeRoute() {
  const p = route.path
  return p === '/' || p === ''
}

function finishMenuCloseQuiet() {
  setPageIrisGuard(false)
  heroGlRevealBusy.value = false
  busy.value = false
}

async function playOpen() {
  const root = rootEl.value
  const gen = ++motionGen
  killActiveMotion()
  busy.value = true
  fabLabelOn.value = true
  const tapPill = captureMenuPill()

  try {
    if (!gsapMod) await gsap()
    const g = gsapMod
    if (!g || !isOpenRun(gen)) return

    const dotsReady = !isThumb.value && !!menuButtonEl()?.matches(':hover')
    if (reducedMotion.value) {
      swapCloseWord('back', true)
      spinCloseDots(true, true)
    } else {
      swapCloseWord('back')
      if (dotsReady) spinCloseDots(true, true)
      else spinCloseDots(true)
    }

    showCanvasSurface()
    pinPageScroll()
    if (!isOpenRun(gen)) return
    setIrisLive(true)
    void root?.offsetWidth
    startNavChromeTrack()
    syncNavChrome()
    if (root) {
      g.set(root, { clearProps: 'opacity,visibility,pointerEvents' })
    }
    const clipRoot = irisClipEl()
    if (clipRoot) {
      applyIrisClip(clipRoot, reducedMotion.value ? irisCoverFrom(tapPill) : tapPill)
    }

    void ensureFrameCentered(shownCurrentId.value, 'instant', gen)

    if (reducedMotion.value) {
      syncNavChrome()
      if (clipRoot) clearIrisClip(clipRoot)
      setIrisLive(false)
      await playPlaqueEnter()
      return
    }

    void playPlaqueEnter()
    await tweenIris({ dir: 'open', pill: tapPill })
    if (!isOpenRun(gen)) return
    syncNavChrome()
    const clipRootDone = irisClipEl()
    if (clipRootDone) clearIrisClip(clipRootDone)
    setIrisLive(false)
  } catch (err) {
    console.warn('[PageCanvas] playOpen failed', err)
    showCanvasSurface()
    const clipRootErr = irisClipEl()
    if (clipRootErr) clearIrisClip(clipRootErr)
    setIrisLive(false)
    resetEnterProps()
    swapCloseWord('back', true)
    spinCloseDots(true, true)
  } finally {
    stopNavChromeTrack()
    if (isOpenRun(gen)) busy.value = false
  }
}

async function playClose() {
  const gen = ++motionGen
  killActiveMotion()
  busy.value = true
  showCanvasSurface()
  const homeClose = isHomeRoute()
  if (homeClose) heroGlRevealBusy.value = true

  try {
    if (reducedMotion.value) {
      swapCloseWord('menu', true)
      spinCloseDots(false, true)
      await unlockSession()
      hideCanvasSurface()
      if (!homeClose) finishMenuCloseQuiet()
      return
    }

    if (!gsapMod) await gsap()
    if (!isCloseRun(gen)) return
    const pill = captureMenuPill()
    swapCloseWord('menu')
    spinCloseDots(false)
    await snapIrisCover()
    if (!isCloseRun(gen)) return

    if (homeClose) await waitFrames(2)
    if (!isCloseRun(gen)) return

    await tweenIris({ dir: 'close', pill, followMenu: true })
    if (!isCloseRun(gen)) return
    hideCanvasSurface()
    await unlockSession()
  } catch (err) {
    console.warn('[PageCanvas] playClose failed', err)
    hideCanvasSurface()
    await unlockSession()
    finishMenuCloseQuiet()
  } finally {
    if (isCloseRun(gen)) {
      heroGlRevealBusy.value = false
      busy.value = false
    }
  }
}

async function goToFrame(frame: SiteNavFrame) {
  if (!open.value) return

  if (frameIsCurrent(frame)) {
    closeCanvas()
    return
  }

  const gen = ++motionGen
  busy.value = true

  try {
    navFromCanvas = true
    navHopActive.value = true

    if (reducedMotion.value) {
      if (frame.id === 'home') skipHeroIntro.value = true
      await unlockSession({ restoreScroll: false })
      hideCanvasSurface()
      open.value = false
      await router.push(frame.to)
      await waitForRoutePaint()
      return
    }

    if (frame.to === '/' || frame.to.startsWith('/#')) {
      skipHeroIntro.value = true
      heroGlRevealBusy.value = true
      preloadHomeSceneAssets()
      setPageIrisGuard(true)
      const { start } = await snapIrisCover()
      if (gen !== motionGen) return
      open.value = false

      await router.push(frame.to)
      await waitForHomeHeroShell()
      if (gen !== motionGen) return
      await waitForHeroSwarm()
      if (gen !== motionGen) return
      await requestHeroGlPrewarm()
      if (gen !== motionGen) return
      setPageIrisGuard(false)
      await waitFrames(isThumb.value ? 14 : 10)
      if (gen !== motionGen) return

      swapCloseWord('menu')
      spinCloseDots(false)
      const anchoredHome = !!homeAnchorId(frame.to)
      if (anchoredHome) {
        await unlockSession({ restoreScroll: false })
        await scrollToHomeAnchor(frame.to)
        if (gen !== motionGen) return
      }
      await tweenIris({ dir: 'close', pill: start, followMenu: true })
      if (gen !== motionGen) return
      hideCanvasSurface()
      if (!anchoredHome) await unlockSession({ restoreScroll: false })
      heroGlRevealBusy.value = false
    } else {
      open.value = false
      await gsap()
      if (gen !== motionGen) return
      swapCloseWord('menu')
      spinCloseDots(false)
      const { start } = await snapIrisCover()
      if (gen !== motionGen) return

      await router.push(frame.to)
      await waitForRoutePaint()
      if (gen !== motionGen) return

      await tweenIris({ dir: 'close', pill: start, followMenu: true })
      if (gen !== motionGen) return
      hideCanvasSurface()
      await unlockSession({ restoreScroll: false })
    }
    if (gen !== motionGen) return
    lastFocus?.focus({ preventScroll: true })
    lastFocus = null
  } catch (err) {
    console.warn('[PageCanvas] hop failed', err)
    finishMenuCloseQuiet()
    hideCanvasSurface()
    await unlockSession({ restoreScroll: false })
  } finally {
    navFromCanvas = false
    navHopActive.value = false
    setPageIrisGuard(false)
    heroGlRevealBusy.value = false
    resolveHeroGlPrewarm()
    if (gen === motionGen) busy.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (busy.value) return
  e.preventDefault()
  e.stopPropagation()
  toggleCanvas()
}

watch(open, async (isOpen, wasOpen) => {
  if (isOpen) {
    shownCurrentId.value = matchFramePath(route.fullPath)
    hoverId.value = null
    clearPreviewRevealed()
    markPreviewRevealed(shownCurrentId.value)
    if (hoverClearTimer) {
      window.clearTimeout(hoverClearTimer)
      hoverClearTimer = 0
    }
    const ae = document.activeElement
    lastFocus = ae instanceof HTMLElement ? ae : null
    await playOpen()
    if (open.value) menuButtonEl()?.focus({ preventScroll: true })
  } else if (wasOpen) {
    if (navFromCanvas || navHopActive.value) return
    hoverId.value = null
    clearPreviewRevealed()
    if (hoverClearTimer) {
      window.clearTimeout(hoverClearTimer)
      hoverClearTimer = 0
    }
    await playClose()
    if (!open.value) {
      hideCanvasSurface()
      lastFocus?.focus({ preventScroll: true })
      lastFocus = null
    }
  }
}, { flush: 'sync' })

watch(
  () => route.fullPath,
  () => {
    if (open.value && !navFromCanvas && !navHopActive.value) closeCanvas()
  },
)

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const syncChromeMode = () => {
    isNarrow.value = isNarrowViewport()
    isThumb.value = isThumbNav()
  }
  syncChromeMode()
  window.addEventListener('resize', syncChromeMode, { passive: true })
  syncFrameAspect()
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', syncFrameAspect, { passive: true })
  void gsap()

  onUnmounted(() => {
    window.removeEventListener('resize', syncChromeMode)
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', syncFrameAspect)
  hideCanvasSurface()
  mailWaveTl?.kill()
  killIris()
  stopNavChromeTrack()
  if (document.documentElement.classList.contains('page-canvas-lock')) {
    lockScroll(false)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="rootEl"
      class="page-canvas"
      :class="{
        'page-canvas--open': open,
        'page-canvas--surface': surfaceOn,
        'page-canvas--thumb': isThumb,
      }"
      :inert="!open"
      role="dialog"
      aria-modal="true"
      :aria-label="t('navigation.canvasLabel')"
    >
      <div ref="maskEl" class="page-canvas__mask">
        <div class="page-canvas__veil" @click="closeCanvas" />
      </div>

      <div ref="navEl" class="page-canvas__nav">
      <div class="page-canvas__chrome">
        <div class="page-canvas__chrome-top">
          <div class="page-canvas__chrome-lead">
            <p class="page-canvas__eyebrow">KADO · workspace</p>
            <a
              class="page-canvas__mail"
              href="mailto:hello@kadonext.com"
              :tabindex="open ? 0 : -1"
              @pointerenter="onMailEnter"
              @pointerleave="onMailLeave"
              @focusin="onMailEnter"
              @focusout="onMailLeave"
            >
              <span class="page-canvas__mail-text">
                <span>hello@kadonext.com</span>
                <svg
                  class="page-canvas__mail-wave"
                  viewBox="0 0 64 8"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <clipPath id="pc-mail-wave-clip" clipPathUnits="userSpaceOnUse">
                      <rect
                        class="page-canvas__mail-reveal"
                        x="0"
                        y="0"
                        width="0"
                        height="8"
                      />
                    </clipPath>
                  </defs>
                  <path
                    class="page-canvas__mail-wave-path"
                    clip-path="url(#pc-mail-wave-clip)"
                    d="M1 4 Q 12 0.8 23 4 Q 34 7.2 45 4 Q 54 1.8 63 4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.35"
                    stroke-linecap="butt"
                  />
                </svg>
              </span>
            </a>
          </div>
        </div>
        <div class="page-canvas__chrome-foot">
          <button
            type="button"
            class="page-canvas__lang"
            :tabindex="open ? 0 : -1"
            aria-label="Switch language"
          >
            en
          </button>
        </div>
      </div>

      <div
        ref="stageEl"
        class="page-canvas__stage"
        data-pc-scroller
        data-lenis-prevent
      >
        <div ref="deskEl" class="page-canvas__desk">
          <nav
            class="pc-links"
            :aria-label="t('navigation.pagesLabel')"
            @pointerleave="onLinkLeave"
          >
            <div
              v-for="frame in canvasFrames"
              :key="frame.id"
              class="pc-link-shell"
              :class="{
                'pc-link-shell--current': frameIsCurrent(frame),
                'pc-link-shell--hot': linkIsHot(frame),
              }"
              :data-frame-id="frame.id"
              @pointerenter="onShellEnter(frame, $event)"
              @pointerleave="onShellLeave($event)"
            >
              <button
                type="button"
                class="pc-link chip-scale-host"
                :class="{
                  'is-chip-on pc-link--current': frameIsCurrent(frame),
                  'pc-link--hot': linkIsHot(frame),
                }"
                :tabindex="open ? 0 : -1"
                :aria-current="frameIsCurrent(frame) ? 'page' : undefined"
                @click="goToFrame(frame)"
                @focusin="onLinkFocus(frame, $event)"
                @focusout="onLinkFocusOut($event)"
              >
                <span class="chip-scale-bg" aria-hidden="true">
                  <span class="chip-scale-bg__fill" />
                </span>
                <span class="pc-link__index">{{ frame.index }}</span>
                <span class="pc-link__label">{{ t(frame.labelKey) }}</span>
              </button>
            </div>
          </nav>

          <div
            v-if="!isThumb"
            class="pc-preview"
            :class="{ 'pc-preview--on': !!previewFrame }"
            aria-hidden="true"
          >
            <div class="pc-preview__sheet">
              <template v-for="frame in canvasFrames" :key="frame.id">
                <img
                  v-if="previewShotShown(frame.id)"
                  class="pc-preview__shot"
                  :class="{
                    'is-visible': previewId === frame.id,
                    'is-shown': previewShotShown(frame.id),
                  }"
                  :src="frameShot(frame)"
                  alt=""
                  draggable="false"
                  @error="onShotError"
                >
              </template>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page-canvas {
  --pc-inset-top: var(--layout-header-inset);
  --pc-inset-right: var(--layout-margin);
  --pc-inset-bottom: calc(var(--layout-margin) + var(--safe-bottom));
  --pc-inset-left: var(--layout-margin);
  --pc-close-h: 2.5rem;
  --pc-lead-h: 2.5rem;
  position: fixed;
  inset: 0;
  z-index: 110;
  display: none;
  overflow: hidden;
  pointer-events: none;
  color: var(--palette-ink);
  background: transparent;
}

.page-canvas--surface {
  display: block;
  visibility: visible;
  opacity: 1;
  /* Stable containing block for fixed chrome + clip-path. Don't toggle
     on iris start/end — layer promotion fights the WebGL compositor. */
  transform: translateZ(0);
}

.page-canvas--open,
.page-canvas--surface.page-canvas--open {
  pointer-events: auto !important;
}

.page-canvas--surface:not(.page-canvas--open) {
  pointer-events: none;
}

.page-canvas__mask {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.page-canvas__nav {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.page-canvas__veil {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: color-mix(in srgb, var(--palette-sand) 78%, var(--palette-ash));
}

@media (max-width: 767.98px) {
  .page-canvas {
    --pc-inset-top: calc(var(--layout-margin) + var(--safe-top));
    --pc-inset-right: calc(2 * var(--layout-margin) + var(--safe-right));
    --pc-inset-bottom: calc(2 * var(--layout-margin) + var(--safe-bottom));
    --pc-inset-left: calc(2 * var(--layout-margin) + var(--safe-left));
  }
  .page-canvas__veil {
    pointer-events: none;
  }
  .page-canvas__chrome-top {
    padding: var(--pc-inset-top) var(--pc-inset-right) 0 var(--pc-inset-left);
    min-height: 0;
  }
}

.page-canvas__chrome {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.page-canvas__chrome-top,
.page-canvas__chrome-foot {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  pointer-events: none;
}

.page-canvas__chrome-top {
  top: 0;
  align-items: flex-start;
  padding: var(--pc-inset-top) var(--pc-inset-right) 0 var(--pc-inset-left);
  min-height: 0;
  box-sizing: border-box;
}

/* Desktop: eyebrow shares the close-chip vertical band (synced via --pc-close-h). */
.page-canvas:not(.page-canvas--thumb) .page-canvas__chrome-top {
  align-items: center;
  min-height: calc(var(--pc-inset-top) + var(--pc-close-h));
}

.page-canvas__chrome-lead {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.12rem;
  min-width: 0;
  pointer-events: none;
}

.page-canvas__chrome-foot {
  bottom: 0;
  justify-content: flex-end;
  padding: 0 var(--pc-inset-right) var(--pc-inset-bottom) var(--pc-inset-left);
}

.page-canvas__eyebrow {
  margin: 0;
  font-size: calc(var(--type-nav) * 0.8);
  letter-spacing: 0.04em;
  color: var(--palette-ash);
  pointer-events: none;
}

.page-canvas__mail,
.page-canvas__lang {
  pointer-events: auto;
  font: inherit;
  font-size: var(--type-nav);
  letter-spacing: 0.04em;
  color: var(--palette-ink);
  text-decoration: none;
  background: none;
  border: 0;
  cursor: pointer;
  appearance: none;
}

.page-canvas__mail {
  padding: 0;
  pointer-events: auto;
}

.page-canvas:not(.page-canvas--thumb) .page-canvas__mail {
  position: fixed;
  left: var(--pc-inset-left);
  bottom: var(--pc-inset-bottom);
  z-index: 3;
}

.page-canvas__mail-text {
  position: relative;
  display: inline-block;
  padding-bottom: 0.28em;
}

.page-canvas__mail-wave {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 0.48em;
  overflow: hidden;
  pointer-events: none;
  color: var(--palette-ink);
}

.page-canvas__mail-wave-path {
  fill: none;
}

.page-canvas__lang {
  padding: 0.55rem 1.1rem;
  border-radius: 9999px;
  background: transparent;
  transition: background 0.22s ease, backdrop-filter 0.22s ease;
}

.page-canvas__lang:hover,
.page-canvas__lang:focus-visible {
  background: color-mix(in srgb, var(--palette-sand) 70%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.page-canvas--thumb {
  --pc-inset-right: calc(2 * var(--layout-margin) + var(--safe-right, 0px));
  --pc-inset-bottom: calc(2 * var(--layout-margin) + var(--safe-bottom, 0px));
  --pc-inset-left: calc(2 * var(--layout-margin) + var(--safe-left, 0px));
}

.page-canvas--thumb .page-canvas__chrome-foot {
  justify-content: flex-start;
  align-items: flex-end;
  min-height: calc(var(--pc-inset-bottom) + var(--pc-close-h));
  padding-bottom: var(--pc-inset-bottom);
  box-sizing: border-box;
}

.page-canvas--thumb .page-canvas__lang {
  box-sizing: border-box;
  height: var(--pc-close-h);
  display: inline-flex;
  align-items: center;
  padding: 10px 1.1rem;
  font-size: calc((var(--type-nav) + var(--type-lead)) * 0.5);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.page-canvas--thumb .page-canvas__mail {
  font-size: calc((var(--type-nav) + var(--type-lead)) * 0.5);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.page-canvas--thumb .page-canvas__eyebrow {
  padding-bottom: 0;
}

.page-canvas--thumb .page-canvas__stage {
  padding-top: calc(var(--pc-inset-top) + var(--pc-lead-h) + 0.5rem);
  padding-bottom: calc(var(--pc-inset-bottom) + var(--pc-close-h) + 0.75rem);
  overflow-x: hidden;
  overflow-y: auto;
}

.page-canvas--thumb .page-canvas__desk {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.25rem;
  box-sizing: border-box;
  min-height: 100%;
  height: auto;
  width: 100%;
  max-width: none;
  margin-inline: 0;
  overflow: visible;
  padding-top: 0;
}

.page-canvas--thumb .pc-links {
  width: 100%;
}

.page-canvas--thumb .pc-link__label {
  font-size: calc(var(--type-lead) * 1.932);
}

.page-canvas__stage {
  position: absolute;
  inset: 0;
  z-index: 1;
  min-height: 0;
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-overflow-scrolling: touch;
  padding-top: calc(var(--pc-inset-top) + var(--pc-close-h));
  padding-right: var(--pc-inset-right);
  padding-bottom: calc(var(--pc-inset-bottom) + 2.5rem);
  padding-left: var(--pc-inset-left);
}

.page-canvas__stage::-webkit-scrollbar {
  display: none;
}

.page-canvas__desk {
  box-sizing: border-box;
  min-height: 100%;
  padding: 0;
  scrollbar-width: none;
}

.page-canvas__desk::-webkit-scrollbar {
  display: none;
}

@media (min-width: 768px) {
  .page-canvas__desk {
    display: grid;
    grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
    gap: clamp(1.5rem, 4vw, 3.5rem);
    align-items: center;
    width: 100%;
    max-width: var(--layout-span-10);
    margin-inline: auto;
    padding-inline: 0;
    padding-top: clamp(0.35rem, 1.5vh, 1.25rem);
    padding-bottom: 1.25rem;
  }
}

.pc-links {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  width: max-content;
  max-width: 100%;
  min-width: 0;
  justify-self: start;
}

/* Invisible hit pad = former list gap; hover fires here, chip stays visual-sized. */
.pc-link-shell {
  display: block;
  width: max-content;
  max-width: 100%;
  padding-block: 0.275rem;
  overflow: hidden;
  cursor: pointer;
}

@media (min-width: 768px) {
  .pc-link-shell {
    padding-block: 0.575rem;
  }
}

.pc-link {
  position: relative;
  z-index: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 0.75rem;
  width: max-content;
  max-width: 100%;
  margin: 0;
  padding: 8px 28px 8px 18px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  outline: none;
}

/* Canvas veil ≈ default chip fill — bump contrast so the scale-in reads. */
.pc-link :deep(.chip-scale-bg__fill) {
  background-color: color-mix(
    in srgb,
    var(--palette-ink) 9%,
    color-mix(in srgb, var(--palette-sand) 82%, var(--palette-ash))
  );
}

.pc-link--current :deep(.chip-scale-bg__fill) {
  background-color: var(--palette-ink);
}

.pc-link__index,
.pc-link__label {
  position: relative;
  z-index: 1;
}

.pc-link__index {
  flex: 0 0 auto;
  font-size: calc(var(--type-nav) * 0.72);
  letter-spacing: 0.08em;
  color: var(--palette-ash);
  line-height: 1;
  transform: translateY(-0.05em);
  transition: color 0.28s var(--motion-ease, ease);
}

.pc-link__label {
  font-size: clamp(1.85rem, 4vw, 3.35rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: color-mix(in srgb, var(--palette-ink) 42%, var(--palette-ash));
  transition: color 0.28s var(--motion-ease, ease);
}

@media (min-width: 768px) {
  .pc-link {
    padding: 10px 36px 10px 22px;
  }

  .pc-link__label {
    font-size: clamp(2.35rem, 4.6vw, 4rem);
  }
}

.pc-link--hot .pc-link__label,
.pc-link:focus-visible .pc-link__label {
  color: var(--palette-ink);
}

.pc-link--current .pc-link__label,
.pc-link--current .pc-link__index {
  color: var(--palette-milk);
}

@media (prefers-reduced-motion: reduce) {
  .pc-link__label,
  .pc-link__index {
    transition: none;
  }
}

.pc-preview {
  position: relative;
  width: 100%;
  min-width: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.32s var(--motion-ease, ease),
    visibility 0.32s var(--motion-ease, ease);
}

.pc-preview--on {
  opacity: 1;
  visibility: visible;
}

.pc-preview__sheet {
  position: relative;
  aspect-ratio: var(--pc-aspect, 16 / 9);
  border-radius: 4px;
  overflow: hidden;
  background: transparent;
}

.pc-preview__shot {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  pointer-events: none;
  opacity: 0;
  transform: scale(1);
  transform-origin: 50% 50%;
  filter: blur(0);
  z-index: 0;
}

/* Previous shot stays put underneath — no exit motion. */
.pc-preview__shot.is-shown:not(.is-visible) {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
  z-index: 0;
}

/* New shot: large scale + blur + opacity 0 → cover the parked one. */
.pc-preview__shot.is-visible {
  z-index: 1;
  animation: pc-shot-in 1s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes pc-shot-in {
  from {
    opacity: 0;
    transform: scale(1.14);
    filter: blur(14px);
  }
  to {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pc-preview,
  .pc-preview__shot {
    transition: none;
  }

  .pc-preview__shot.is-visible {
    animation: none;
    opacity: 1;
    transform: none;
    filter: none;
  }

  .pc-preview__shot.is-shown:not(.is-visible) {
    transform: none;
    filter: none;
  }
}

</style>
