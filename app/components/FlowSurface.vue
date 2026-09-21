<script setup lang="ts">
import {
  FLOW_SURFACE_CLIP_CSS,
  flowSurfaceMask,
  publishFlowSurfacePath,
} from '~/composables/useFlowSurfaceMask'
import { isAppleTouchDevice, isCoarsePointer, isNarrowViewport } from '~/utils/mobileViewport'

/**
 * Mobile: surface fill + grain stay on; organic clip-path stays off.
 * Soft silhouette was the phone FPS killer — rect crop via overflow:hidden instead.
 */
const MOBILE_NO_ORGANIC_CLIP = true

/**
 * Flow Surface — rounded-rect panel + clip mask (desktop).
 * Rest silhouette is geometrically straight faces + corner radii (no barrel bow).
 * A wide signed wave packet travels the perimeter (crest + trough).
 * Near corners the packet/hover fattens the fillet instead of only muting the edge.
 * Auto-wave and pointer dent are gated by FLOW_SURFACE_LIVE segments
 * (hero only by default; transit + kado stay a rest silhouette).
 * Amplitude eases in/out so the living edge does not pop on segment changes.
 *
 * Desktop silhouette = shared SVG <clipPath> (url(#flow-surface-clip)).
 * Mobile (no organic clip) = layout box + overflow hidden (same pose, no path mask).
 * Hero visuals mount in the default slot (inside this shell).
 */
const props = withDefaults(
  defineProps<{
    mode?: 'window' | 'panel'
    toneClass?: string
    toneColor?: string
    toneOpacity?: number
    paintFill?: boolean
    active?: boolean
  }>(),
  {
    mode: 'panel',
    toneClass: 'bg-stone',
    toneColor: '',
    toneOpacity: 1,
    paintFill: true,
    active: true,
  },
)

const root = ref<HTMLElement | null>(null)
const clipEl = ref<HTMLElement | null>(null)
const pathD = ref('')
const size = reactive({ w: 1, h: 1 })
/** Large seamless grain tile (no SVG feTurbulence; that tanks WebKit FPS). */
const GRAIN_TILE = 'var(--home-surface-grain)'
/** Smaller tile = finer flecks. */
const grainTilePx = ref(224)
const grainEl = ref<HTMLElement | null>(null)
const GRAIN_OPACITY = 0.2
/** Discrete tile offset rate — hard jumps, not eased drift. */
const GRAIN_STEP_MS = 120

function applyClipToDom(clip: string) {
  const el = clipEl.value
  if (!el) return
  if (!clip) {
    el.style.clipPath = ''
    el.style.removeProperty('-webkit-clip-path')
    return
  }
  el.style.clipPath = clip
  el.style.setProperty('-webkit-clip-path', clip)
}

function setMaskPath(d: string) {
  if (skipOrganicClip()) {
    pathD.value = ''
    publishFlowSurfacePath('')
    applyClipToDom('')
    return
  }
  if (d) pathD.value = d
  publishFlowSurfacePath(d)
  applyClipToDom(flowSurfaceMask.clipPath || (d ? FLOW_SURFACE_CLIP_CSS : ''))
}

/** viewBox basis — frozen during mobile morph so the path stretches with the box. */
const pathView = reactive({ w: 1, h: 1 })

/** Touch / narrow UI — no living edge response (pointer dent + roam). */
function isTouchUi() {
  // isCoarsePointer() already yields to (pointer: fine) on hybrid touch laptops.
  return isAppleTouchDevice() || isNarrowViewport() || isCoarsePointer()
}

function skipOrganicClip() {
  return MOBILE_NO_ORGANIC_CLIP && isTouchUi()
}

let ro: ResizeObserver | null = null
let raf = 0
let grainTimer = 0
let motionQuery: MediaQueryList | null = null
let pointer: { x: number; y: number } | null = null
let pendingPointer: { clientX: number; clientY: number } | null = null
let keepAliveActive = true
/** side: -1 inside (concave), +1 outside (convex) */
let softPointer: { x: number; y: number; str: number; side: number } = {
  x: 0,
  y: 0,
  str: 0,
  side: 0,
}

/** Keep path geometry aligned with --flow-surface-radius in main.css. */
const RADIUS = 24
/**
 * Dense edge samples so a wide signed wave stays a smooth curve, not facets.
 */
const EDGE_SAMPLE_PX = 3
const EDGE_SAMPLES_MIN = 16
const EDGE_SAMPLES_MAX = 480
/** Cursor bend depth (px) at full-size surface */
const POINTER_DENT = 22
/** Influence radius — how far from the edge the hover bend reaches */
const POINTER_RADIUS = 620
/** Gaussian sigma as fraction of radius (higher = flatter/wider hill) */
const POINTER_SIGMA = 0.58
/** Soft blend band (px) across the silhouette for inside↔outside hover sign */
const POINTER_SIDE_BAND = 40
/** Roam wave amplitude (matches max hover depth) */
const ROAM_DENT = POINTER_DENT
/** Revolutions per second */
const ROAM_SPEED = 0.1125
/**
 * Envelope σ along the perimeter — wide so it reads as a wave, not a bump.
 * Oscillation wavelength is derived from σ (crest + trough in one packet).
 */
