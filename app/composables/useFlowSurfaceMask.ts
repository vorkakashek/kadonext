import { reactive } from 'vue'
import type { MobileHeroCopyLayout } from '~/utils/mobileHeroCopyMotion'

/** One SVG clipPath for the whole surface window (stone + hero content). */
export const FLOW_SURFACE_CLIP_ID = 'flow-surface-clip'
export const FLOW_SURFACE_CLIP_CSS = `url(#${FLOW_SURFACE_CLIP_ID})`

/**
 * Living surface path + viewport box.
 * Hero visuals mount inside the clipped window — one clip, no dual masks.
 */
export const flowSurfaceMask = reactive({
  path: '',
  clipPath: '',
  openTopPath: '',
  width: 1,
  height: 1,
  top: 0,
  left: 0,
  /** 0 = hero frame, 1 = fully morphed away */
  morph: 0,
  /** Host-owned static layout: copy pacing and Surface crossing share one geometry. */
  heroCopyLayout: null as MobileHeroCopyLayout | null,
  /** Named stretch — see FLOW_SURFACE_LIVE. */
  liveId: 'hero' as 'hero' | 'transit' | 'kado',
  pointerInteractive: true,
  /** Perimeter roam wave — off; cursor dent stays via pointerInteractive. */
  roamActive: false,
  /**
   * When true, path rebuild skips roam/pointer (static silhouette).
   * Set while WebGL+copy are mounted — living clip under canvas kills FPS.
   */
  freezeSilhouette: false,
})

export type FlowSurfaceBox = {
  top: number
  left: number
  width: number
  height: number
}

let pathFlush: ((box?: FlowSurfaceBox) => void) | null = null
let clipPathEl: SVGPathElement | null = null
/**
 * Page Canvas paints the shell with `translateY(-scrollY)`. That transform makes
 * `position:fixed` FlowSurfaceHost use the paint as containing block, so viewport
 * tops must be shifted into paint/document space or the surface vanishes from the
 * scrolled miniature (hero still looks fine at scrollY=0).
 */
let paintScrollCompY = 0
let liveBoxNudge: ((deltaY: number) => void) | null = null

export function registerFlowSurfacePathFlush(fn: ((box?: FlowSurfaceBox) => void) | null) {
  pathFlush = fn
}

export function flushFlowSurfacePath(box?: FlowSurfaceBox) {
  pathFlush?.(box)
}

export function registerFlowSurfaceClipPathEl(el: SVGPathElement | null) {
  clipPathEl = el
  if (el && flowSurfaceMask.path) el.setAttribute('d', flowSurfaceMask.path)
}

export function publishFlowSurfacePath(d: string) {
  flowSurfaceMask.path = d
  flowSurfaceMask.clipPath = d ? FLOW_SURFACE_CLIP_CSS : ''
  if (clipPathEl) {
    if (d) clipPathEl.setAttribute('d', d)
    else clipPathEl.removeAttribute('d')
  }
}

export function registerFlowSurfaceLiveBoxNudge(
  fn: ((deltaY: number) => void) | null,
) {
  liveBoxNudge = fn
}

/**
 * Keep the surface aligned with page content while Page Canvas offsets paint by
 * `-scrollY`. Pass `0` when clearing the paint transform (menu close).
 */
export function syncFlowSurfacePaintScrollComp(scrollY: number) {
  const y = Math.max(0, scrollY)
  const delta = y - paintScrollCompY
  if (delta === 0) return

  if (!import.meta.client) {
    paintScrollCompY = y
    flowSurfaceMask.top += delta
    liveBoxNudge?.(delta)
    return
  }

  const frame = document.querySelector(
    '[data-flow-surface-frame]',
  ) as HTMLElement | null
  const host = document.querySelector('[data-flow-surface-host]')
  // Only the viewport-fixed host needs compensation. Mobile pin already lives in
  // document flow and rides the paint translate correctly.
  if (frame && host?.contains(frame)) {
    const top = parseFloat(frame.style.top || '') || flowSurfaceMask.top
    frame.style.top = `${top + delta}px`
    flowSurfaceMask.top += delta
    liveBoxNudge?.(delta)
  }
  // Always record intent so sync(0) on close clears state even if we were pinned.
  paintScrollCompY = y
}

/** Clear session leftovers before a fresh home mount (SPA return). */
export function resetFlowSurfaceMaskSession() {
  paintScrollCompY = 0
  flowSurfaceMask.morph = 0
  flowSurfaceMask.heroCopyLayout = null
  flowSurfaceMask.liveId = 'hero'
  flowSurfaceMask.freezeSilhouette = false
  flowSurfaceMask.pointerInteractive = true
  flowSurfaceMask.roamActive = false
  flowSurfaceMask.path = ''
  flowSurfaceMask.clipPath = ''
  flowSurfaceMask.openTopPath = ''
  flowSurfaceMask.width = 1
  flowSurfaceMask.height = 1
  flowSurfaceMask.top = 0
  flowSurfaceMask.left = 0
}

export function useFlowSurfaceMask() {
  return flowSurfaceMask
}
