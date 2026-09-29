<script setup lang="ts">
import heroSwarmWorkerUrl from '../workers/heroSwarm.worker.ts?worker&url'
import { flowSurfaceMask } from '~/composables/useFlowSurfaceMask'
import { isAppleTouchDevice } from '~/utils/mobileViewport'
import {
  swarmHapticConfirm,
  swarmHapticContact,
  swarmHapticDisable,
  swarmHapticIsArmed,
  swarmHapticRelease,
  swarmHapticReset,
} from '~/utils/swarmHaptics'

const MOTION_INTRO_COOKIE = 'kado_motion_intro'
const MOTION_INTRO_MAX_AGE = 60 * 60 * 24 * 7
const MOTION_INTRO_DURATION_MS = 10000
const MOTION_INTRO_HIDE_MORPH = 0.15
const GYRO_CALIBRATION_SAMPLES = 24
const GYRO_TIP_ANGLE = 22
const GYRO_DEAD_ZONE = 0.075

const props = withDefaults(
  defineProps<{
    active?: boolean
    controlsReady?: boolean
    overlayInsetX?: number
    overlayInsetY?: number
  }>(),
  { active: true, controlsReady: true, overlayInsetX: 0, overlayInsetY: 0 },
)

const emit = defineEmits<{
  booted: []
  lit: []
  failed: []
}>()

const { t } = useI18n()
const assetUrl = useCdnAsset()
const canvas = ref<HTMLCanvasElement | null>(null)
const motionIntroTimerEl = ref<HTMLElement | null>(null)
const isAndroidClient = ref(false)
const isIosClient = ref(false)
const androidHapticEnabled = ref(false)
const motionIntroVisible = ref(false)
const motionIntroInHero = ref(false)
const motionIntroSceneBottomSeen = ref(false)
const motionIntroViewportTop = ref(0)
const motionIntroViewportBottom = ref(0)
const motionIntroPageVisible = ref(true)
const motionIntroComponentActive = ref(true)
let worker: Worker | null = null
let resizeObserver: ResizeObserver | null = null
let removeMotionListeners: (() => void) | null = null
let motionIntroHeroObserver: IntersectionObserver | null = null
let resizeTimer = 0
let activationFrame = 0
let failed = false
let keepAliveActive = true
let motionIntroElapsedMs = 0
let motionIntroTimerStartedAt: number | null = null
let motionIntroTimerRaf = 0
const gravityNeutral = { roll: 0, pitch: 0, samples: 0 }
const orientationNeutral = { roll: 0, pitch: 0, samples: 0 }
let tipFromGravity = false
let tipGravityStamp = 0

const motionOverlayStyle = computed<Record<string, string>>(() => ({
  '--motion-scene-inset-x': `${Math.max(0, props.overlayInsetX)}px`,
  '--motion-scene-inset-y': `${Math.max(0, props.overlayInsetY)}px`,
}))
const motionIntroText = computed(() => isAndroidClient.value
  ? t('accessibility.enableGyroscopeAndVibrationHint')
  : t('accessibility.enableGyroscopeHint'))
const motionIntroShown = computed(() => (
  motionIntroVisible.value
  && motionIntroInHero.value
  && motionIntroSceneBottomSeen.value
  && flowSurfaceMask.morph < MOTION_INTRO_HIDE_MORPH
  && motionIntroPageVisible.value
  && motionIntroComponentActive.value
  && props.active
  && props.controlsReady
))

const textureUrls = {
  whiteMatte: assetUrl('/textures/hero-matcap-white-matte.webp'),
  whiteSoft: assetUrl('/textures/hero-matcap-white-soft.webp'),
  whiteFrosted: assetUrl('/textures/hero-matcap-white-frosted.webp'),
  blackGloss: assetUrl('/textures/hero-matcap-black-gloss.webp'),
  blackMatte: assetUrl('/textures/hero-matcap-black-matte.webp'),
}

function postSize() {
  const el = canvas.value
  if (!el || !worker || !keepAliveActive) return false
  const box = el.getBoundingClientRect()
  // KeepAlive parks Home in a hidden container between routes. Its observer can
  // report 0 x 0 there; forwarding the clamped 1 x 1 size makes the worker
  // rebuild the orbit at a huge world scale and can leave its visible centre far
  // off-axis when Home is restored.
  if (box.width < 2 || box.height < 2) return false
  worker.postMessage({
    type: 'resize',
    width: Math.round(box.width),
    height: Math.round(box.height),
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1),
  })
  return true
}