const ROAM_SIGMA_FRAC = 0.125
const ROAM_SIGMA_PX_MIN = 140
const ROAM_SIGMA_PX_MAX = 300
/** Wavelength as multiple of σ — ~one full crest/trough inside the envelope */
const ROAM_WAVE_LEN_K = 2.55
/**
 * Extra corner radius (px) when roam/hover is on a fillet —
 * corners round harder instead of only muting the edge wave.
 */
const CORNER_RADIUS_BOOST = 32
/** Cap live corner radius as a fraction of the shorter side */
const CORNER_RADIUS_MAX_FRAC = 0.1
/** Long soft run-up to immutable corners — short fade makes a crease */
const CORNER_FADE_PX = 180
/**
 * Min side length at which bend amplitudes are 1×.
 * Smaller surfaces scale dents down so corners stay clean.
 */
const BEND_REF_MIN = 520
const BEND_SCALE_FLOOR = 0.25
/** Living bend eases off toward corners over this fraction of the edge. */
const DENT_CORNER_FADE_MIN_U = 0.36
/** How many samples at each end blend hard toward the rest anchors */
const END_BLEND_SAMPLES = 18
/**
 * Hover: pull living edge samples toward fillet corners, and shorten the
 * corner fade so bend lives 15% closer to those anchors.
 */
const HOVER_CORNER_PULL = 0.15
/**
 * Paint/clip overscan (px). Outward crest goes outside the layout box;
 * without this the host/fill clip kills all выпуклость (only dents stay visible).
 * Keep ≥ stacked roam+hover dent.
 */
const EDGE_OVERSCAN = 56
type Pt = { x: number; y: number }
type EdgeName = 'top' | 'right' | 'bottom' | 'left'
type BendAmp = {
  scale: number
  pointerDent: number
  roamDent: number
  roamSigmaFrac: number
  cornerFadePx: number
  pointerRadius: number
}

let animStart = 0
/** Continuous roam phase in revolutions [0,1) — advanced with clamped dt (no wall-clock jumps). */
let roamPhase = 0
/** False until we park the packet mid-edge (phase 0 sits on the TL wrap → fat TL). */
let roamPhaseSeeded = false
let roamLastNow = 0
/** Cap frame dt so background tab / hitch can't teleport the wave. */
const ROAM_DT_MAX = 1 / 28
/** Seconds to grow / settle the living edge when a site stretch arms or disarms it. */
const LIVE_FADE_IN_S = 0.62
const LIVE_FADE_OUT_S = 0.52
/** 0..1 visual mix — eases toward FLOW_SURFACE_LIVE instead of snapping dents. */
let liveMix = 0
/** Smoothed live corner radii — raw targets jitter sample topology. */
const smoothCornerR = { tl: 0, tr: 0, br: 0, bl: 0, primed: false }
/** Quantized path size — host lag floats were flipping edge sample counts. */
const pathSize = { w: 0, h: 0 }

function liveEdgeHardOff() {
  return isTouchUi() || !!motionQuery?.matches || flowSurfaceMask.freezeSilhouette
}

function liveEdgeArmed() {
  return flowSurfaceMask.roamActive || flowSurfaceMask.pointerInteractive
}

function bendAmpFor(w: number, h: number): BendAmp {
  const scale = Math.min(1, Math.max(BEND_SCALE_FLOOR, Math.min(w, h) / BEND_REF_MIN))
  const touch = isTouchUi()
  const mix = touch ? 0 : smootherstep(liveMix)
  const roamOn = mix > 0 && flowSurfaceMask.roamActive
  const pointerOn = mix > 0 && flowSurfaceMask.pointerInteractive
  return {
    scale,
    pointerDent: pointerOn ? POINTER_DENT * scale * mix : 0,
    roamDent: roamOn ? ROAM_DENT * scale * mix : 0,
    roamSigmaFrac: ROAM_SIGMA_FRAC * Math.max(0.75, scale),
    cornerFadePx: Math.max(CORNER_FADE_PX * 0.9, CORNER_FADE_PX * scale),
    pointerRadius: POINTER_RADIUS * Math.max(0.35, scale),
  }
}

/** Sample count proportional to edge length (constant px density). */
function sampleCount(lengthPx: number) {
  const morphing =
    !flowSurfaceMask.pointerInteractive
    && flowSurfaceMask.morph > 0.01
    && flowSurfaceMask.morph < 0.99
  // Coarser silhouette while the box is scrubbing — fewer Catmull segments.
  const spacing = morphing ? EDGE_SAMPLE_PX * 2.2 : EDGE_SAMPLE_PX
  const n = Math.round(lengthPx / spacing)
  return Math.min(EDGE_SAMPLES_MAX, Math.max(EDGE_SAMPLES_MIN, n))
}

/**
 * Axis-constrained Hermite through edge samples.
 * Tangents stay horizontal (top/bottom) or vertical (left/right) so the curve
 * cannot Catmull-overshoot into the classic corner “fork” spikes.
 */
