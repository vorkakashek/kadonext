<script setup lang="ts">
import type {
  Mesh,
  OGLRenderingContext,
  Program,
  RenderTarget,
  Renderer,
  Texture,
  Vec2,
} from 'ogl'

type WaveMedia = HTMLImageElement | HTMLVideoElement
type ClipAncestor = {
  element: HTMLElement
  x: boolean
  y: boolean
}
type PointerBounds = {
  left: number
  top: number
  width: number
  height: number
}
type RippleSimulation = {
  read: RenderTarget
  write: RenderTarget
  mesh: Mesh
  mouse: Vec2
  previousMouse: Vec2
  impulse: { value: number }
  aspect: { value: number }
  brushRadius: { value: number }
  texel: Vec2
}
type RetiringWave = {
  media: WaveMedia
  clipAncestors: ClipAncestor[]
  simulation: RippleSimulation
  texture: Texture
  energy: number
  mix: number
}

const canvasEl = ref<HTMLCanvasElement | null>(null)
const { motionActive } = useCaseDetailExperience()
const { scrollDelta, scrollRevision, resizeRevision } = useMotionRuntime()

const vertexShader = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;

  uniform vec4 uRect;
  uniform vec4 uVisibleUv;

  varying vec2 vUv;
  varying vec2 vMediaUv;

  void main() {
    vUv = uv;
    vMediaUv = uVisibleUv.xy + uv * uVisibleUv.zw;
    vec2 clipPosition = (uRect.xy + vMediaUv * uRect.zw) * 2.0 - 1.0;
    gl_Position = vec4(clipPosition, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D tImage;
  uniform sampler2D tRipple;
  uniform sampler2D tRippleSecondaryA;
  uniform sampler2D tRippleSecondaryB;
  uniform sampler2D tRippleSecondaryC;
  uniform vec2 uUvScale;
  uniform vec4 uVisibleUv;
  uniform vec2 uRippleTexel;
  uniform float uEffectMix;
  uniform float uOverlayOnly;
  uniform vec3 uSecondaryEffectMix;

  varying vec2 vUv;
  varying vec2 vMediaUv;

  void main() {
    // OGL's fullscreen Triangle deliberately extends its UVs to 2.0. The
    // shared layer maps that triangle into the media rectangle, so discard
    // the overscan before sampling or it appears as diagonal image shards.
    if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) discard;

    float heightLeft = texture2D(tRipple, vUv - vec2(uRippleTexel.x, 0.0)).r;
    float heightRight = texture2D(tRipple, vUv + vec2(uRippleTexel.x, 0.0)).r;
    float heightDown = texture2D(tRipple, vUv - vec2(0.0, uRippleTexel.y)).r;
    float heightUp = texture2D(tRipple, vUv + vec2(0.0, uRippleTexel.y)).r;
    vec2 waterGradient = vec2(heightLeft - heightRight, heightDown - heightUp) * uEffectMix;

    // A gesture can restart while older fields on the same media are still
    // fading. Composite those slopes into one image sample so a fresh field
    // does not cover or abruptly erase the outgoing deformation.
    if (uSecondaryEffectMix.x > 0.001) {
      float secondaryLeft = texture2D(tRippleSecondaryA, vUv - vec2(uRippleTexel.x, 0.0)).r;
      float secondaryRight = texture2D(tRippleSecondaryA, vUv + vec2(uRippleTexel.x, 0.0)).r;
      float secondaryDown = texture2D(tRippleSecondaryA, vUv - vec2(0.0, uRippleTexel.y)).r;
      float secondaryUp = texture2D(tRippleSecondaryA, vUv + vec2(0.0, uRippleTexel.y)).r;
      waterGradient += vec2(secondaryLeft - secondaryRight, secondaryDown - secondaryUp) * uSecondaryEffectMix.x;
    }
    if (uSecondaryEffectMix.y > 0.001) {
      float secondaryLeft = texture2D(tRippleSecondaryB, vUv - vec2(uRippleTexel.x, 0.0)).r;
      float secondaryRight = texture2D(tRippleSecondaryB, vUv + vec2(uRippleTexel.x, 0.0)).r;
      float secondaryDown = texture2D(tRippleSecondaryB, vUv - vec2(0.0, uRippleTexel.y)).r;
      float secondaryUp = texture2D(tRippleSecondaryB, vUv + vec2(0.0, uRippleTexel.y)).r;
      waterGradient += vec2(secondaryLeft - secondaryRight, secondaryDown - secondaryUp) * uSecondaryEffectMix.y;
    }
    if (uSecondaryEffectMix.z > 0.001) {
      float secondaryLeft = texture2D(tRippleSecondaryC, vUv - vec2(uRippleTexel.x, 0.0)).r;
      float secondaryRight = texture2D(tRippleSecondaryC, vUv + vec2(uRippleTexel.x, 0.0)).r;
      float secondaryDown = texture2D(tRippleSecondaryC, vUv - vec2(0.0, uRippleTexel.y)).r;
      float secondaryUp = texture2D(tRippleSecondaryC, vUv + vec2(0.0, uRippleTexel.y)).r;
      waterGradient += vec2(secondaryLeft - secondaryRight, secondaryDown - secondaryUp) * uSecondaryEffectMix.z;
    }
    float rippleEnergy = smoothstep(0.0008, 0.055, length(waterGradient));
    // Regular DOM images remain visible below this canvas. Outside the actual
    // wake, skip the expensive full-resolution image lookup entirely instead
    // of repainting the complete media rectangle for every active tail.
    if (uOverlayOnly > 0.5 && rippleEnergy < 0.001) discard;

    vec2 displacedUv = vMediaUv;
    // The texture is displaced by the slope of the simulated water surface.
    // Nothing here depends on the current cursor position: stored wave energy
    // keeps travelling through the height field after the gesture has passed.
    displacedUv += waterGradient * 0.138 * uVisibleUv.zw;
    vec2 textureUv = (displacedUv - 0.5) * uUvScale + 0.5;

    vec4 baseColor = texture2D(tImage, textureUv);
    vec2 chromaOffset = waterGradient * 0.0225 * uVisibleUv.zw;
    // Most pixels of a large case image are outside the active ripple. Skip
    // two extra high-resolution image samples there.
    if (rippleEnergy > 0.001) {
      vec3 splitColor = vec3(
        texture2D(tImage, textureUv + chromaOffset).r,
        baseColor.g,
        texture2D(tImage, textureUv - chromaOffset).b
      );
      float chromaMix = rippleEnergy * 0.32;
      baseColor.rgb = mix(baseColor.rgb, splitColor, chromaMix);
    }
    if (uOverlayOnly > 0.5) {
      baseColor.a *= smoothstep(0.0, 0.22, rippleEnergy);
    }

    gl_FragColor = baseColor;
  }
`

const rippleVertexShader = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const rippleFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D tState;
  uniform vec2 uTexel;
  uniform vec2 uMouse;
  uniform vec2 uPreviousMouse;
  uniform float uImpulse;
  uniform float uAspect;
  uniform float uBrushRadius;

  varying vec2 vUv;

  float segmentDistance(vec2 point, vec2 start, vec2 end) {
    vec2 segment = end - start;
    float amount = clamp(dot(point - start, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
    return length(point - (start + segment * amount));
  }

  void main() {
    vec4 state = texture2D(tState, vUv);
    float left = texture2D(tState, vUv - vec2(uTexel.x, 0.0)).r;
    float right = texture2D(tState, vUv + vec2(uTexel.x, 0.0)).r;
    float down = texture2D(tState, vUv - vec2(0.0, uTexel.y)).r;
    float up = texture2D(tState, vUv + vec2(0.0, uTexel.y)).r;

    // Damped finite-difference wave equation. Strong physical damping keeps a
    // continuously drawn wake compact; the visual mix only cleans up the last
    // already-faint residue instead of cutting a still-moving wave short.
    float laplacian = left + right + down + up - state.r * 4.0;
    float velocity = (state.r - state.g) * 0.84;
    float nextHeight = state.r + velocity + laplacian * 0.12;

    vec2 point = vec2(vUv.x * uAspect, vUv.y);
    vec2 end = vec2(uMouse.x * uAspect, uMouse.y);
    vec2 previous = vec2(uPreviousMouse.x * uAspect, uPreviousMouse.y);
    // Deposit only the newest fifth of the pointer segment so the wake stays
    // close to the cursor instead of drawing a long stroke behind it.
    vec2 start = mix(end, previous, 0.2);
    float distanceToGesture = segmentDistance(point, start, end);
    float brush = exp(-pow(distanceToGesture / max(uBrushRadius, 0.001), 2.0) * 2.2);
    nextHeight -= brush * uImpulse * 0.12;

    // A soft absorbing boundary prevents long-lived reflections from the
    // rectangular edges of the media.
    float edgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    nextHeight *= mix(0.90, 1.0, smoothstep(0.0, 0.045, edgeDistance));
    gl_FragColor = vec4(clamp(nextHeight, -1.0, 1.0), state.r, 0.0, 1.0);
  }
`

let scopeEl: HTMLElement | null = null
let mediaQuery: MediaQueryList | null = null
let renderer: Renderer | null = null
let gl: OGLRenderingContext | null = null
let mediaTexture: Texture | null = null
let placeholderTexture: Texture | null = null
let textureFactory: ((media: WaveMedia) => Texture) | null = null
let mediaProgram: Program | null = null
let mediaMesh: Mesh | null = null
let rippleSimulation: RippleSimulation | null = null
let spareRippleSimulations: RippleSimulation[] = []
let retiringWaves: RetiringWave[] = []
let pointer: Vec2 | null = null
let uvScale: Vec2 | null = null
let rectUniform: Float32Array | null = null
let visibleUvUniform: Float32Array | null = null
let effectMixUniform: { value: number } | null = null
let secondaryEffectMixUniform: Float32Array | null = null
let activeMedia: WaveMedia | null = null
let hoveredMedia: WaveMedia | null = null
let activeClipAncestors: ClipAncestor[] = []
let hoveredClipAncestors: ClipAncestor[] = []
let activePointerBounds: PointerBounds | null = null
let animationFrame = 0
let initialization: Promise<void> | null = null
let activationId = 0
let lastFrameTime = 0
let targetPointerX = 0.5
let targetPointerY = 0.5
let lastPointerInputTime = 0
let lastPointerEventTime = 0
let inputMotionStrength = 0
let trailEnergy = 0
let effectMix = 1
let simulationAccumulator = 0
let stopMotionWatch: (() => void) | null = null
let stopRuntimeWatch: (() => void) | null = null
let textureWarmupIdle = 0
let rendererWarmupIdle = 0
let scrollIdleTimer = 0
let scrolling = false
let mediaWarmupObserver: IntersectionObserver | null = null
const textureWarmupQueue: WaveMedia[] = []
const queuedTextureWarmups = new Set<WaveMedia>()
const pendingMediaWarmups = new Set<string | WaveMedia>()
const decodedMediaAwaitingRenderer = new Set<WaveMedia>()
const motionStateCache = new WeakMap<WaveMedia, { checkedAt: number, stable: boolean }>()
let clipAncestorCache = new WeakMap<WaveMedia, ClipAncestor[]>()
const textureCache = new Map<string | WaveMedia, { texture: Texture, lastUsed: number }>()
let maxCachedTextures = 4
const HIGH_RIPPLE_SIZE = 192
const MEDIUM_RIPPLE_SIZE = 160
const LOW_RIPPLE_SIZE = 128
const RIPPLE_STEP_MS = 1000 / 60
const MIN_EFFECT_RADIUS_PX = 28
const MAX_EFFECT_RADIUS_PX = 180
const EFFECT_RADIUS_SCALE = 1.25
const EFFECT_FADE_DURATION_MS = 520
const MAX_SIMULTANEOUS_WAVES = 4
/** Texture uploads resume only after meaningful page motion has settled. Hover
 * rendering itself stays live on the shared canvas throughout the scroll. */
const SCROLL_WARMUP_RESUME_DELAY_MS = 180
/** Ignore Lenis' subpixel inertial tail for the texture-upload pause. */
const SCROLL_ACTIVITY_MIN_DELTA_PX = 0.6
let rippleSize = HIGH_RIPPLE_SIZE

function preferredRippleSize() {
  const device = navigator as Navigator & { deviceMemory?: number }
  const memory = device.deviceMemory
  const cores = navigator.hardwareConcurrency || 4

  // iPad can expose a fine pointer while a trackpad is connected. Keep that
  // optional desktop-like interaction, but do not give it the desktop budget.
  if (navigator.maxTouchPoints > 0) return MEDIUM_RIPPLE_SIZE
  if ((memory !== undefined && memory <= 4) || cores <= 4) return LOW_RIPPLE_SIZE
  if ((memory !== undefined && memory <= 8) || cores <= 6) return MEDIUM_RIPPLE_SIZE
  return HIGH_RIPPLE_SIZE
}

function preferredTextureCacheSize() {
  const device = navigator as Navigator & { deviceMemory?: number }
  const memory = device.deviceMemory ?? 4
  const cores = navigator.hardwareConcurrency || 4
  // The effect only mounts for fine desktop pointers. Keep a wider forward
  // runway on capable machines so normal reading does not churn the fourth
  // texture back out of GPU memory; conservative devices retain the old cap.
  return memory >= 8 && cores >= 8 ? 8 : 4
}

function motionStrengthForSpeed(pixelsPerSecond: number) {
  const normalized = Math.min(1, Math.max(0, (pixelsPerSecond - 18) / 1180))
  return normalized ** 0.72
}

function settledMixForEnergy(energy: number) {
  const linear = Math.min(1, Math.max(0, (energy - 0.004) / 0.096))
  return linear * linear * (3 - 2 * linear)
}

function approachEffectMix(current: number, target: number, elapsed: number) {
  const fadeTimeConstant = EFFECT_FADE_DURATION_MS / 3
  const ease = 1 - Math.exp(-elapsed / (target > current ? 70 : fadeTimeConstant))
  return current + (target - current) * ease
}

function effectRadiusForBounds(width: number, height: number) {
  const shortestSide = Math.min(width, height)
  const areaScale = 18 + Math.sqrt(width * height) * 0.2
  const baseRadius = Math.max(
    MIN_EFFECT_RADIUS_PX,
    Math.min(MAX_EFFECT_RADIUS_PX, shortestSide * 0.34, areaScale),
  )
  return baseRadius * EFFECT_RADIUS_SCALE
}

function waveScaleForBounds(width: number, height: number) {
  return Math.min(2.6, Math.max(0.7, Math.sqrt(width * height) / 580))
}

function isIdentityTransform(transform: string) {
  if (!transform || transform === 'none') return true
  try {
    const matrix = new DOMMatrixReadOnly(transform)
    const values = [
      matrix.m11, matrix.m12, matrix.m13, matrix.m14,
      matrix.m21, matrix.m22, matrix.m23, matrix.m24,
      matrix.m31, matrix.m32, matrix.m33, matrix.m34,
      matrix.m41, matrix.m42, matrix.m43, matrix.m44,
    ]
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    return values.every((value, index) => Math.abs(value - identity[index]!) < 0.001)
  } catch {
    return false
  }
}

function isMediaMotionStable(media: WaveMedia) {
  if (!motionActive.value || scopeEl?.classList.contains('case-detail--entering')) return false

  const now = performance.now()
  const cached = motionStateCache.get(media)
  if (cached && now - cached.checkedAt < 50) return cached.stable

  const revealHost = media.closest<HTMLElement>('[data-case-reveal]')
    ?? media.closest<HTMLElement>('.case-detail__first-screen .case-detail__media')
  if (!revealHost) {
    motionStateCache.set(media, { checkedAt: now, stable: true })
    return true
  }

  const styles = getComputedStyle(revealHost)
  // Some reveal targets are the <img> itself. Its computed opacity is forced
  // to zero while the canvas substitutes it, so read GSAP's live inline value
  // in that one case instead of mistaking our own hiding class for a reveal.
  const revealOpacity = revealHost === activeMedia && revealHost.classList.contains('case-wave-media-active')
    ? Number.parseFloat(revealHost.style.opacity || '1')
    : Number.parseFloat(styles.opacity)
  const stable = styles.visibility !== 'hidden'
    && revealOpacity >= 0.999
    && isIdentityTransform(styles.transform)
  motionStateCache.set(media, { checkedAt: now, stable })
  return stable
}

function isEligibleMedia(element: Element | null): element is WaveMedia {
  if (!(element instanceof HTMLImageElement) && !(element instanceof HTMLVideoElement)) return false
  return !element.hasAttribute('data-wave-disabled')
}

function findMedia(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const media = target.closest('img, video')
  return media && scopeEl?.contains(media) && isEligibleMedia(media) ? media : null
}

function mediaDimensions(media: WaveMedia) {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight }
  }
  return { width: media.naturalWidth, height: media.naturalHeight }
}