function effectiveActive() {
  return keepAliveActive && props.active
}

function syncWorkerActivity() {
  worker?.postMessage({ type: 'active', active: effectiveActive() })
}

function restoreAfterActivation(attempt = 0) {
  cancelAnimationFrame(activationFrame)
  activationFrame = requestAnimationFrame(() => {
    activationFrame = 0
    if (!keepAliveActive) return
    if (!postSize() && attempt < 3) {
      restoreAfterActivation(attempt + 1)
      return
    }
    syncWorkerActivity()
  })
}

function hasMotionIntroCookie() {
  return document.cookie
    .split(';')
    .some(part => part.trim().startsWith(`${MOTION_INTRO_COOKIE}=`))
}

function rememberMotionIntro() {
  document.cookie = `${MOTION_INTRO_COOKIE}=1; Max-Age=${MOTION_INTRO_MAX_AGE}; Path=/; SameSite=Lax`
}

function syncMotionIntroViewport() {
  const viewport = window.visualViewport
  motionIntroViewportTop.value = viewport?.offsetTop ?? 0
  motionIntroViewportBottom.value = motionIntroViewportTop.value
    + (viewport?.height ?? window.innerHeight)
}

function syncMotionIntroHero() {
  const hero = document.querySelector<HTMLElement>('.hero')
  if (!hero) {
    motionIntroInHero.value = window.scrollY <= 2
    return
  }
  const box = hero.getBoundingClientRect()
  motionIntroInHero.value = box.bottom > 0 && box.top < window.innerHeight
}

function syncMotionIntroPageVisibility() {
  motionIntroPageVisible.value = document.visibilityState !== 'hidden'
}

function observeMotionIntroHero() {
  motionIntroHeroObserver?.disconnect()
  const hero = document.querySelector<HTMLElement>('.hero')
  if (!hero) {
    syncMotionIntroHero()
    return
  }
  motionIntroHeroObserver = new IntersectionObserver(([entry]) => {
    if (entry) motionIntroInHero.value = entry.isIntersecting
  }, { threshold: 0.01 })
  motionIntroHeroObserver.observe(hero)
  syncMotionIntroHero()
}

function motionIntroElapsedAt(now: number) {
  return Math.min(MOTION_INTRO_DURATION_MS, motionIntroElapsedMs
    + (motionIntroTimerStartedAt === null ? 0 : Math.max(0, now - motionIntroTimerStartedAt)))
}

function pauseMotionIntroTimer() {
  motionIntroElapsedMs = motionIntroElapsedAt(performance.now())
  motionIntroTimerStartedAt = null
  cancelAnimationFrame(motionIntroTimerRaf)
  motionIntroTimerRaf = 0
}

function paintMotionIntroTimer(now: number) {
  motionIntroTimerRaf = 0
  const elapsed = motionIntroElapsedAt(now)
  if (motionIntroTimerEl.value) {
    motionIntroTimerEl.value.style.transform = `scaleX(${elapsed / MOTION_INTRO_DURATION_MS})`
  }
  if (elapsed >= MOTION_INTRO_DURATION_MS) {
    motionIntroVisible.value = false
    return
  }
  if (motionIntroShown.value) motionIntroTimerRaf = requestAnimationFrame(paintMotionIntroTimer)
}

watch(motionIntroShown, (shown) => {
  pauseMotionIntroTimer()
  if (!shown) return
  motionIntroTimerStartedAt = performance.now()
  paintMotionIntroTimer(motionIntroTimerStartedAt)
}, { flush: 'sync' })

watch(
  () => !motionIntroSceneBottomSeen.value
    && motionIntroVisible.value
    && flowSurfaceMask.morph < MOTION_INTRO_HIDE_MORPH
    && props.active
    && props.controlsReady
    && flowSurfaceMask.height > 2
    && flowSurfaceMask.top + flowSurfaceMask.height > motionIntroViewportTop.value
    && flowSurfaceMask.top + flowSurfaceMask.height <= motionIntroViewportBottom.value,
  (visible) => {
    if (visible) motionIntroSceneBottomSeen.value = true
  },
  { immediate: true },
)