function smoothAxisEdge(pts: Pt[], axis: 'h' | 'v'): string {
  if (pts.length < 2) return ''
  const parts: string[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    if (axis === 'h') {
      const dx = (p2.x - p1.x) / 3
      parts.push(`C ${p1.x + dx} ${p1.y} ${p2.x - dx} ${p2.y} ${p2.x} ${p2.y}`)
    } else {
      const dy = (p2.y - p1.y) / 3
      parts.push(`C ${p1.x} ${p1.y + dy} ${p2.x} ${p2.y - dy} ${p2.x} ${p2.y}`)
    }
  }
  return parts.join(' ')
}

function smootherstep(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/**
 * Gradual taper of inward dent toward each corner.
 * Avoids a hard crest “shelf” when the roaming bump rides into a fillet.
 */
function dentCornerPinAt(u: number, spanPx: number, fadePx: number) {
  const fadeU = Math.min(
    0.48,
    Math.max(DENT_CORNER_FADE_MIN_U, (fadePx * 1.2) / Math.max(spanPx, 1)),
  )
  const endDist = Math.min(u, 1 - u)
  if (endDist >= fadeU) return 1
  if (endDist <= 0 || fadeU <= 0) return 0
  return smootherstep(endDist / fadeU)
}

/** Signed shortest circular delta from `b` → `a` in (−0.5, 0.5]. */
function circSigned01(a: number, b: number) {
  let d = (a - b) % 1
  if (d > 0.5) d -= 1
  if (d <= -0.5) d += 1
  return d
}

/**
 * Signed distance to the surface box: >0 outside, <0 inside.
 */
function boxSignedOutside(x: number, y: number, w: number, h: number) {
  const dx = x < 0 ? -x : x > w ? x - w : 0
  const dy = y < 0 ? -y : y > h ? y - h : 0
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy)
  return -Math.min(x, w - x, y, h - y)
}

/**
 * Cursor bend — outward-positive.
 * Inside the surface → negative (впуклость); outside → positive (выпуклость).
 */
function pointerOutward(x: number, y: number, amp: BendAmp) {
  if (softPointer.str < 0.01 || Math.abs(softPointer.side) < 0.02) return 0
  const dx = x - softPointer.x
  const dy = y - softPointer.y
  const dist = Math.hypot(dx, dy)
  const sigma = amp.pointerRadius * POINTER_SIGMA
  const lobe = Math.exp(-(dist * dist) / (2 * sigma * sigma))
  return lobe * softPointer.str * amp.pointerDent * softPointer.side
}

/**
 * Traveling Gabor packet along the perimeter (outward-positive).
 * `phase` is revolutions in [0,1) — advanced externally with clamped dt.
 */
function roamPacket(s: number, phase: number, perimeterPx: number, amp: BendAmp) {
  const sigmaPx = Math.min(
    ROAM_SIGMA_PX_MAX,
    Math.max(ROAM_SIGMA_PX_MIN, perimeterPx * amp.roamSigmaFrac),
  )
  const lambda = Math.max(sigmaPx * 1.6, sigmaPx * ROAM_WAVE_LEN_K)
  const center = ((phase % 1) + 1) % 1
  const dPx = circSigned01(s, center) * Math.max(perimeterPx, 1)
  // Continuous gaussian — no hard env cutoff (that popped the wave shoulders).
  const env = Math.exp(-(dPx * dPx) / (2 * sigmaPx * sigmaPx))
  const osc = Math.cos((2 * Math.PI * dPx) / lambda)
  const shaped = osc >= 0 ? osc : osc * 0.85
  return { env, wave: env * shaped * amp.roamDent }
}

function roamWave(s: number, phase: number, perimeterPx: number, amp: BendAmp) {
  return roamPacket(s, phase, perimeterPx, amp).wave
}

function roamEnvelope(s: number, phase: number, perimeterPx: number, amp: BendAmp) {
  return roamPacket(s, phase, perimeterPx, amp).env
}

function pointerStrengthAt(x: number, y: number, amp: BendAmp) {
  if (softPointer.str < 0.01) return 0
  const dx = x - softPointer.x
  const dy = y - softPointer.y
  const dist = Math.hypot(dx, dy)
  const sigma = amp.pointerRadius * POINTER_SIGMA
  return softPointer.str * Math.exp(-(dist * dist) / (2 * sigma * sigma))
}

/** 0..1 — roam packet or hover sitting on a corner fillet. */
function cornerLiveAmount(
  sCorner: number,
  cx: number,
  cy: number,
  t: number,
  perimeterPx: number,
  amp: BendAmp,
) {
  if (amp.roamDent <= 0 && amp.pointerDent <= 0) return 0
  // Envelope must not run when roam is off — phase 0 sits on the TL wrap and
  // was fattening that fillet whenever pointer dent alone was armed.
  const roam =
    amp.roamDent > 0 ? roamEnvelope(sCorner, t, perimeterPx, amp) : 0
  const hover =
    amp.pointerDent > 0 ? pointerStrengthAt(cx, cy, amp) : 0
  return Math.min(1, Math.max(roam, hover))
}

function liveCornerRadius(baseR: number, amount: number, w: number, h: number, amp: BendAmp) {
  const boost = CORNER_RADIUS_BOOST * amount * Math.max(0.55, amp.scale)
  const maxR = Math.min(w, h) * CORNER_RADIUS_MAX_FRAC
  return Math.min(maxR, baseR + boost)
}