function textureKey(media: WaveMedia) {
  return media instanceof HTMLImageElement ? (media.currentSrc || media.src) : media
}

/** A native video plane can ignore CSS blending. Its declared wave blend lets
 * the canvas use the intended composition while the DOM fallback does it with
 * a regular overlay. */
function mediaBlendMode(media: WaveMedia) {
  const computed = getComputedStyle(media).mixBlendMode
  return computed !== 'normal' ? computed : media.dataset.waveBlend ?? computed
}

function collectClipAncestors(media: WaveMedia) {
  const cached = clipAncestorCache.get(media)
  if (cached) return cached
  const ancestors: ClipAncestor[] = []
  let parent = media.parentElement
  while (parent && parent !== scopeEl) {
    const styles = getComputedStyle(parent)
    const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(styles.overflowX)
    const clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(styles.overflowY)
    if (clipsX || clipsY) ancestors.push({ element: parent, x: clipsX, y: clipsY })
    parent = parent.parentElement
  }
  clipAncestorCache.set(media, ancestors)
  return ancestors
}

function trimTextureCache(protectedKey: string | WaveMedia) {
  if (!gl) return
  while (textureCache.size > maxCachedTextures) {
    const eviction = [...textureCache.entries()]
      .filter(([candidateKey, entry]) =>
        candidateKey !== protectedKey
        && entry.texture !== mediaTexture
        && !retiringWaves.some(wave => wave.texture === entry.texture),
      )
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
    if (!eviction) return
    gl.deleteTexture(eviction[1].texture.texture)
    textureCache.delete(eviction[0])
  }
}

