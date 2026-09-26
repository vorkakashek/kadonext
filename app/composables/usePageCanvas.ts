/**
 * Page Canvas / workspace menu — shared open state.
 */
import type { IrisGeom } from '~/utils/irisClip'

let heroGlPrewarmResolvers: Array<() => void> = []
let menuHomeRevealResolvers: Array<() => void> = []
let menuHomeSnapResolvers: Array<() => void> = []

export type MenuHomeIrisReveal = {
  id: number
  geom: IrisGeom
  onFrame?: (geom: IrisGeom) => void
  handoff?: () => void
}

export type MenuHomeIrisSnap = {
  id: number
  geom: IrisGeom
}

export function usePageCanvas() {
  /** The lazy overlay has mounted and can consume a menu click immediately. */
  const ready = useState('page-canvas-ready', () => false)
  const open = useState('page-canvas-open', () => false)
  /** True while a motion run is in flight — block reopen until close/hop ends. */
  const busy = useState('page-canvas-busy', () => false)
  /**
   * Canvas layer is painted for the menu session (including the iris clip).
   * Live page hides after the iris finishes; header stays under the overlay.
   */
  const surfaceOn = useState('page-canvas-surface', () => false)
  /** Menu tile hop — route swap + iris reveal (not plain close). */
  const navHopActive = useState('page-canvas-nav-hop', () => false)
  /**
   * Bumped before menu iris reveal onto home — HomeHeroStage renders GL under
   * the stone lid while the overlay still covers the page.
   */
  const heroGlPrewarm = useState('hero-gl-prewarm', () => 0)
  /** Menu hop iris + post-reveal hold — defer Kado fill / layout work until false. */
  const heroGlRevealBusy = useState('hero-gl-reveal-busy', () => false)
  /**
   * Thumb FAB word «меню». Scroll-down hides it; open/close always restores it.
   * Compact (dots-only) is never the rest state after a menu session.
   */
  const fabLabelOn = useState('fab-menu-label', () => true)
  /**
   * Next home mount should skip the hero entrance (SPA hop, including Page Canvas).
   * Direct / refresh visits still play the intro.
   */
  const skipHeroIntro = useState('skip-hero-intro', () => false)
  /** Home swarm has IBL + a looping frame — safe to reveal after an in-app hop. */
  const heroSwarmReady = useState('hero-swarm-ready', () => false)
  /** Menu / hop iris is exposing the live page (close shrink, not open grow). */
  const irisLive = useState('page-canvas-iris-live', () => false)
  /** SPA page hop overlay — iris reveal onto home. */
  const pageIrisLive = useState('page-iris-live', () => false)
  /** The active page iris will reveal Home and must protect its WebGL buffer. */
  const pageIrisHomeReveal = useState('page-iris-home-reveal', () => false)
  /** Menu → home hop: PageIris iris-out onto the menu chip after swarm prewarm. */
  const menuHomeIrisReveal = useState<MenuHomeIrisReveal | null>(
    'menu-home-iris-reveal',
    () => null,
  )
  /** Menu → home hop: snap PageIris to full cover (no logo-style iris-in). */
  const menuHomeIrisSnap = useState<MenuHomeIrisSnap | null>(
    'menu-home-iris-snap',
    () => null,
  )

  /** Block line-fill rebuild while the menu overlay owns scroll (no layout reflow). */
  function canvasMotionPaused() {
    return (
      typeof document !== 'undefined'
      && document.documentElement.classList.contains('page-canvas-lock')
    )
  }

  /** Menu button idle — false for the full open/close/hop + hero GL settle pipeline. */
  function menuIdle() {
    return !busy.value
  }

  function openCanvas() {
    if (!menuIdle()) return
    busy.value = true
    open.value = true
  }

  function closeCanvas() {
    if (!menuIdle() || !open.value) return
    busy.value = true
    open.value = false
  }

  function toggleCanvas() {
    if (!menuIdle()) return
    busy.value = true
    open.value = !open.value
  }

  function restoreFabLabel() {
    fabLabelOn.value = true
  }

  let fabFit:
    | ((on: boolean, instant?: boolean) => Promise<void>)
    | null = null

  function registerFabFit(
    fn: ((on: boolean, instant?: boolean) => Promise<void>) | null,
  ) {
    fabFit = fn
  }

  /** Expand the thumb chip to «меню». Waits until the width tween finishes. */
  async function revealFabLabel() {
    const already = fabLabelOn.value
    fabLabelOn.value = true
    if (fabFit) await fabFit(true, already)
  }

  async function waitForHeroSwarm(maxMs = 1800) {
    const deadline = performance.now() + maxMs
    while (!heroSwarmReady.value && performance.now() < deadline) {
      await new Promise<void>((r) => {
        requestAnimationFrame(() => r())
      })
    }
    await new Promise<void>((r) => {
      requestAnimationFrame(() => r())
    })
    await new Promise<void>((r) => {
      requestAnimationFrame(() => r())
    })
  }

  /**
   * Ask HomeHeroStage to paint under the lid. Always time out — if the hero
   * never mounts / never answers, menu→home must not hang forever (busy lock).
   */
  function requestHeroGlPrewarm(maxMs = 900) {
    return new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      heroGlPrewarmResolvers.push(finish)
      heroGlPrewarm.value += 1
      if (import.meta.client) {
        window.setTimeout(() => {
          resolveHeroGlPrewarm()
        }, maxMs)
      }
    })
  }

  function resolveHeroGlPrewarm() {
    const pending = heroGlPrewarmResolvers.splice(0)
    for (const resolve of pending) resolve()
  }

  function requestMenuHomeIrisReveal(
    geom: IrisGeom,
    opts: { onFrame?: (geom: IrisGeom) => void; handoff?: () => void } = {},
  ) {
    return new Promise<void>((resolve) => {
      menuHomeRevealResolvers.push(resolve)
      menuHomeIrisReveal.value = {
        id: (menuHomeIrisReveal.value?.id ?? 0) + 1,
        geom,
        onFrame: opts.onFrame,
        handoff: opts.handoff,
      }
    })
  }

  function resolveMenuHomeIrisReveal() {
    menuHomeIrisReveal.value = null
    const pending = menuHomeRevealResolvers.splice(0)
    for (const resolve of pending) resolve()
  }

  function requestMenuHomeIrisSnap(geom: IrisGeom) {
    return new Promise<void>((resolve) => {
      menuHomeSnapResolvers.push(resolve)
      menuHomeIrisSnap.value = {
        id: (menuHomeIrisSnap.value?.id ?? 0) + 1,
        geom,
      }
    })
  }

  function resolveMenuHomeIrisSnap() {
    menuHomeIrisSnap.value = null
    const pending = menuHomeSnapResolvers.splice(0)
    for (const resolve of pending) resolve()
  }

  return {
    ready,
    open,
    busy,
    surfaceOn,
    navHopActive,
    heroGlPrewarm,
    heroGlRevealBusy,
    skipHeroIntro,
    heroSwarmReady,
    irisLive,
    pageIrisLive,
    pageIrisHomeReveal,
    menuHomeIrisReveal,
    menuHomeIrisSnap,
    canvasMotionPaused,
    fabLabelOn,
    menuIdle,
    waitForHeroSwarm,
    requestHeroGlPrewarm,
    resolveHeroGlPrewarm,
    requestMenuHomeIrisReveal,
    resolveMenuHomeIrisReveal,
    requestMenuHomeIrisSnap,
    resolveMenuHomeIrisSnap,
    revealFabLabel,
    restoreFabLabel,
    registerFabFit,
    openCanvas,
    closeCanvas,
    toggleCanvas,
  }
}