function smoothToward(current: number, target: number, primed: boolean) {
  if (!primed) return target
  return current + (target - current) * 0.14
}

function edgeSpans(w: number, h: number, r: number, topBleed: number) {
  const y0span = Math.max(1, h + topBleed - 2 * r)
  const xSpan = Math.max(1, w - 2 * r)
  const corner = (Math.PI / 2) * r
  const total = 2 * xSpan + 2 * y0span + 4 * corner
  return {
    top: xSpan,
    right: y0span,
    bottom: xSpan,
    left: y0span,
    corner,
    total,
    // cumulative start s for each edge (0..1)
    sTop: 0,
    sRight: (xSpan + corner) / total,
    sBottom: (xSpan + corner + y0span + corner) / total,
    sLeft: (2 * xSpan + 2 * corner + y0span) / total,
  }
}

/**
 * Sample a straight rest edge, then apply roaming wave + signed cursor bend.
 * r0 / r1 — live radii at the start / end fillets (may differ per corner).
 */
function sampleConvexEdge(
  edge: EdgeName,
  w: number,
  h: number,
  r0: number,
  r1: number,
  rCount: number,
  topBleed: number,
  t: number,
  amp: BendAmp,
  perimeterPx: number,
  s0: number,
): { live: Pt[]; rest: Pt[] } {
  const y0 = -topBleed
  const usableH = h + topBleed
  const span
    = edge === 'top' || edge === 'bottom'
      ? Math.max(1, w - r0 - r1)
      : Math.max(1, usableH - r0 - r1)
  // Sample count from rest radius — live corner fattening must not retopologize the edge.
  const spanForCount
    = edge === 'top' || edge === 'bottom'
      ? Math.max(1, w - 2 * rCount)
      : Math.max(1, usableH - 2 * rCount)
  const n = sampleCount(spanForCount)
  const live: Pt[] = []
  const rest: Pt[] = []

  let anchorA: Pt
  let anchorB: Pt
  if (edge === 'top') {
    anchorA = { x: r0, y: y0 }
    anchorB = { x: w - r1, y: y0 }
  } else if (edge === 'right') {
    anchorA = { x: w, y: y0 + r0 }
    anchorB = { x: w, y: y0 + usableH - r1 }
  } else if (edge === 'bottom') {
    anchorA = { x: w - r0, y: h }
    anchorB = { x: r1, y: h }
  } else {
    anchorA = { x: 0, y: y0 + usableH - r0 }
    anchorB = { x: 0, y: y0 + r1 }
  }

  const hoverIn = softPointer.str * Math.max(0, -softPointer.side)
  const fadePx = amp.cornerFadePx * (1 - HOVER_CORNER_PULL * hoverIn)
  const cornerPull = HOVER_CORNER_PULL * hoverIn

  for (let i = 0; i <= n; i++) {
    const u = i / n
    const livePin = dentCornerPinAt(u, span, fadePx)
    // Phase along REST edge length — live corner fattening must not shift s (wave jumps).
    const s = s0 + (u * spanForCount) / Math.max(perimeterPx, 1)

    let x = 0
    let y = 0
    let nx = 0
    let ny = 0

    if (edge === 'top') {
      x = r0 + span * u
      y = y0
      nx = 0
      ny = 1
    } else if (edge === 'right') {
      x = w
      y = y0 + r0 + span * u
      nx = -1
      ny = 0
    } else if (edge === 'bottom') {
      x = w - r0 - span * u
      y = h
      nx = 0
      ny = -1
    } else {
      x = 0
      y = y0 + usableH - r0 - span * u
      nx = 1
      ny = 0
    }

    rest.push({ x, y })

    const outward
      = (roamWave(s, t, perimeterPx, amp) + pointerOutward(x, y, amp)) * livePin
    let px = x - nx * outward
    let py = y - ny * outward

    if (cornerPull > 0.001) {
      const corner = u < 0.5 ? anchorA : anchorB
      px += (corner.x - px) * cornerPull
      py += (corner.y - py) * cornerPull
    }

    live.push({ x: px, y: py })
  }
  return { live, rest }
}

/**
 * Blend live samples toward straight rest near fillets.
 * Always copy endpoints — sharing refs with corner anchors double-shifted them
 * under overscan and forked every fillet.
 */
function pinEdgeEnds(pts: Pt[], rest: Pt[], a: Pt, b: Pt) {
  const n = pts.length
  if (n < 3) {
    pts[0] = { x: a.x, y: a.y }
    pts[n - 1] = { x: b.x, y: b.y }
    return
  }
  const blend = Math.min(END_BLEND_SAMPLES, Math.floor((n - 1) / 2))
  pts[0] = { x: a.x, y: a.y }
  pts[n - 1] = { x: b.x, y: b.y }
  rest[0] = { x: a.x, y: a.y }
  rest[n - 1] = { x: b.x, y: b.y }
  for (let i = 1; i <= blend; i++) {
    const t = smootherstep(i / (blend + 1)) ** 2
    const from = pts[i]!
    const fromB = pts[n - 1 - i]!
    const restA = rest[i] ?? from
    const restB = rest[n - 1 - i] ?? fromB
    pts[i] = {
      x: restA.x + (from.x - restA.x) * t,
      y: restA.y + (from.y - restA.y) * t,
    }
    pts[n - 1 - i] = {
      x: restB.x + (fromB.x - restB.x) * t,
      y: restB.y + (fromB.y - restB.y) * t,
    }
  }
}