function startMotionListeners() {
  if (removeMotionListeners) return
  const filterGyroTip = (value: number) => {
    const magnitude = Math.abs(value)
    if (magnitude <= GYRO_DEAD_ZONE) return 0
    return Math.sign(value) * Math.min(
      1,
      (magnitude - GYRO_DEAD_ZONE) / (1 - GYRO_DEAD_ZONE),
    )
  }
  const updateGyroTip = (
    rawRoll: number,
    rawPitch: number,
    neutral: { roll: number; pitch: number; samples: number },
  ) => {
    if (neutral.samples < GYRO_CALIBRATION_SAMPLES) {
      neutral.samples += 1
      const weight = 1 / neutral.samples
      neutral.roll += (rawRoll - neutral.roll) * weight
      neutral.pitch += (rawPitch - neutral.pitch) * weight
      worker?.postMessage({ type: 'motion', pitch: 0, roll: 0 })
      return
    }
    worker?.postMessage({
      type: 'motion',
      roll: filterGyroTip(Math.max(-1, Math.min(1, rawRoll - neutral.roll))),
      pitch: filterGyroTip(Math.max(-1, Math.min(1, rawPitch - neutral.pitch))),
    })
  }

  const onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return
    const gravityFresh = tipFromGravity && performance.now() - tipGravityStamp < 250
    if (gravityFresh) return
    updateGyroTip(
      event.gamma / GYRO_TIP_ANGLE,
      -event.beta / GYRO_TIP_ANGLE,
      orientationNeutral,
    )
  }

  const onMotion = (event: DeviceMotionEvent) => {
    const gravity = event.accelerationIncludingGravity
    if (!gravity || gravity.x === null || gravity.y === null) return
    updateGyroTip(gravity.x / 9.81, gravity.y / 9.81, gravityNeutral)
    tipFromGravity = true
    tipGravityStamp = performance.now()
  }

  window.addEventListener('deviceorientation', onOrientation, { passive: true })
  window.addEventListener('devicemotion', onMotion, { passive: true })
  removeMotionListeners = () => {
    window.removeEventListener('deviceorientation', onOrientation)
    window.removeEventListener('devicemotion', onMotion)
  }
}

async function enableMotionFromGesture() {
  const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
  }
  const DME = DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
  }
  if (!window.isSecureContext && (
    typeof DOE.requestPermission === 'function'
    || typeof DME.requestPermission === 'function'
  )) return

  const permissions: Promise<string>[] = []
  try {
    if (typeof DOE.requestPermission === 'function') permissions.push(DOE.requestPermission())
    if (typeof DME.requestPermission === 'function') permissions.push(DME.requestPermission())
  } catch {
    return
  }
  if (!permissions.length) {
    startMotionListeners()
    return
  }
  const results = await Promise.allSettled(permissions)
  if (results.some(result => result.status === 'fulfilled' && result.value === 'granted')) {
    startMotionListeners()
  }
}

function onMotionIntroTap() {
  if (!motionIntroShown.value) return
  rememberMotionIntro()
  motionIntroVisible.value = false
  swarmHapticReset()
  if (isAndroidClient.value) androidHapticEnabled.value = swarmHapticConfirm()
  void enableMotionFromGesture()
}

function onHapticControlTap() {
  if (androidHapticEnabled.value) {
    swarmHapticDisable()
    androidHapticEnabled.value = false
    return
  }
  androidHapticEnabled.value = swarmHapticConfirm()
}

