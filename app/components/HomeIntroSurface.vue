<script setup lang="ts">
const props = defineProps<{
  targetEl?: HTMLElement | null
  surfaceReady?: boolean
}>()

const route = useRoute()
const initialHomeDocument = useState<boolean>('initial-home-document', () => false)
const gate = useHomeIntroGate()
const overlayEl = ref<HTMLElement | null>(null)
const handedOff = ref(false)
const logoVisible = ref(true)

const active = computed(() => (
  initialHomeDocument.value
  && !route.hash
  && !gate.unlocked.value
  && !handedOff.value
))

const INTRO_HOLD_MS = 120
const INTRO_MOVE_MS = 640
let mountedAt = 0
let animation: Animation | null = null
let headerTimer = 0
let contentTimer = 0
let logoTimer = 0
let animationGeneration = 0

function insetClipFor(rect: DOMRect, radius: number) {
  const top = Math.max(0, rect.top)
  const right = Math.max(0, window.innerWidth - rect.right)
  const bottom = Math.max(0, window.innerHeight - rect.bottom)
  const left = Math.max(0, rect.left)
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`
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
    || animation
  ) return

  const generation = ++animationGeneration
  const rect = target.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return

  const targetStyle = getComputedStyle(target)
  const radius = Number.parseFloat(targetStyle.borderTopLeftRadius) || 24
  const destinationClip = insetClipFor(rect, radius)
  const elapsed = performance.now() - mountedAt
  const delay = Math.max(0, INTRO_HOLD_MS - elapsed)

  headerTimer = window.setTimeout(
    () => gate.markHeaderReady(),
    delay + INTRO_MOVE_MS * 0.48,
  )
  contentTimer = window.setTimeout(
    () => gate.markContentReady(),
    delay + INTRO_MOVE_MS * 0.7,
  )
  logoTimer = window.setTimeout(() => {
    logoVisible.value = false
  }, delay + INTRO_MOVE_MS * 0.4)

  animation = overlay.animate(
    [
      { clipPath: 'inset(0px 0px 0px 0px round 0px)' },
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

  // Commit the final crop, then remove the intro layer in one painted frame.
  // The measured live Surface is already directly underneath it.
  overlay.style.clipPath = destinationClip
  animation = null
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (generation !== animationGeneration) return
  handedOff.value = true
  gate.markIntroSettled()
}

watch(
  [
    () => props.targetEl,
    () => props.surfaceReady,
    gate.started,
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
  if (headerTimer) window.clearTimeout(headerTimer)
  headerTimer = 0
  if (contentTimer) window.clearTimeout(contentTimer)
  contentTimer = 0
  if (logoTimer) window.clearTimeout(logoTimer)
  logoTimer = 0
})
</script>

<template>
  <div
    v-if="active"
    ref="overlayEl"
    class="home-intro-surface"
    aria-hidden="true"
  >
    <div class="home-intro-surface__grain" />
    <img
      v-if="logoVisible"
      class="home-intro-surface__logo"
      src="/brand/kado-logo.svg"
      alt=""
      width="81"
      height="27"
      decoding="async"
    >
  </div>
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

.home-intro-surface__logo {
  position: absolute;
  top: 50%;
  left: 50%;
  width: clamp(240px, 22vw, 368px);
  height: auto;
  object-fit: contain;
  filter: brightness(0) invert(1);
  transform: translate(-50%, -50%);
}
</style>