function buildPath(w: number, h: number, topBleed = 0, t = 0, live = true) {
  const amp = bendAmpFor(w, h)
  if (!live) {
    amp.roamDent = 0
    amp.pointerDent = 0
  }
  if (live && amp.roamDent > 0 && !roamPhaseSeeded) {
    seedRoamPhase(w, h)
    t = roamPhase
  }
  const o = EDGE_OVERSCAN
  const rBase = Math.min(RADIUS * Math.max(0.55, amp.scale), w / 2, h / 2)

  // Perimeter / phase uses the rest radius; live corners only fatten fillets.
  const spans = edgeSpans(w, h, rBase, 0)
  const cHalf = (spans.corner * 0.5) / spans.total
  const sTR = spans.sRight - cHalf
  const sBR = spans.sBottom - cHalf
  const sBL = spans.sLeft - cHalf
  const sTL = 1 - cHalf

  const rTL = smoothToward(
    smoothCornerR.tl,
    liveCornerRadius(rBase, cornerLiveAmount(sTL, 0, 0, t, spans.total, amp), w, h, amp),
    smoothCornerR.primed,
  )
  const rTR = smoothToward(
    smoothCornerR.tr,
    liveCornerRadius(rBase, cornerLiveAmount(sTR, w, 0, t, spans.total, amp), w, h, amp),
    smoothCornerR.primed,
  )
  const rBR = smoothToward(
    smoothCornerR.br,
    liveCornerRadius(rBase, cornerLiveAmount(sBR, w, h, t, spans.total, amp), w, h, amp),
    smoothCornerR.primed,
  )
  const rBL = smoothToward(
    smoothCornerR.bl,
    liveCornerRadius(rBase, cornerLiveAmount(sBL, 0, h, t, spans.total, amp), w, h, amp),
    smoothCornerR.primed,
  )
  smoothCornerR.tl = rTL
  smoothCornerR.tr = rTR
  smoothCornerR.br = rBR
  smoothCornerR.bl = rBL
  smoothCornerR.primed = true

  const topE = sampleConvexEdge('top', w, h, rTL, rTR, rBase, 0, t, amp, spans.total, spans.sTop)
  const rightE = sampleConvexEdge('right', w, h, rTR, rBR, rBase, 0, t, amp, spans.total, spans.sRight)
  const bottomE = sampleConvexEdge('bottom', w, h, rBR, rBL, rBase, 0, t, amp, spans.total, spans.sBottom)
  const leftE = sampleConvexEdge('left', w, h, rBL, rTL, rBase, 0, t, amp, spans.total, spans.sLeft)

  const top = topE.live
  const right = rightE.live
  const bottom = bottomE.live
  const left = leftE.live

  const topA = { x: rTL, y: 0 }
  const topB = { x: w - rTR, y: 0 }
  const rightA = { x: w, y: rTR }
  const rightB = { x: w, y: h - rBR }
  const bottomA = { x: w - rBR, y: h }
  const bottomB = { x: rBL, y: h }
  const leftA = { x: 0, y: h - rBL }
  const leftB = { x: 0, y: rTL }

  pinEdgeEnds(top, topE.rest, topA, topB)
  pinEdgeEnds(right, rightE.rest, rightA, rightB)
  pinEdgeEnds(bottom, bottomE.rest, bottomA, bottomB)
  pinEdgeEnds(left, leftE.rest, leftA, leftB)

  const shift = (p: Pt) => {
    p.x += o
    p.y += o
  }
  for (const pts of [top, right, bottom, left]) {
    for (const p of pts) shift(p)
  }
  // Keep fillet anchors identical to shifted edge ends (no second overscan).
  topA.x = top[0]!.x
  topA.y = top[0]!.y
  topB.x = top[top.length - 1]!.x
  topB.y = top[top.length - 1]!.y
  rightA.x = right[0]!.x
  rightA.y = right[0]!.y
  rightB.x = right[right.length - 1]!.x
  rightB.y = right[right.length - 1]!.y
  bottomA.x = bottom[0]!.x
  bottomA.y = bottom[0]!.y
  bottomB.x = bottom[bottom.length - 1]!.x
  bottomB.y = bottom[bottom.length - 1]!.y
  leftA.x = left[0]!.x
  leftA.y = left[0]!.y
  leftB.x = left[left.length - 1]!.x
  leftB.y = left[left.length - 1]!.y

  const k = 0.5522847498307936
  const krTR = k * rTR
  const krBR = k * rBR
  const krBL = k * rBL
  const krTL = k * rTL
  const tr = `C ${topB.x + krTR} ${topB.y} ${rightA.x} ${rightA.y - krTR} ${rightA.x} ${rightA.y}`
  const br = `C ${rightB.x} ${rightB.y + krBR} ${bottomA.x + krBR} ${bottomA.y} ${bottomA.x} ${bottomA.y}`
  const bl = `C ${bottomB.x - krBL} ${bottomB.y} ${leftA.x} ${leftA.y + krBL} ${leftA.x} ${leftA.y}`
  const tl = `C ${leftB.x} ${leftB.y - krTL} ${topA.x - krTL} ${topA.y} ${topA.x} ${topA.y}`

  const sides = [
    tr,
    smoothAxisEdge(right, 'v'),
    br,
    smoothAxisEdge(bottom, 'h'),
    bl,
    smoothAxisEdge(left, 'v'),
    tl,
  ].join(' ')

  if (topBleed <= 0.5) {
    return [
      `M ${topA.x} ${topA.y}`,
      smoothAxisEdge(top, 'h'),
      sides,
      'Z',
    ].join(' ')
  }

  const yBleed = o - topBleed
  return [
    `M ${topA.x} ${yBleed}`,
    `L ${topB.x} ${yBleed}`,
    `L ${topB.x} ${topB.y}`,
    sides,
    `L ${topA.x} ${yBleed}`,
    'Z',
  ].join(' ')
}