onMounted(() => {
  isIosClient.value = isAppleTouchDevice()
  isAndroidClient.value = /Android/i.test(navigator.userAgent)
  androidHapticEnabled.value = isAndroidClient.value && swarmHapticIsArmed()
  motionIntroVisible.value = (isAndroidClient.value || isIosClient.value)
    && !hasMotionIntroCookie()
  syncMotionIntroViewport()
  window.addEventListener('resize', syncMotionIntroViewport, { passive: true })
  window.visualViewport?.addEventListener('resize', syncMotionIntroViewport, { passive: true })
  window.visualViewport?.addEventListener('scroll', syncMotionIntroViewport, { passive: true })
  syncMotionIntroPageVisibility()
  document.addEventListener('visibilitychange', syncMotionIntroPageVisibility)
  observeMotionIntroHero()
  // Android exposes sensors without a prompt. iOS must wait for the hint tap so
  // requestPermission remains inside the user gesture.
  if (!isIosClient.value) startMotionListeners()
  const el = canvas.value
  if (!el || typeof el.transferControlToOffscreen !== 'function') return
  const box = el.getBoundingClientRect()
  const fail = () => {
    if (failed) return
    failed = true
    emit('failed')
  }
  // Nuxt's app CDN may resolve the emitted worker chunk to another origin.
  // Worker entry scripts must be same-origin, while the deployment mirrors all
  // hashed `/_nuxt/` files on kadonext.com specifically for cases like this.
  const bundledWorkerUrl = new URL(heroSwarmWorkerUrl, window.location.href)
  const sameOriginWorkerUrl = new URL(
    `${bundledWorkerUrl.pathname}${bundledWorkerUrl.search}${bundledWorkerUrl.hash}`,
    window.location.origin,
  )
  try {
    worker = new Worker(sameOriginWorkerUrl, { type: 'module' })
  } catch {
    fail()
    return
  }
  let offscreen: OffscreenCanvas
  try {
    offscreen = el.transferControlToOffscreen()
  } catch {
    worker.terminate()
    worker = null
    fail()
    return
  }
  worker.onerror = fail
  worker.onmessage = (event: MessageEvent<{
    type: string
    pairKey?: number
    overlap?: number
  }>) => {
    if (event.data.type === 'booted') emit('booted')
    if (event.data.type === 'lit') emit('lit')
    if (event.data.type === 'error') fail()
    if (
      event.data.type === 'haptic-contact'
      && event.data.pairKey !== undefined
      && event.data.overlap !== undefined
    ) {
      swarmHapticContact(event.data.pairKey, event.data.overlap)
    }
    if (event.data.type === 'haptic-release' && event.data.pairKey !== undefined) {
      swarmHapticRelease(event.data.pairKey)
    }
  }
  worker.postMessage({
    type: 'init',
    canvas: offscreen,
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1),
    textures: textureUrls,
  }, [offscreen])
  syncWorkerActivity()
  resizeObserver = new ResizeObserver(() => {
    if (!keepAliveActive || resizeTimer) return
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0
      if (postSize()) syncWorkerActivity()
    }, 32)
  })
  resizeObserver.observe(el)
})

watch(
  () => props.active,
  syncWorkerActivity,
)

onDeactivated(() => {
  keepAliveActive = false
  motionIntroComponentActive.value = false
  cancelAnimationFrame(activationFrame)
  activationFrame = 0
  worker?.postMessage({ type: 'active', active: false })
})

onActivated(() => {
  keepAliveActive = true
  motionIntroComponentActive.value = true
  // FlowSurfaceHost restores the kept-alive frame in its own activation pass.
  // Re-read the canvas on the following paint, then resume with the corrected
  // projection/orbit instead of drawing one frame from the parked geometry.
  restoreAfterActivation()
})

onUnmounted(() => {
  pauseMotionIntroTimer()
  window.removeEventListener('resize', syncMotionIntroViewport)
  window.visualViewport?.removeEventListener('resize', syncMotionIntroViewport)
  window.visualViewport?.removeEventListener('scroll', syncMotionIntroViewport)
  document.removeEventListener('visibilitychange', syncMotionIntroPageVisibility)
  motionIntroHeroObserver?.disconnect()
  motionIntroHeroObserver = null
  cancelAnimationFrame(activationFrame)
  activationFrame = 0
  if (resizeTimer) window.clearTimeout(resizeTimer)
  resizeObserver?.disconnect()
  resizeObserver = null
  removeMotionListeners?.()
  removeMotionListeners = null
  worker?.postMessage({ type: 'dispose' })
  worker?.terminate()
  worker = null
  failed = false
})
</script>

