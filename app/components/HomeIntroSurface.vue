<script setup lang="ts">
import { isCoarsePointer, isNarrowViewport } from '~/utils/mobileViewport'

const props = defineProps<{
  targetEl?: HTMLElement | null
  surfaceReady?: boolean
}>()

const { locale } = useI18n()
const assetUrl = useCdnAsset()
const grainStyle = computed(() => ({
  backgroundImage: `image-set(url("${assetUrl('/textures/grain-tile-v2-256.avif')}") type("image/avif"), url("${assetUrl('/textures/grain-tile-v2-256.webp')}") type("image/webp"))`,
}))
const initialHomeDocument = useState<boolean>('initial-home-document', () => false)
const gate = useHomeIntroGate()
const heroWebglBooted = useState<boolean>('home-hero-webgl-booted', () => false)
const overlayEl = ref<HTMLElement | null>(null)
const logoEl = ref<HTMLImageElement | null>(null)
const handedOff = ref(false)
const logoAsset = computed(() => (
  locale.value === 'en'
    ? assetUrl('/brand/kado-logo-en-intro.svg')
    : assetUrl('/brand/kado-logo-intro.svg')
))

const active = computed(() => (
  initialHomeDocument.value
  && !gate.unlocked.value
  && !handedOff.value
))

const INTRO_HOLD_MS = 120
const INTRO_MOVE_MS = 640
const INTRO_HANDOFF_MS = 120
let mountedAt = 0
let animation: Animation | null = null
let logoAnimation: Animation | null = null
let logoDecodePromise: Promise<void> | null = null
let animationGeneration = 0

type IntroRect = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'>

function unionRect(a: IntroRect, b: IntroRect): IntroRect {
  const top = Math.min(a.top, b.top)
  const right = Math.max(a.right, b.right)
  const bottom = Math.max(a.bottom, b.bottom)
  const left = Math.min(a.left, b.left)
  return {
    top,
    right,
    bottom,
    left,
    width: right - left,
    height: bottom - top,
  }
}