function publish(box?: { top: number; left: number; width: number; height: number }) {
  const el = root.value

  // Prefer host morph box (same numbers as applyBox). During morph the host owns
  // geometry — don't let a later rAF overwrite it with a lagged client rect.
  let w: number
  let h: number
  let top: number
  let left: number

  if (box) {
    w = Math.max(1, box.width)
    h = Math.max(1, box.height)
    top = box.top
    left = box.left
  } else if (flowSurfaceMask.width > 2) {
    w = flowSurfaceMask.width
    h = flowSurfaceMask.height
    top = flowSurfaceMask.top
    left = flowSurfaceMask.left
  } else if (el) {
    const rect = el.getBoundingClientRect()
    w = Math.max(1, rect.width)
    h = Math.max(1, rect.height)
    top = rect.top
    left = rect.left
  } else {
    return
  }

  if (w < 2 || h < 2) return

  // Hold path size steady through sub-pixel host lag — flipping w/h retopologizes edges.
  if (
    pathSize.w < 2
    || Math.abs(w - pathSize.w) >= 0.75
    || Math.abs(h - pathSize.h) >= 0.75
  ) {
    pathSize.w = w
    pathSize.h = h
  }
  const pathW = pathSize.w
  const pathH = pathSize.h

  size.w = w
  size.h = h
  pathView.w = pathW + EDGE_OVERSCAN * 2
  pathView.h = pathH + EDGE_OVERSCAN * 2

  if (skipOrganicClip()) {
    pathD.value = ''
    flowSurfaceMask.openTopPath = ''
    flowSurfaceMask.width = w
    flowSurfaceMask.height = h
    flowSurfaceMask.top = top
    flowSurfaceMask.left = left
    setMaskPath('')
    return
  }

  const allowLive = !isTouchUi()
  const fill = buildPath(pathW, pathH, 0, roamPhase, allowLive)
  pathD.value = fill
  flowSurfaceMask.openTopPath = ''
  flowSurfaceMask.width = w
  flowSurfaceMask.height = h
  flowSurfaceMask.top = top
  flowSurfaceMask.left = left
  setMaskPath(fill)
}

function edgeLiveNeeded() {
  if (!props.active || !keepAliveActive) return false
  if (liveEdgeHardOff()) return false
  if (flowSurfaceMask.roamActive) return true
  if (flowSurfaceMask.pointerInteractive) {
    return pendingPointer !== null || pointer !== null || softPointer.str > 0.001
  }
  return liveMix > 0.001 || softPointer.str > 0.001
}

function flattenLiveEdge() {
  pendingPointer = null
  pointer = null
  softPointer.str = 0
  softPointer.side = 0
  smoothCornerR.primed = false
  roamLastNow = 0
  liveMix = 0
  roamPhaseSeeded = false
  publish()
}

/** Park the auto-wave mid-top so rest corners stay equal (s=0 hugs the TL fillet). */
function seedRoamPhase(w: number, h: number) {
  const scale = Math.min(1, Math.max(BEND_SCALE_FLOOR, Math.min(w, h) / BEND_REF_MIN))
  const rBase = Math.min(RADIUS * Math.max(0.55, scale), w / 2, h / 2)
  const spans = edgeSpans(w, h, rBase, 0)
  roamPhase = (spans.top * 0.5) / Math.max(spans.total, 1)
  roamPhaseSeeded = true
}

function flushPointerInput() {
  const next = pendingPointer
  pendingPointer = null
  const el = root.value
  if (!next || !flowSurfaceMask.pointerInteractive || !el) return

  const rect = el.getBoundingClientRect()
  const x = next.clientX - rect.left
  const y = next.clientY - rect.top
  const pad = bendAmpFor(rect.width, rect.height).pointerRadius
  if (x < -pad || y < -pad || x > rect.width + pad || y > rect.height + pad) {
    pointer = null
    return
  }
  pointer = { x, y }
}