<template>
  <div class="hero-swarm-worker-root size-full" :style="motionOverlayStyle">
    <div class="hero-swarm-worker-backdrop pointer-events-none absolute inset-0" />
    <canvas
      ref="canvas"
      class="hero-swarm-worker-canvas relative z-[1] size-full"
      aria-hidden="true"
    />

    <Teleport to="#hero-motion-controls">
      <div class="hero-swarm-controls size-full" :style="motionOverlayStyle">
        <button
          v-if="isAndroidClient && props.active"
          type="button"
          class="motion-control motion-control--haptic"
          :class="{
            'motion-control--active': androidHapticEnabled,
            'motion-control--entry-hidden': !props.controlsReady,
          }"
          :aria-label="androidHapticEnabled ? t('accessibility.disableVibration') : t('accessibility.enableVibration')"
          :aria-pressed="androidHapticEnabled"
          @click="onHapticControlTap"
        >
          <SiteIcon
            name="device-mobile-vibration"
            class="motion-control__icon motion-control__icon--haptic"
          />
        </button>

        <Transition name="motion-intro">
          <button
            v-if="motionIntroVisible"
            type="button"
            class="motion-intro"
            :class="{ 'motion-intro--hidden': !motionIntroShown }"
            :inert="!motionIntroShown"
            :aria-hidden="!motionIntroShown"
            :style="{ '--motion-intro-control-space': isAndroidClient ? '50.5px' : '0px' }"
            @click="onMotionIntroTap"
          >
            <span ref="motionIntroTimerEl" class="motion-intro__timer" aria-hidden="true" />
            <span class="motion-intro__content">
              <img
                class="motion-intro__icon"
                :src="assetUrl('/svg/phone-tilt-css.svg')"
                alt=""
                width="30"
                height="40"
              >
              <span class="motion-intro__text">{{ motionIntroText }}</span>
            </span>
          </button>
        </Transition>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.hero-swarm-worker-root {
  position: relative;
}

.hero-swarm-worker-backdrop {
  background: var(--hero-scene-forest);
}

.hero-swarm-worker-canvas {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  touch-action: pan-y;
}

.hero-swarm-worker-root.hero-swarm--cold .hero-swarm-worker-canvas {
  opacity: 0;
}

.hero-swarm-controls {
  position: relative;
}

.motion-control {
  position: absolute;
  z-index: 6;
  display: grid;
  place-items: center;
  width: 42.5px;
  height: 42.5px;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  color: #fff;
  background-color: var(--palette-ink);
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.motion-control--entry-hidden {
  opacity: 0;
  pointer-events: none;
}

.motion-control__icon--haptic {
  display: block;
  width: 24px;
  height: 24px;
  opacity: 1;
}

.motion-control--haptic {
  left: calc(var(--motion-scene-inset-x, 0px) + var(--layout-margin) + var(--safe-left, 0px));
  bottom: calc(var(--motion-scene-inset-y, 0px) + var(--layout-margin) + var(--safe-bottom, 0px));
}

.motion-control--haptic::after {
  position: absolute;
  width: 28px;
  height: 1.5px;
  background: currentColor;
  content: '';
  opacity: 0.82;
  transform: rotate(-45deg) scaleX(1);
  transition:
    opacity 0.24s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.motion-control--haptic.motion-control--active::after {
  opacity: 0;
  transform: rotate(-45deg) scaleX(0.35);
}

.motion-intro {
  position: absolute;
  left: calc(var(--motion-scene-inset-x, 0px) + var(--layout-margin) + var(--safe-left, 0px) + var(--motion-intro-control-space, 0px));
  bottom: calc(var(--motion-scene-inset-y, 0px) + var(--layout-margin) + var(--safe-bottom, 0px));
  z-index: 7;
  width: max-content;
  max-width: min(19rem, calc(100% - 2 * var(--motion-scene-inset-x, 0px) - 2 * var(--layout-margin) - var(--safe-left, 0px) - var(--safe-right, 0px) - var(--motion-intro-control-space, 0px)));
  overflow: hidden;
  padding: 0.75rem 0.875rem;
  border: 0;
  border-radius: 0.75rem;
  background: var(--palette-ink);
  color: #fff;
  cursor: pointer;
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.2s ease;
}

.motion-intro--hidden {
  opacity: 0;
  pointer-events: none;
}

.motion-intro__timer {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--palette-ink) 90%, #fff);
  transform: scaleX(0);
  transform-origin: left center;
  pointer-events: none;
}

.motion-intro-enter-active,
.motion-intro-leave-active {
  transition: opacity 0.2s ease;
}

.motion-intro-enter-from,
.motion-intro-leave-to {
  opacity: 0;
}

.motion-intro-leave-active {
  pointer-events: none;
}

.motion-intro__content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.motion-intro__icon {
  display: block;
  width: auto;
  height: 2.5rem;
  flex-shrink: 0;
}

.motion-intro__text {
  font-family: var(--font-sans);
  font-size: calc(var(--type-nav) * 0.875);
  font-weight: 400;
  line-height: 1.35;
  letter-spacing: -0.01em;
  text-align: left;
}
</style>