function selectMediaTexture(media: WaveMedia) {
  if (!mediaProgram || !textureFactory || !gl) return false
  const key = textureKey(media)
  let entry = textureCache.get(key)
  if (!entry) {
    entry = { texture: textureFactory(media), lastUsed: performance.now() }
    textureCache.set(key, entry)
  }
  entry.lastUsed = performance.now()

  mediaTexture = entry.texture
  mediaProgram.uniforms.tImage!.value = entry.texture

  trimTextureCache(key)
  return true
}

function drainTextureWarmupQueue() {
  if (textureWarmupIdle || scrolling || !textureWarmupQueue.length) return
  const upload = () => {
    textureWarmupIdle = 0
    // requestIdleCallback may have been queued just before scrolling began.
    // Keep the raster in the queue until the scroll/reveal corridor settles so
    // a GPU upload cannot compete with a large image entering the compositor.
    if (scrolling) return
    const candidate = textureWarmupQueue.shift()
    if (!candidate) return
    queuedTextureWarmups.delete(candidate)
    if (candidate.isConnected && textureFactory && gl && isMediaReady(candidate)) {
      const key = textureKey(candidate)
      if (!textureCache.has(key)) {
        const texture = textureFactory(candidate)
        // Force the raster upload outside pointer and active scroll frames so
        // the first real hover only swaps a uniform.
        texture.update(0)
        textureCache.set(key, { texture, lastUsed: performance.now() - 1 })
        trimTextureCache(key)
      }
    }
    drainTextureWarmupQueue()
  }

  textureWarmupIdle = window.requestIdleCallback
    ? window.requestIdleCallback(upload, { timeout: 1200 })
    : window.setTimeout(upload, 32)
}

function enqueueTextureWarmup(media: WaveMedia, priority = false) {
  const key = textureKey(media)
  const queuedIndex = textureWarmupQueue.findIndex(candidate => textureKey(candidate) === key)
  if (queuedIndex >= 0) {
    if (priority && queuedIndex > 0) {
      const [candidate] = textureWarmupQueue.splice(queuedIndex, 1)
      if (candidate) textureWarmupQueue.unshift(candidate)
    }
    return
  }
  if (
    !textureFactory
    || queuedTextureWarmups.has(media)
    || textureCache.has(key)
  ) return
  queuedTextureWarmups.add(media)
  if (priority) textureWarmupQueue.unshift(media)
  else textureWarmupQueue.push(media)
  drainTextureWarmupQueue()
}

function scheduleNearbyTextureWarmup(media: WaveMedia) {
  if (!scopeEl || !textureFactory) return
  const images = Array.from(scopeEl.querySelectorAll<HTMLImageElement>('img:not([data-wave-disabled])'))
    .filter(isMediaReady)
  const activeIndex = images.indexOf(media as HTMLImageElement)
  const candidates = images
    .filter((candidate) => candidate !== media && !textureCache.has(textureKey(candidate)))
    .sort((a, b) => {
      if (activeIndex < 0) return 0
      return Math.abs(images.indexOf(a) - activeIndex) - Math.abs(images.indexOf(b) - activeIndex)
    })

  for (const candidate of candidates.slice(0, Math.max(0, maxCachedTextures - textureCache.size))) {
    enqueueTextureWarmup(candidate)
  }
}