function tick(now: number) {
  raf = 0

  if (liveEdgeHardOff()) {
    flattenLiveEdge()
    return
  }

  flushPointerInput()

  if (!roamLastNow) roamLastNow = now
  let dt = (now - roamLastNow) / 1000
  roamLastNow = now
  if (dt > ROAM_DT_MAX) dt = ROAM_DT_MAX

  const target = liveEdgeArmed() ? 1 : 0
  if (dt > 0) {
    if (target > liveMix) liveMix = Math.min(1, liveMix + dt / LIVE_FADE_IN_S)
    else if (target < liveMix) liveMix = Math.max(0, liveMix - dt / LIVE_FADE_OUT_S)
  }

  if (liveMix <= 0.001 && target === 0) {
    flattenLiveEdge()
    return
  }

  if (dt > 0 && liveMix > 0 && flowSurfaceMask.roamActive) {
    roamPhase = (roamPhase + dt * ROAM_SPEED) % 1
  }

  if (flowSurfaceMask.pointerInteractive) {
    const targetStr = pointer ? 1 : 0
    softPointer.str += (targetStr - softPointer.str) * 0.16
    if (pointer) {
      softPointer.x += (pointer.x - softPointer.x) * 0.22
      softPointer.y += (pointer.y - softPointer.y) * 0.22
      const sd = boxSignedOutside(pointer.x, pointer.y, size.w, size.h)
      const targetSide = Math.max(-1, Math.min(1, sd / POINTER_SIDE_BAND))
      softPointer.side += (targetSide - softPointer.side) * 0.24
    } else {
      softPointer.side += (0 - softPointer.side) * 0.14
      if (softPointer.str < 0.002) {
        softPointer.str = 0
        softPointer.side = 0
      }
    }
  } else {
    pointer = null
    softPointer.str += (0 - softPointer.str) * 0.16
    softPointer.side += (0 - softPointer.side) * 0.14
    if (softPointer.str < 0.002) {
      softPointer.str = 0
      softPointer.side = 0
    }
  }

  publish()
  if (edgeLiveNeeded()) raf = requestAnimationFrame(tick)
}

function ensureLoop() {
  if (!edgeLiveNeeded()) {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    flattenLiveEdge()
    return
  }
  if (!raf) raf = requestAnimationFrame(tick)
}

function measure() {
  const el = root.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const nextW = Math.max(1, rect.width)
  const nextH = Math.max(1, rect.height)
  if (Math.abs(nextW - size.w) < 0.5 && Math.abs(nextH - size.h) < 0.5) return
  size.w = nextW
  size.h = nextH
  publish()
}

function onPointer(e: PointerEvent) {
  if (!flowSurfaceMask.pointerInteractive || e.pointerType !== 'mouse' || !root.value) {
    pendingPointer = null
    pointer = null
    return
  }
  // Dual-monitor / off-window: coords leave the viewport while focus stays.
  if (
    e.clientX < 0
    || e.clientY < 0
    || e.clientX > window.innerWidth
    || e.clientY > window.innerHeight
  ) {
    clearPointerHover()
    return
  }
  pendingPointer = { clientX: e.clientX, clientY: e.clientY }
  ensureLoop()
}

function clearPointerHover() {
  pendingPointer = null
  pointer = null
  softPointer.str = 0
  softPointer.side = 0
  ensureLoop()
}

function onPointerLeave() {
  clearPointerHover()
}

function onWindowBlur() {
  clearPointerHover()
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') clearPointerHover()
}

/** Leaves the document (often when crossing to another monitor). */
function onDocumentMouseOut(e: MouseEvent) {
  const to = e.relatedTarget as Node | null
  if (!to || !document.documentElement.contains(to)) clearPointerHover()
}

function syncGrainScale() {
  grainTilePx.value = isNarrowViewport() ? 176 : 224
  const el = grainEl.value
  if (el) el.style.backgroundSize = `${grainTilePx.value}px ${grainTilePx.value}px`
}

function stepGrainOffset() {
  const el = grainEl.value
  if (!el) return
  const t = grainTilePx.value
  // Direct DOM write — no Vue/SVG invalidation (that was the hitch).
  el.style.backgroundPosition = `${Math.floor(Math.random() * t)}px ${Math.floor(Math.random() * t)}px`
}

function syncGrainMotion() {
  if (grainTimer) {
    window.clearInterval(grainTimer)
    grainTimer = 0
  }
  const el = grainEl.value
  if (!el) return
  if (!props.active || !keepAliveActive) return
  if (motionQuery?.matches) {
    el.style.backgroundPosition = '0 0'
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    return
  }
  if (isTouchUi()) {
    el.style.backgroundPosition = '0 0'
    return
  }
  // Mid-morph: freeze grain — don't fight scroll/morph compositing.
  if (flowSurfaceMask.morph > 0.02 && flowSurfaceMask.morph < 0.98) {
    return
  }
  stepGrainOffset()
  grainTimer = window.setInterval(stepGrainOffset, GRAIN_STEP_MS)
  ensureLoop()
}

watch(
  () => flowSurfaceMask.pathRequestRevision,
  () => {
    const box = flowSurfaceMask.pathRequest
    if (box) publish(box)
  },
  { flush: 'sync' },
)

