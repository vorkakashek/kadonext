import { lerpBox, type SurfaceBox } from './flowSurfaceMorph.ts'

export type SurfaceRouteMode = 'follow' | 'coalesce'
export type SurfaceRouteDirection = 'forward' | 'reverse' | 'settled'

export type SurfaceRouteDecision = {
  mode: SurfaceRouteMode
  direction: SurfaceRouteDirection
  backlog: number
  skippedWaypoints: number
  maxVelocity: number
}

export type SurfaceRoutePolicy = {
  baseMaxVelocity: number
  catchUpMaxVelocity: number
  coalesceAfter: number
  fullCatchUpAt: number
}

export const DEFAULT_SURFACE_ROUTE_POLICY: SurfaceRoutePolicy = {
  baseMaxVelocity: 1.55,
  catchUpMaxVelocity: 3.1,
  coalesceAfter: 1.65,
  fullCatchUpAt: 3.25,
}

/**
 * Decide how aggressively the live Surface should catch the latest scroll goal.
 *
 * The first implementation keeps drawing the canonical corridor, but compresses
 * stale intermediate legs in time. `mode: coalesce` is also the shared signal
 * used by named navigation, whose snapshot handoff may omit obsolete waypoints.
 */
export function planSurfaceRoute(
  live: number,
  target: number,
  policy: Partial<SurfaceRoutePolicy> = {},
): SurfaceRouteDecision {
  const options = { ...DEFAULT_SURFACE_ROUTE_POLICY, ...policy }
  const safeLive = Number.isFinite(live) ? live : 0
  const safeTarget = Number.isFinite(target) ? target : safeLive
  const delta = safeTarget - safeLive
  const backlog = Math.abs(delta)
  const direction: SurfaceRouteDirection = Math.abs(delta) < 0.0008
    ? 'settled'
    : delta > 0 ? 'forward' : 'reverse'
  const mode: SurfaceRouteMode = backlog >= options.coalesceAfter
    ? 'coalesce'
    : 'follow'
  const skippedWaypoints = mode === 'coalesce'
    ? Math.max(0, Math.floor(backlog + 0.0008) - 1)
    : 0
  const catchUpSpan = Math.max(0.001, options.fullCatchUpAt - options.coalesceAfter)
  const pressure = mode === 'coalesce'
    ? Math.min(1, Math.max(0, (backlog - options.coalesceAfter) / catchUpSpan))
    : 0
  const maxVelocity = options.baseMaxVelocity
    + (options.catchUpMaxVelocity - options.baseMaxVelocity) * pressure

  return {
    mode,
    direction,
    backlog,
    skippedWaypoints,
    maxVelocity,
  }
}

/**
 * Every channel required to continue a Surface flight from the actually painted
 * frame. DOM ownership is deliberately excluded: it changes only after arrival.
 */
export type SurfaceVisualSnapshot = {
  box: SurfaceBox | null
  /** Viewport basis of the Hero scene rendered inside the moving crop. */
  stage: SurfaceBox | null
  morph: number
  horizontalMorph: number
  tone: string
  aboutOpacity: number
  contactProgress: number
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function mixNumber(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

function mixTone(from: string, to: string, progress: number) {
  if (progress <= 0) return from
  if (progress >= 1) return to
  return `color-mix(in srgb, ${from} ${(1 - progress) * 100}%, ${to} ${progress * 100}%)`
}

/** Pure interpolation used by scroll catch-up and named-navigation handoffs. */
export function mixSurfaceVisualSnapshot(
  from: SurfaceVisualSnapshot,
  to: SurfaceVisualSnapshot,
  progress: number,
): SurfaceVisualSnapshot {
  const t = clampUnit(progress)
  const box = from.box && to.box
    ? lerpBox(from.box, to.box, t)
    : (to.box ?? from.box)
  const stage = from.stage && to.stage
    ? lerpBox(from.stage, to.stage, t)
    : (to.stage ?? from.stage)

  return {
    box,
    stage,
    morph: mixNumber(from.morph, to.morph, t),
    horizontalMorph: mixNumber(from.horizontalMorph, to.horizontalMorph, t),
    tone: mixTone(from.tone, to.tone, t),
    aboutOpacity: mixNumber(from.aboutOpacity, to.aboutOpacity, t),
    contactProgress: mixNumber(from.contactProgress, to.contactProgress, t),
  }
}