function warmTextureBeforeViewport(media: WaveMedia) {
  const key = textureKey(media)
  if (pendingMediaWarmups.has(key) || textureCache.has(key)) return
  pendingMediaWarmups.add(key)
  void ensureMediaReady(media).then((ready) => {
    if (!ready) return
    if (textureFactory) enqueueTextureWarmup(media)
    else decodedMediaAwaitingRenderer.add(media)
  }).finally(() => {
    pendingMediaWarmups.delete(key)
  })
}

function visibleMediaBounds(media: WaveMedia, ancestors: ClipAncestor[]) {
  const mediaBounds = media.getBoundingClientRect()
  let left = Math.max(0, mediaBounds.left)
  let top = Math.max(0, mediaBounds.top)
  let right = Math.min(window.innerWidth, mediaBounds.right)
  let bottom = Math.min(window.innerHeight, mediaBounds.bottom)

  for (const ancestor of ancestors) {
    const bounds = ancestor.element.getBoundingClientRect()
    if (ancestor.x) {
      left = Math.max(left, bounds.left)
      right = Math.min(right, bounds.right)
    }
    if (ancestor.y) {
      top = Math.max(top, bounds.top)
      bottom = Math.min(bottom, bounds.bottom)
    }
  }

  return { mediaBounds, left, top, right, bottom, width: right - left, height: bottom - top }
}

function syncMediaGeometryFor(
  media: WaveMedia,
  clipAncestors: ClipAncestor[],
  simulation: RippleSimulation,
  updateActivePointerBounds = false,
) {
  if (!rectUniform || !visibleUvUniform || !uvScale) return false
  const visible = visibleMediaBounds(media, clipAncestors)
  const bounds = visible.mediaBounds
  const source = mediaDimensions(media)
  if (!bounds.width || !bounds.height || visible.width <= 0 || visible.height <= 0 || !source.width || !source.height) return false

  rectUniform[0] = bounds.left / window.innerWidth
  rectUniform[1] = 1 - bounds.bottom / window.innerHeight
  rectUniform[2] = bounds.width / window.innerWidth
  rectUniform[3] = bounds.height / window.innerHeight

  visibleUvUniform[0] = (visible.left - bounds.left) / bounds.width
  visibleUvUniform[1] = (bounds.bottom - visible.bottom) / bounds.height
  visibleUvUniform[2] = visible.width / bounds.width
  visibleUvUniform[3] = visible.height / bounds.height
  if (updateActivePointerBounds) {
    activePointerBounds = {
      left: visible.left,
      top: visible.top,
      width: visible.width,
      height: visible.height,
    }
  }

  const mediaAspect = bounds.width / bounds.height
  const sourceAspect = source.width / source.height
  uvScale.set(
    mediaAspect < sourceAspect ? mediaAspect / sourceAspect : 1,
    mediaAspect > sourceAspect ? sourceAspect / mediaAspect : 1,
  )
  simulation.aspect.value = visible.width / visible.height
  const waveScale = waveScaleForBounds(visible.width, visible.height)
  simulation.texel.set(
    waveScale / rippleSize / Math.max(simulation.aspect.value, 0.001),
    waveScale / rippleSize,
  )
  const effectRadius = effectRadiusForBounds(visible.width, visible.height) / visible.height
  // The contact point stays compact; the simulated wave equation, rather than
  // a giant cursor mask, is responsible for spreading the response outward.
  simulation.brushRadius.value = effectRadius * 0.24
  return true
}

function syncMediaGeometry() {
  if (!activeMedia || !rippleSimulation) return false
  return syncMediaGeometryFor(activeMedia, activeClipAncestors, rippleSimulation, true)
}

function resizeRenderer() {
  if (!renderer) return
  renderer.setSize(window.innerWidth, window.innerHeight)
  syncMediaGeometry()
}

function clearCanvas() {
  if (!renderer || !gl) return
  renderer.bindFramebuffer()
  renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
}