onMounted(async () => {
  await nextTick()
  animStart = performance.now()
  roamLastNow = animStart
  liveMix = liveEdgeHardOff() || !liveEdgeArmed() ? 0 : 1
  measure()
  publish()
  // clipEl is mounted with mode=window — re-apply if publish raced ahead of the ref.
  if (skipOrganicClip()) applyClipToDom('')
  else applyClipToDom(flowSurfaceMask.clipPath)
  ensureLoop()

  watch(
    () =>
      [
        props.active,
        flowSurfaceMask.pointerInteractive,
        flowSurfaceMask.roamActive,
        flowSurfaceMask.freezeSilhouette,
      ] as const,
    () => {
      syncGrainMotion()
      ensureLoop()
    },
  )

  ro = new ResizeObserver(() => measure())
  if (root.value) ro.observe(root.value)

  syncGrainScale()
  window.addEventListener('resize', syncGrainScale, { passive: true })

  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  await nextTick()
  syncGrainMotion()
  motionQuery.addEventListener('change', syncGrainMotion)

  // Pause / resume grain flicker with morph corridor.
  watch(
    () => flowSurfaceMask.morph > 0.02 && flowSurfaceMask.morph < 0.98,
    () => {
      syncGrainMotion()
    },
  )

  // Cursor / touch dent — desktop mouse only. On Android this was still wired and
  // fought the scroll transition; touch UI keeps a static edge silhouette.
  if (!isTouchUi()) {
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave, { passive: true })
    window.addEventListener('blur', onWindowBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    document.addEventListener('mouseout', onDocumentMouseOut, { passive: true })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', syncGrainScale)
  cancelAnimationFrame(raf)
  raf = 0
  if (grainTimer) {
    window.clearInterval(grainTimer)
    grainTimer = 0
  }
  motionQuery?.removeEventListener('change', syncGrainMotion)
  motionQuery = null
  ro?.disconnect()
  window.removeEventListener('pointermove', onPointer)
  window.removeEventListener('pointerleave', onPointerLeave)
  window.removeEventListener('blur', onWindowBlur)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  document.removeEventListener('mouseout', onDocumentMouseOut)
})

onDeactivated(() => {
  keepAliveActive = false
  clearPointerHover()
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  syncGrainMotion()
})

onActivated(() => {
  keepAliveActive = true
  measure()
  syncGrainMotion()
  ensureLoop()
})
const overscanPx = computed(() => (skipOrganicClip() ? 0 : EDGE_OVERSCAN))
const overscanBoxStyle = computed(() => {
  const o = overscanPx.value
  const noClip = skipOrganicClip()
  return {
    top: `-${o}px`,
    left: `-${o}px`,
    width: noClip
      ? 'var(--flow-surface-visual-width, 100%)'
      : `calc(100% + ${o * 2}px)`,
    height: noClip
      ? 'var(--flow-surface-visual-height, 100%)'
      : `calc(100% + ${o * 2}px)`,
    // No organic mask: same rest corner radius as path silhouette, cheap CSS crop.
    ...(noClip
      ? {
          overflow: 'hidden',
          borderRadius: 'var(--flow-surface-radius, 24px)',
        }
      : {}),
  }
})
const slotInsetStyle = computed(() => {
  const o = overscanPx.value
  return {
    top: `${o}px`,
    left: `${o}px`,
    right: `${o}px`,
    bottom: `${o}px`,
  }
})
</script>

<template>
  <div
    ref="root"
    class="flow-surface absolute inset-0 size-full overflow-visible pointer-events-none"
    :aria-hidden="props.mode === 'panel' ? 'true' : undefined"
  >
    <div
      v-if="props.mode === 'window'"
      ref="clipEl"
      class="flow-surface__clip absolute"
      :style="overscanBoxStyle"
    >
      <div
        class="absolute inset-0"
        :class="props.toneClass"
        :style="{
          opacity: props.toneOpacity,
          backgroundColor: props.toneColor || undefined,
        }"
      />
      <div
        ref="grainEl"
        class="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden="true"
        :style="{
          backgroundImage: GRAIN_TILE,
          backgroundRepeat: 'repeat',
          backgroundSize: `${grainTilePx}px ${grainTilePx}px`,
          backgroundPosition: '0 0',
          opacity: GRAIN_OPACITY * props.toneOpacity,
          mixBlendMode: 'soft-light',
          willChange: 'background-position',
        }"
      />
      <!-- Hero stage — layout box inset; clip shell is overscanned for outward crests. -->
      <div
        class="pointer-events-none absolute z-10 min-h-0 overflow-visible"
        :style="slotInsetStyle"
      >
        <slot />
      </div>
    </div>

    <div
      v-else-if="props.paintFill"
      ref="clipEl"
      class="flow-surface__clip absolute"
      :style="overscanBoxStyle"
    >
      <div
        class="absolute inset-0"
        :class="props.toneClass"
        :style="{
          opacity: props.toneOpacity,
          backgroundColor: props.toneColor || undefined,
        }"
      />
      <div
        ref="grainEl"
        class="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden="true"
        :style="{
          backgroundImage: GRAIN_TILE,
          backgroundRepeat: 'repeat',
          backgroundSize: `${grainTilePx}px ${grainTilePx}px`,
          backgroundPosition: '0 0',
          opacity: GRAIN_OPACITY * props.toneOpacity,
          mixBlendMode: 'soft-light',
          willChange: 'background-position',
        }"
      />
    </div>
  </div>
</template>