function insetClipFor(container: IntroRect, rect: IntroRect, radius: number) {
  const top = Math.max(0, rect.top - container.top)
  const right = Math.max(0, container.right - rect.right)
  const bottom = Math.max(0, container.bottom - rect.bottom)
  const left = Math.max(0, rect.left - container.left)
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`
}

function useDirectMobileHandoff() {
  return isNarrowViewport() || isCoarsePointer()
}

function waitsForDesktopWebglBoot() {
  if (useDirectMobileHandoff()) return false
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean }
  }).connection
  return !connection?.saveData && !heroWebglBooted.value
}

async function prepareLogo() {
  const logo = logoEl.value
  if (!logo || typeof logo.decode !== 'function') return
  logoDecodePromise ??= logo.decode().catch(() => undefined)
  await logoDecodePromise
}

async function runIntro() {
  const overlay = overlayEl.value
  const target = props.targetEl
  if (
    !overlay
    || !target
    || !props.surfaceReady
    || !gate.started.value
    || gate.unlocked.value
    || waitsForDesktopWebglBoot()
    || animation
  ) return

  const generation = ++animationGeneration
  // Decode and rasterize the dedicated white SVG while the intro is static.
  // The logo is a sibling of the clipped surface, so its animation cannot
  // invalidate the surface's clip-path layer.
  await prepareLogo()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (
    generation !== animationGeneration
    || !overlayEl.value
    || !props.targetEl
    || gate.unlocked.value
  ) return

  const viewportRect = overlay.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  if (targetRect.width < 2 || targetRect.height < 2) return

  // A portrait mobile Hero can continue below the viewport. The old mask was
  // constrained to the viewport-sized intro node, so it invented a rounded
  // bottom at the screen edge instead of becoming the real Surface rectangle.
  // Expand the mask canvas to the union of both boxes, then crop that canvas
  // from the viewport to the complete target geometry.
  const animationRect = unionRect(viewportRect, targetRect)
  overlay.style.inset = 'auto'
  overlay.style.top = `${animationRect.top}px`
  overlay.style.left = `${animationRect.left}px`
  overlay.style.width = `${animationRect.width}px`
  overlay.style.height = `${animationRect.height}px`

  const targetStyle = getComputedStyle(target)
  const radius = Number.parseFloat(targetStyle.borderTopLeftRadius) || 24
  const initialClip = insetClipFor(animationRect, viewportRect, 0)
  const destinationClip = insetClipFor(animationRect, targetRect, radius)
  const elapsed = performance.now() - mountedAt
  const delay = Math.max(0, INTRO_HOLD_MS - elapsed)

  if (logoEl.value) {
    const mobile = useDirectMobileHandoff()
    const restingTransform = 'translate3d(-50%, -50%, 0)'
    const liftedTransform = `${restingTransform} translate3d(0, -44px, 0)`
    logoAnimation?.cancel()
    logoAnimation = logoEl.value.animate(
      mobile
        ? [
            { opacity: 1, transform: restingTransform, offset: 0 },
            { opacity: 1, transform: restingTransform, offset: 0.22 },
            { opacity: 0, transform: liftedTransform, offset: 0.5 },
            { opacity: 0, transform: liftedTransform, offset: 1 },
          ]
        : [
            { opacity: 1, offset: 0 },
            { opacity: 1, offset: 0.3 },
            { opacity: 0, offset: 0.46 },
            { opacity: 0, offset: 1 },
          ],
      {
        duration: INTRO_MOVE_MS,
        delay,
        easing: 'linear',
        fill: 'forwards',
      },
    )
  }

  animation = overlay.animate(
    [
      { clipPath: initialClip },
      { clipPath: destinationClip },
    ],
    {
      duration: INTRO_MOVE_MS,
      delay,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    },
  )

  try {
    await animation.finished
  } catch {
    return
  }
  if (generation !== animationGeneration || !overlayEl.value) return

  // Commit the exact crop. Mobile performs a direct ownership handoff once the
  // live scene is paint-ready; desktop keeps the softer texture dissolve.
  overlay.style.clipPath = destinationClip
  animation = null
  if (useDirectMobileHandoff()) {
    // Mobile has no opacity handoff: commit the target crop for one frame, then
    // release it. WebGL readiness remains independent and cannot dead-lock the
    // actual Surface behind an opaque placeholder.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    if (generation !== animationGeneration) return
    handedOff.value = true
    gate.markIntroSettled()
    return
  }

  animation = overlay.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    {
      duration: INTRO_HANDOFF_MS,
      easing: 'linear',
      fill: 'forwards',
    },
  )
  try {
    await animation.finished
  } catch {
    return
  }
  if (generation !== animationGeneration) return
  animation = null
  handedOff.value = true
  gate.markIntroSettled()
}

watch(
  [
    () => props.targetEl,
    () => props.surfaceReady,
    gate.started,
    heroWebglBooted,
  ],
  () => void nextTick(runIntro),
  { immediate: true, flush: 'post' },
)

onMounted(() => {
  mountedAt = performance.now()
  void nextTick(runIntro)
})

onUnmounted(() => {
  animationGeneration += 1
  animation?.cancel()
  animation = null
  logoAnimation?.cancel()
  logoAnimation = null
  logoDecodePromise = null
})
</script>

<template>
  <div
    v-if="active"
    ref="overlayEl"
    class="home-intro-surface"
    aria-hidden="true"
  >
    <div class="home-intro-surface__grain" :style="grainStyle" />
  </div>
  <img
    v-if="active"
    ref="logoEl"
    class="home-intro-logo"
    :src="logoAsset"
    alt=""
    width="81"
    height="27"
    decoding="async"
    fetchpriority="high"
    aria-hidden="true"
  >
</template>

<style scoped>
.home-intro-surface {
  position: fixed;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  pointer-events: none;
  background: var(--hero-scene-forest);
  clip-path: inset(0 round 0);
  will-change: clip-path;
}

.home-intro-surface__grain {
  position: absolute;
  inset: 0;
  background-image: image-set(
    url('/textures/grain-tile-v2-256.avif') type('image/avif'),
    url('/textures/grain-tile-v2-256.webp') type('image/webp')
  );
  background-repeat: repeat;
  background-size: 224px 224px;
  opacity: 0.2;
  mix-blend-mode: soft-light;
}

@media (max-width: 767.98px) {
  .home-intro-surface__grain {
    background-size: 176px 176px;
  }
}

.home-intro-logo {
  position: fixed;
  z-index: 7;
  top: 50%;
  left: 50%;
  width: clamp(240px, 22vw, 368px);
  height: auto;
  pointer-events: none;
  object-fit: contain;
  transform: translate3d(-50%, -50%, 0);
  will-change: opacity, transform;
}
</style>