function clearTrail(simulation = rippleSimulation) {
  if (!renderer || !gl || !simulation) return
  const targets = [simulation.read, simulation.write]
  for (const target of targets) {
    renderer.bindFramebuffer(target)
    renderer.setViewport(target.width, target.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
  renderer.bindFramebuffer()
  renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr)
  simulation.mesh.program.uniforms.tState!.value = simulation.read.texture
  if (simulation === rippleSimulation && mediaProgram) {
    mediaProgram.uniforms.tRipple!.value = simulation.read.texture
  }
}

function updateRippleSimulation(simulation: RippleSimulation, impulse: number) {
  if (!renderer) return
  simulation.impulse.value = impulse
  const uniforms = simulation.mesh.program.uniforms
  uniforms.tState!.value = simulation.read.texture
  uniforms.uTexel!.value = simulation.texel
  uniforms.uMouse!.value = simulation.mouse
  uniforms.uPreviousMouse!.value = simulation.previousMouse
  uniforms.uImpulse!.value = simulation.impulse.value
  uniforms.uAspect!.value = simulation.aspect.value
  uniforms.uBrushRadius!.value = simulation.brushRadius.value
  renderer.render({ scene: simulation.mesh, target: simulation.write, clear: false })
  const previous = simulation.read
  simulation.read = simulation.write
  simulation.write = previous
  uniforms.tState!.value = simulation.read.texture
}

function drawMedia(
  media: WaveMedia,
  clipAncestors: ClipAncestor[],
  simulation: RippleSimulation,
  texture: Texture,
  mix: number,
  updateActivePointerBounds = false,
  secondaryWaves: RetiringWave[] = [],
) {
  if (
    !renderer
    || !mediaMesh
    || !mediaProgram
    || !effectMixUniform
    || !secondaryEffectMixUniform
    || !syncMediaGeometryFor(media, clipAncestors, simulation, updateActivePointerBounds)
  ) return
  if (media instanceof HTMLVideoElement) texture.needsUpdate = true
  mediaProgram.uniforms.tImage!.value = texture
  mediaProgram.uniforms.tRipple!.value = simulation.read.texture
  mediaProgram.uniforms.uRippleTexel!.value = simulation.texel
  mediaProgram.uniforms.uOverlayOnly!.value = mediaBlendMode(media) === 'normal' ? 1 : 0
  const secondaryA = secondaryWaves[0]
  const secondaryB = secondaryWaves[1]
  const secondaryC = secondaryWaves[2]
  mediaProgram.uniforms.tRippleSecondaryA!.value = secondaryA?.simulation.read.texture ?? simulation.read.texture
  mediaProgram.uniforms.tRippleSecondaryB!.value = secondaryB?.simulation.read.texture ?? simulation.read.texture
  mediaProgram.uniforms.tRippleSecondaryC!.value = secondaryC?.simulation.read.texture ?? simulation.read.texture
  secondaryEffectMixUniform[0] = secondaryA?.mix ?? 0
  secondaryEffectMixUniform[1] = secondaryB?.mix ?? 0
  secondaryEffectMixUniform[2] = secondaryC?.mix ?? 0
  effectMixUniform.value = mix
  renderer.render({ scene: mediaMesh, clear: false })
}

function draw() {
  if (!renderer || !mediaMesh || !activeMedia || !rippleSimulation || !mediaTexture) return
  if (!isMediaMotionStable(activeMedia)) {
    activationId++
    hoveredMedia = null
    hoveredClipAncestors = []
    releaseRetiringWave()
    releaseActiveMedia()
    return
  }
  clearCanvas()
  const sameMediaRetiringWaves = retiringWaves.filter(wave => wave.media === activeMedia)
  for (const retiringWave of retiringWaves) {
    if (retiringWave.media === activeMedia) continue
    drawMedia(
      retiringWave.media,
      retiringWave.clipAncestors,
      retiringWave.simulation,
      retiringWave.texture,
      retiringWave.mix,
    )
  }
  drawMedia(activeMedia, activeClipAncestors, rippleSimulation, mediaTexture, effectMix, true, sameMediaRetiringWaves)
}

function releaseRetiringWave(index = 0) {
  const retiringWave = retiringWaves[index]
  if (!retiringWave) return
  retiringWave.media.classList.remove('case-wave-media-active')
  clearTrail(retiringWave.simulation)
  spareRippleSimulations.push(retiringWave.simulation)
  retiringWaves.splice(index, 1)
}

function releaseRetiringWaves() {
  while (retiringWaves.length) releaseRetiringWave(0)
}

function reactivateRetiringWave(media: WaveMedia) {
  if (!activeMedia || !rippleSimulation || !mediaTexture) return null
  if (mediaBlendMode(activeMedia) !== 'normal') return null

  // A quick A → B → A gesture should continue A's existing height field,
  // rather than allocate another lane for the same media and eventually evict
  // a still-visible tail from the bounded simulation pool.
  let returningIndex = -1
  for (let index = retiringWaves.length - 1; index >= 0; index--) {
    if (retiringWaves[index]?.media === media) {
      returningIndex = index
      break
    }
  }
  if (returningIndex < 0) return null

  const returningWave = retiringWaves[returningIndex]!
  retiringWaves.splice(returningIndex, 1)

  const outgoingMedia = activeMedia
  const outgoingSimulation = rippleSimulation
  const outgoingTexture = mediaTexture
  if (effectMix > 0.004) {
    retiringWaves.push({
      media: outgoingMedia,
      clipAncestors: activeClipAncestors,
      simulation: outgoingSimulation,
      texture: outgoingTexture,
      energy: trailEnergy,
      mix: effectMix,
    })
  }
  else {
    outgoingMedia.classList.remove('case-wave-media-active')
    clearTrail(outgoingSimulation)
    spareRippleSimulations.push(outgoingSimulation)
  }

  rippleSimulation = returningWave.simulation
  pointer = rippleSimulation.mouse
  activeMedia = null
  activePointerBounds = null
  return returningWave
}

function retireActiveWave() {
  if (
    !activeMedia
    || !rippleSimulation
    || !mediaTexture
    || effectMix <= 0.004
    || mediaBlendMode(activeMedia) !== 'normal'
  ) return false

  // Keep one active field and up to three independently retiring fields. If a
  // fifth media is reached before the oldest tail settles, recycle only that
  // oldest field; the three most recently left images continue naturally.
  if (!spareRippleSimulations.length && retiringWaves.length) releaseRetiringWave(0)
  const nextSimulation = spareRippleSimulations.pop()
  if (!nextSimulation) return false
  const outgoingSimulation = rippleSimulation
  rippleSimulation = nextSimulation
  pointer = rippleSimulation.mouse
  retiringWaves.push({
    media: activeMedia,
    clipAncestors: activeClipAncestors,
    simulation: outgoingSimulation,
    texture: mediaTexture,
    energy: trailEnergy,
    mix: effectMix,
  })
  activeMedia = null
  activePointerBounds = null
  clearTrail(rippleSimulation)
  return true
}

function releaseActiveMedia(clear = true) {
  activeMedia?.classList.remove('case-wave-media-active')
  activeMedia = null
  activePointerBounds = null
  const canvas = canvasEl.value
  if (canvas) canvas.style.mixBlendMode = ''
  if (clear) clearCanvas()
}

function render(time: number) {
  animationFrame = 0
  if (!pointer || !activeMedia || !rippleSimulation) return

  const elapsed = lastFrameTime ? Math.min(40, time - lastFrameTime) : 16.67
  lastFrameTime = time
  pointer.set(targetPointerX, targetPointerY)

  // Only movement injects energy. Once the pointer stops, the height field
  // evolves on its own and carries the existing wake away from the gesture.
  // Hover state deliberately does not alter this envelope: stopping, leaving,
  // and crossing into another media all decay from the last input identically.
  const inputAge = lastPointerInputTime ? Math.max(0, time - lastPointerInputTime) : Number.POSITIVE_INFINITY
  const inputFreshness = Math.exp(-inputAge / 58)
  const motionTarget = inputMotionStrength * inputFreshness
  const fadeTimeConstant = EFFECT_FADE_DURATION_MS / 3
  trailEnergy = Math.max(motionTarget, trailEnergy * Math.exp(-elapsed / fadeTimeConstant))

  // The simulation becomes very faint before its bookkeeping threshold is
  // reached. Fade the shader contribution through that final range even while
  // the pointer remains over the media, so clearing the buffers is invisible.
  const effectMixTarget = motionTarget > 0.002 ? 1 : settledMixForEnergy(trailEnergy)
  effectMix = approachEffectMix(effectMix, effectMixTarget, elapsed)
  if (effectMixUniform) effectMixUniform.value = effectMix

  // Keep the active wake at display cadence even while scrolling. The smaller
  // field keeps that affordable; old trails fade without extra simulation work
  // until the page settles.
  simulationAccumulator = Math.min(RIPPLE_STEP_MS * 2, simulationAccumulator + elapsed)
  const simulationSteps = Math.floor(simulationAccumulator / RIPPLE_STEP_MS)
  for (let step = 0; step < simulationSteps; step++) {
    updateRippleSimulation(rippleSimulation, step === 0 ? motionTarget : 0)
    if (!scrolling) {
      for (const retiringWave of retiringWaves) updateRippleSimulation(retiringWave.simulation, 0)
    }
    rippleSimulation.previousMouse.set(pointer.x, pointer.y)
    simulationAccumulator -= RIPPLE_STEP_MS
  }

  for (let index = retiringWaves.length - 1; index >= 0; index--) {
    const retiringWave = retiringWaves[index]!
    retiringWave.energy *= Math.exp(-elapsed / fadeTimeConstant)
    retiringWave.mix = approachEffectMix(
      retiringWave.mix,
      settledMixForEnergy(retiringWave.energy),
      elapsed,
    )
    if (retiringWave.energy <= 0.004 && retiringWave.mix <= 0.004) releaseRetiringWave(index)
  }

  draw()

  if (trailEnergy > 0.004 || effectMix > 0.004 || retiringWaves.length) {
    animationFrame = requestAnimationFrame(render)
    return
  }

  trailEnergy = 0
  simulationAccumulator = 0
  lastFrameTime = 0
  clearTrail()
  releaseActiveMedia()
}

function requestRender() {
  if (!animationFrame && activeMedia) animationFrame = requestAnimationFrame(render)
}

async function setupRenderer() {
  if (renderer || initialization || !mediaQuery?.matches) return initialization
  initialization = (async () => {
    const canvas = canvasEl.value
    if (!canvas) return
    const {
      Mesh: OglMesh,
      Program: OglProgram,
      RenderTarget: OglRenderTarget,
      Renderer: OglRenderer,
      Texture: OglTexture,
      Triangle,
      Vec2: OglVec2,
    } = await import('ogl')
    if (!canvasEl.value || canvasEl.value !== canvas || !mediaQuery?.matches) return

    const nextRenderer = new OglRenderer({
      canvas,
      // A fixed 1x buffer is enough for transient refraction and avoids the
      // 56% fragment-count increase of the previous 1.25 DPR canvas.
      dpr: 1,
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
    })
    const nextGl = nextRenderer.gl
    nextGl.clearColor(0, 0, 0, 0)
    rippleSize = preferredRippleSize()
    maxCachedTextures = preferredTextureCacheSize()

    const nextTexture = new OglTexture(nextGl, {
      generateMipmaps: false,
      minFilter: nextGl.LINEAR,
      magFilter: nextGl.LINEAR,
      wrapS: nextGl.CLAMP_TO_EDGE,
      wrapT: nextGl.CLAMP_TO_EDGE,
    })
    const halfFloatType = nextGl.renderer.isWebgl2
      ? (nextGl as WebGL2RenderingContext).HALF_FLOAT
      : nextGl.renderer.extensions.OES_texture_half_float.HALF_FLOAT_OES
    const rippleTargetOptions = {
      width: rippleSize,
      height: rippleSize,
      depth: false,
      stencil: false,
      type: halfFloatType,
      format: nextGl.RGBA,
      internalFormat: nextGl.renderer.isWebgl2
        ? (nextGl as WebGL2RenderingContext).RGBA16F
        : nextGl.RGBA,
      minFilter: nextGl.LINEAR,
      magFilter: nextGl.LINEAR,
    }
    const nextFullscreenGeometry = new Triangle(nextGl)
    const nextRippleProgram = new OglProgram(nextGl, {
      vertex: rippleVertexShader,
      fragment: rippleFragmentShader,
      uniforms: {
        tState: { value: nextTexture },
        uTexel: { value: new OglVec2(1 / rippleSize, 1 / rippleSize) },
        uMouse: { value: new OglVec2(0.5, 0.5) },
        uPreviousMouse: { value: new OglVec2(0.5, 0.5) },
        uImpulse: { value: 0 },
        uAspect: { value: 1 },
        uBrushRadius: { value: 0.12 },
      },
      depthTest: false,
      depthWrite: false,
      cullFace: false,
    })
    const createRippleSimulation = (): RippleSimulation => {
      const read = new OglRenderTarget(nextGl, rippleTargetOptions)
      const write = new OglRenderTarget(nextGl, rippleTargetOptions)
      const texel = new OglVec2(1 / rippleSize, 1 / rippleSize)
      const mouse = new OglVec2(0.5, 0.5)
      const previousMouse = new OglVec2(0.5, 0.5)
      const impulse = { value: 0 }
      const aspect = { value: 1 }
      const brushRadius = { value: 0.12 }
      return {
        read,
        write,
        mesh: new OglMesh(nextGl, { geometry: nextFullscreenGeometry, program: nextRippleProgram }),
        mouse,
        previousMouse,
        impulse,
        aspect,
        brushRadius,
        texel,
      }
    }
    const nextRippleSimulation = createRippleSimulation()
    const nextSpareRippleSimulations = Array.from(
      { length: MAX_SIMULTANEOUS_WAVES - 1 },
      createRippleSimulation,
    )
    const nextPointer = nextRippleSimulation.mouse
    const nextUvScale = new OglVec2(1, 1)
    const nextRect = new Float32Array([0, 0, 1, 1])
    const nextVisibleUv = new Float32Array([0, 0, 1, 1])
    const nextEffectMixUniform = { value: 1 }
    const nextSecondaryEffectMix = new Float32Array([0, 0, 0])
    const nextProgram = new OglProgram(nextGl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        tImage: { value: nextTexture },
        tRipple: { value: nextRippleSimulation.read.texture },
        tRippleSecondaryA: { value: nextRippleSimulation.read.texture },
        tRippleSecondaryB: { value: nextRippleSimulation.read.texture },
        tRippleSecondaryC: { value: nextRippleSimulation.read.texture },
        uUvScale: { value: nextUvScale },
        uRect: { value: nextRect },
        uVisibleUv: { value: nextVisibleUv },
        uRippleTexel: { value: nextRippleSimulation.texel },
        uEffectMix: nextEffectMixUniform,
        uOverlayOnly: { value: 1 },
        uSecondaryEffectMix: { value: nextSecondaryEffectMix },
      },
      depthTest: false,
      depthWrite: false,
      cullFace: false,
    })
    const nextMesh = new OglMesh(nextGl, {
      geometry: nextFullscreenGeometry,
      program: nextProgram,
    })

    renderer = nextRenderer
    gl = nextGl
    mediaTexture = nextTexture
    placeholderTexture = nextTexture
    textureFactory = (media) => new OglTexture(nextGl, {
      image: media,
      generateMipmaps: false,
      minFilter: nextGl.LINEAR,
      magFilter: nextGl.LINEAR,
      wrapS: nextGl.CLAMP_TO_EDGE,
      wrapT: nextGl.CLAMP_TO_EDGE,
    })
    mediaProgram = nextProgram
    mediaMesh = nextMesh
    rippleSimulation = nextRippleSimulation
    spareRippleSimulations = nextSpareRippleSimulations
    pointer = nextPointer
    uvScale = nextUvScale
    rectUniform = nextRect
    visibleUvUniform = nextVisibleUv
    effectMixUniform = nextEffectMixUniform
    secondaryEffectMixUniform = nextSecondaryEffectMix
    resizeRenderer()
    clearTrail()
    for (const simulation of spareRippleSimulations) clearTrail(simulation)
    // Program construction does not guarantee that the browser driver has
    // finished compiling both pipelines. Exercise one offscreen ripple pass
    // and one cleared media pass now, then wait for the GPU while this work is
    // still inside the idle warmup rather than the first pointer frame.
    updateRippleSimulation(nextRippleSimulation, 0)
    nextProgram.uniforms.tImage!.value = nextRippleSimulation.read.texture
    nextRenderer.render({ scene: nextMesh, clear: false })
    nextGl.finish()
    nextProgram.uniforms.tImage!.value = nextTexture
    clearTrail()
    clearCanvas()
    for (const media of decodedMediaAwaitingRenderer) enqueueTextureWarmup(media)
    decodedMediaAwaitingRenderer.clear()
  })().catch(() => {
    destroyRenderer()
  }).finally(() => {
    initialization = null
  })
  return initialization
}

async function ensureMediaReady(media: WaveMedia) {
  if (media instanceof HTMLImageElement) {
    if (media.complete && media.naturalWidth) return true
    try {
      await media.decode()
    } catch {
      return false
    }
    return Boolean(media.naturalWidth)
  }
  if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return true
  return await new Promise<boolean>((resolve) => {
    const done = () => resolve(media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
    media.addEventListener('loadeddata', done, { once: true })
    media.addEventListener('error', () => resolve(false), { once: true })
  })
}

function isMediaReady(media: WaveMedia) {
  return media instanceof HTMLImageElement
    ? media.complete && Boolean(media.naturalWidth)
    : media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
}

function updateTargetPointer(
  event: PointerEvent,
  media: WaveMedia,
  ancestors: ClipAncestor[],
  recordInput = false,
) {
  const bounds = media === activeMedia && activePointerBounds
    ? activePointerBounds
    : visibleMediaBounds(media, ancestors)
  if (bounds.width <= 0 || bounds.height <= 0) return
  const nextX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
  const nextY = Math.min(1, Math.max(0, 1 - (event.clientY - bounds.top) / bounds.height))
  if (recordInput) {
    const dx = nextX - targetPointerX
    const dy = nextY - targetPointerY
    const distance = Math.hypot(dx, dy)
    if (distance > 0.00001) {
      const now = performance.now()
      const rawElapsed = lastPointerEventTime ? now - lastPointerEventTime : 16.67
      const elapsed = lastPointerEventTime
        ? Math.min(50, Math.max(4, rawElapsed))
        : 16.67
      const pixelDistance = Math.hypot(dx * bounds.width, dy * bounds.height)
      const nextMotionStrength = motionStrengthForSpeed(pixelDistance / elapsed * 1000)
      // Use a time-based low-pass filter instead of following every OS pointer
      // sample. Straight movement then produces a stable force rather than a
      // slightly different deformation amplitude on every event.
      const speedSampleEase = lastPointerEventTime && rawElapsed < 120
        ? 1 - Math.exp(-rawElapsed / 58)
        : 1
      inputMotionStrength += (nextMotionStrength - inputMotionStrength) * speedSampleEase
      lastPointerInputTime = now
      lastPointerEventTime = now
    }
  }
  targetPointerX = nextX
  targetPointerY = nextY
}

function commitMediaActivation(media: WaveMedia, currentActivation: number) {
  if (
    currentActivation !== activationId
    || hoveredMedia !== media
    || !renderer
    || !pointer
    || !isMediaMotionStable(media)
  ) return

  if (activeMedia !== media) {
    const blendMode = mediaBlendMode(media)
    let returningWave: RetiringWave | null = null
    // The shared canvas has one CSS blend mode. A multiplied video cannot
    // safely share it with normal retiring images, so keep multi-tail overlap
    // for the regular case media and switch blended media cleanly.
    if (blendMode !== 'normal') {
      releaseRetiringWaves()
      releaseActiveMedia(false)
      clearTrail()
    }
    else if (!(returningWave = reactivateRetiringWave(media)) && !retireActiveWave()) {
      releaseActiveMedia(false)
      clearTrail()
    }
    activeMedia = media
    activeClipAncestors = hoveredClipAncestors
    if (!selectMediaTexture(media)) {
      releaseActiveMedia()
      return
    }
    const canvas = canvasEl.value
    const sourceNeedsHiding = blendMode !== 'normal'
    if (canvas) canvas.style.mixBlendMode = blendMode
    pointer.set(targetPointerX, targetPointerY)
    rippleSimulation?.previousMouse.set(targetPointerX, targetPointerY)
    if (rippleSimulation) rippleSimulation.impulse.value = 0
    trailEnergy = returningWave?.energy ?? 0
    effectMix = returningWave?.mix ?? 1
    if (effectMixUniform) effectMixUniform.value = effectMix
    simulationAccumulator = 0
    // A normal image can stay visible below the opaque shader output. Avoiding
    // an opacity toggle is important for the 222%-tall Audience parallax image:
    // rebuilding that large composited layer caused a hitch on every wake-up.
    // Media with blending still needs substitution to preserve its appearance.
    if (sourceNeedsHiding) {
      draw()
      if (activeMedia !== media) return
      media.classList.add('case-wave-media-active')
    }
    scheduleNearbyTextureWarmup(media)
  }
  requestRender()
}

function activateMedia(media: WaveMedia, event: PointerEvent) {
  if (!isMediaMotionStable(media)) return
  const resumesDormantHover = hoveredMedia === media && activeMedia !== media
  const reentersFadingField = activeMedia === media && hoveredMedia !== media
  const startsFreshGesture = resumesDormantHover || reentersFadingField
  if (activeMedia && activeMedia !== media && lastPointerInputTime) {
    const inputAge = Math.max(0, performance.now() - lastPointerInputTime)
    trailEnergy = Math.max(trailEnergy, inputMotionStrength * Math.exp(-inputAge / 58))
  }
  const currentActivation = ++activationId
  hoveredMedia = media
  hoveredClipAncestors = collectClipAncestors(media)
  lastPointerInputTime = 0
  // When a settled effect wakes while the pointer is still over the same
  // media, this event is real movement and must create the first ripple. The
  // old path discarded it and made the response visibly wait for event #2.
  lastPointerEventTime = startsFreshGesture ? performance.now() - 16.67 : 0
  inputMotionStrength = 0
  updateTargetPointer(event, media, hoveredClipAncestors, startsFreshGesture)

  if (reentersFadingField && rippleSimulation && pointer) {
    // Move the outgoing field into its own fade lane. The new gesture starts
    // flat, while draw() composites the old slope into the same image sample;
    // neither the fade nor the fresh response has to jump.
    const preservedOutgoingFade = retireActiveWave()
    if (!preservedOutgoingFade) clearTrail(rippleSimulation)
    pointer.set(targetPointerX, targetPointerY)
    rippleSimulation.previousMouse.set(targetPointerX, targetPointerY)
    rippleSimulation.impulse.value = 0
    trailEnergy = 0
    simulationAccumulator = 0
  }

  // Normal re-entry stays entirely synchronous: no Promise/microtask churn
  // when the user rapidly crosses the same group of already decoded images.
  if (renderer && isMediaReady(media)) {
    commitMediaActivation(media, currentActivation)
    return
  }

  void Promise.all([setupRenderer(), ensureMediaReady(media)]).then(() => {
    commitMediaActivation(media, currentActivation)
  })
}

function handlePointerOver(event: PointerEvent) {
  if (!mediaQuery?.matches || event.pointerType === 'touch') return
  const media = findMedia(event.target)
  if (media && media !== hoveredMedia) activateMedia(media, event)
}

function handlePointerMove(event: PointerEvent) {
  if (!mediaQuery?.matches || event.pointerType === 'touch') return
  const media = findMedia(event.target)
  if (!media) return
  if (media !== hoveredMedia || activeMedia !== media) {
    activateMedia(media, event)
    return
  }
  updateTargetPointer(event, media, hoveredClipAncestors, true)
  requestRender()
}

function handlePointerOut(event: PointerEvent) {
  const media = findMedia(event.target)
  if (!media || media !== hoveredMedia) return
  if (event.relatedTarget instanceof Node && media.contains(event.relatedTarget)) return
  activationId++
  hoveredMedia = null
  hoveredClipAncestors = []
  // Preserve the final motion sample. Its short freshness envelope now fades
  // exactly as it does when the pointer simply stops over the media.
  requestRender()
}

function handleResize() {
  if (!renderer) return
  clipAncestorCache = new WeakMap<WaveMedia, ClipAncestor[]>()
  if (activeMedia) activeClipAncestors = collectClipAncestors(activeMedia)
  if (hoveredMedia) hoveredClipAncestors = collectClipAncestors(hoveredMedia)
  resizeRenderer()
  requestRender()
}

function handleScroll(delta: number) {
  // The shared canvas follows active media through getBoundingClientRect() in
  // drawMedia(), so scrolling no longer clears the wave or blocks pointer
  // intent. Real movement switches the ripple to its lighter simulation mode
  // and pauses background texture uploads until the page settles.
  if (Math.abs(delta) < SCROLL_ACTIVITY_MIN_DELTA_PX) return
  scrolling = true
  requestRender()
  if (scrollIdleTimer) window.clearTimeout(scrollIdleTimer)
  scrollIdleTimer = window.setTimeout(() => {
    scrollIdleTimer = 0
    scrolling = false
    drainTextureWarmupQueue()
  }, SCROLL_WARMUP_RESUME_DELAY_MS)
}

function handleMediaPreferenceChange() {
  if (!mediaQuery?.matches) destroyRenderer()
}

function handleContextLost(event: Event) {
  event.preventDefault()
  destroyRenderer()
}

function destroyRenderer() {
  activationId++
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  if (textureWarmupIdle && window.cancelIdleCallback) window.cancelIdleCallback(textureWarmupIdle)
  else if (textureWarmupIdle) window.clearTimeout(textureWarmupIdle)
  textureWarmupIdle = 0
  if (rendererWarmupIdle && window.cancelIdleCallback) window.cancelIdleCallback(rendererWarmupIdle)
  else if (rendererWarmupIdle) window.clearTimeout(rendererWarmupIdle)
  rendererWarmupIdle = 0
  if (scrollIdleTimer) window.clearTimeout(scrollIdleTimer)
  scrollIdleTimer = 0
  scrolling = false
  mediaWarmupObserver?.disconnect()
  mediaWarmupObserver = null
  textureWarmupQueue.length = 0
  queuedTextureWarmups.clear()
  pendingMediaWarmups.clear()
  decodedMediaAwaitingRenderer.clear()
  releaseRetiringWaves()
  releaseActiveMedia()
  hoveredMedia = null

  if (gl) {
    for (const { texture } of textureCache.values()) gl.deleteTexture(texture.texture)
    textureCache.clear()
    if (placeholderTexture) gl.deleteTexture(placeholderTexture.texture)
    const simulations = new Set(
      [rippleSimulation, ...spareRippleSimulations]
        .filter((simulation): simulation is RippleSimulation => Boolean(simulation)),
    )
    const programs = new Set([...simulations].map(simulation => simulation.mesh.program))
    const geometries = new Set([...simulations].map(simulation => simulation.mesh.geometry))
    if (mediaProgram) programs.add(mediaProgram)
    if (mediaMesh) geometries.add(mediaMesh.geometry)
    for (const simulation of simulations) {
      gl.deleteTexture(simulation.read.texture.texture)
      gl.deleteTexture(simulation.write.texture.texture)
      gl.deleteFramebuffer(simulation.read.buffer)
      gl.deleteFramebuffer(simulation.write.buffer)
    }
    for (const program of programs) program.remove()
    for (const geometry of geometries) geometry.remove()
  }

  renderer = null
  gl = null
  mediaTexture = null
  placeholderTexture = null
  textureFactory = null
  mediaProgram = null
  mediaMesh = null
  rippleSimulation = null
  spareRippleSimulations = []
  retiringWaves = []
  pointer = null
  uvScale = null
  rectUniform = null
  visibleUvUniform = null
  effectMixUniform = null
  secondaryEffectMixUniform = null
  clipAncestorCache = new WeakMap<WaveMedia, ClipAncestor[]>()
  activeClipAncestors = []
  hoveredClipAncestors = []
  trailEnergy = 0
  effectMix = 1
  simulationAccumulator = 0
  lastFrameTime = 0
  lastPointerInputTime = 0
  lastPointerEventTime = 0
  inputMotionStrength = 0
}

onMounted(() => {
  scopeEl = canvasEl.value?.parentElement ?? null
  mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
  mediaQuery.addEventListener('change', handleMediaPreferenceChange)
  scopeEl?.addEventListener('pointerover', handlePointerOver)
  scopeEl?.addEventListener('pointermove', handlePointerMove)
  scopeEl?.addEventListener('pointerout', handlePointerOut)
  canvasEl.value?.addEventListener('webglcontextlost', handleContextLost)
  if (mediaQuery.matches && scopeEl) {
    // Compile OGL and both shaders away from the first hover/scroll frame.
    const warmRenderer = () => {
      rendererWarmupIdle = 0
      if (scrolling) {
        rendererWarmupIdle = window.requestIdleCallback
          ? window.requestIdleCallback(warmRenderer)
          : window.setTimeout(warmRenderer, 180)
        return
      }
      void setupRenderer()
    }
    rendererWarmupIdle = window.requestIdleCallback
      ? window.requestIdleCallback(warmRenderer)
      : window.setTimeout(warmRenderer, 250)

    // Network loading/decoding is owned by the case page. This observer only
    // uploads an already prepared raster into the shared GPU texture cache.
    mediaWarmupObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && isEligibleMedia(entry.target)) {
          warmTextureBeforeViewport(entry.target)
        }
      }
    }, { rootMargin: '160% 0px 160% 0px' })
    for (const media of scopeEl.querySelectorAll('img:not([data-wave-disabled])')) {
      if (isEligibleMedia(media)) mediaWarmupObserver.observe(media)
    }
  }
  stopMotionWatch = watch(motionActive, (active) => {
    if (active) return
    activationId++
    hoveredMedia = null
    hoveredClipAncestors = []
    releaseRetiringWaves()
    releaseActiveMedia()
  }, { immediate: true })
  stopRuntimeWatch = watch(
    [scrollRevision, resizeRevision],
    ([nextScroll, nextResize], [previousScroll, previousResize]) => {
      if (nextScroll !== previousScroll) handleScroll(scrollDelta.value)
      if (nextResize !== previousResize) handleResize()
    },
  )
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', handleMediaPreferenceChange)
  scopeEl?.removeEventListener('pointerover', handlePointerOver)
  scopeEl?.removeEventListener('pointermove', handlePointerMove)
  scopeEl?.removeEventListener('pointerout', handlePointerOut)
  canvasEl.value?.removeEventListener('webglcontextlost', handleContextLost)
  stopMotionWatch?.()
  stopMotionWatch = null
  stopRuntimeWatch?.()
  stopRuntimeWatch = null
  destroyRenderer()
  scopeEl = null
})
</script>

<template>
  <canvas ref="canvasEl" class="case-media-wave-layer" aria-hidden="true" />
</template>

<style scoped>
.case-media-wave-layer {
  position: fixed;
  z-index: 10;
  inset: 0;
  display: block;
  /* Match the window.innerWidth/innerHeight dimensions used by OGL exactly.
     100svh can differ by a few pixels and visibly stretch substituted media. */
  width: 100%;
  height: 100%;
  pointer-events: none;
}

:global(.case-wave-media-active) {
  opacity: 0 !important;
}
</style>
