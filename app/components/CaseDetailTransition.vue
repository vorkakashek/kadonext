<script setup lang="ts">
import gsap from 'gsap'
import { warmCaseDetailRoute } from '~/utils/caseDetailRouteWarmup'

const router = useRouter()
const {
  request,
  active,
  origin,
  revealDetailContent,
  completeCaseDetailEntry,
  completeCaseDetailExit,
  completeDetailOpen,
  markHomeReturnMediaDocked,
  completeDetailReturn,
} = useCaseDetailTransition()
const rootEl = ref<HTMLElement | null>(null)
const backdropEl = ref<HTMLElement | null>(null)
const frameEl = ref<HTMLElement | null>(null)
const imageEl = ref<HTMLImageElement | null>(null)
const visible = ref(false)
const wash = ref('#0a0a0a')
const src = ref('')
const webpSrcset = ref('')
const avifSrcset = ref('')
const mobileSrc = ref('')
const mobileWebpSrcset = ref('')
const mobileAvifSrcset = ref('')
const alt = ref('')

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

type TransitionBox = { top: number; left: number; width: number; height: number }
type ImagePose = { x: number; y: number; scale: number; width: number; height: number }

const OPEN_FILL_DURATION = 0.54
const OPEN_OVERSHOOT_DURATION = 0.62
const OPEN_OVERSHOOT_SCALE = 1.15
const RETURN_FLIGHT_DURATION = 0.72
const HOME_CORNER_CORRIDOR = 0.2

function homeMediaRadius(target: HTMLElement) {
  const clip = target.querySelector<HTMLElement>('[data-case-local-media]') ?? target
  return Number.parseFloat(getComputedStyle(clip).borderTopLeftRadius) || 0
}

function setFrameRadius(frame: HTMLElement, radius: number) {
  // Clip the composited image explicitly, rather than relying on overflow's
  // rounded border to mask its independently transformed raster.
  const mask = `inset(0px round ${radius}px)`
  frame.style.clipPath = mask
  frame.style.webkitClipPath = mask
}

function animateHomeCorners(
  timeline: gsap.core.Timeline,
  frame: HTMLElement,
  radius: number,
  duration: number,
  opening: boolean,
) {
  const route = { progress: 0 }
  timeline.to(route, {
    progress: 1,
    duration,
    ease: 'power3.inOut',
    onUpdate: () => {
      // Follow the same eased geometry as the photo, not elapsed time.
      const cornerProgress = opening
        ? 1 - Math.min(1, route.progress / HOME_CORNER_CORRIDOR)
        : Math.max(0, (route.progress - (1 - HOME_CORNER_CORRIDOR)) / HOME_CORNER_CORRIDOR)
      setFrameRadius(frame, radius * cornerProgress)
    },
  }, 0)
}

/** Uniformly fit the decoded raster behind a clipped box without resizing it. */
function coverPose(
  image: HTMLImageElement,
  box: TransitionBox,
  paintedBox: TransitionBox = box,
) {
  const naturalWidth = Math.max(1, image.naturalWidth)
  const naturalHeight = Math.max(1, image.naturalHeight)
  const baseScale = Math.max(box.width / naturalWidth, box.height / naturalHeight)
  const baseLeft = box.left + (box.width - naturalWidth * baseScale) * 0.5
  const baseTop = box.top + (box.height - naturalHeight * baseScale) * 0.5

  // Project cards can still be following the pointer when clicked. Recreate
  // that exact painted pose so the first proxy frame does not snap to rest.
  const liveScale = box.width > 0 ? paintedBox.width / box.width : 1
  const boxCenterX = box.left + box.width * 0.5
  const boxCenterY = box.top + box.height * 0.5
  const paintedCenterX = paintedBox.left + paintedBox.width * 0.5
  const paintedCenterY = paintedBox.top + paintedBox.height * 0.5

  return {
    x: paintedCenterX + (baseLeft - boxCenterX) * liveScale,
    y: paintedCenterY + (baseTop - boxCenterY) * liveScale,
    scale: baseScale * liveScale,
    width: naturalWidth,
    height: naturalHeight,
  }
}

function scalePoseAroundViewport(
  pose: ImagePose,
  viewport: { width: number; height: number },
  factor: number,
) {
  const centerX = viewport.width * 0.5
  const centerY = viewport.height * 0.5
  return {
    x: centerX + (pose.x - centerX) * factor,
    y: centerY + (pose.y - centerY) * factor,
    scale: pose.scale * factor,
  }
}

function poseWithinFrame(pose: ImagePose, frame: TransitionBox) {
  return {
    ...pose,
    x: pose.x - frame.left,
    y: pose.y - frame.top,
  }
}

/** Keep a newly assigned transition src hidden until its raster can paint. */
async function waitForImageDecode(image: HTMLImageElement, rasterAlreadyPainted = false) {
  // Opening from a visible case card gives us its exact currentSrc. The
  // browser has already decoded and painted that raster, so another decode()
  // only inserts a perceptible pause between the click and the first tween.
  if (rasterAlreadyPainted && image.complete && image.naturalWidth > 0) return

  if (!image.complete) {
    await Promise.race([
      new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
    ])
  }
  if (typeof image.decode === 'function') {
    await image.decode().catch(() => undefined)
  }
}

/** Make the live destination raster safe to expose under the docking proxy. */
async function waitForTargetImagePaint(target: HTMLElement) {
  const image = target.matches('img')
    ? target as HTMLImageElement
    : target.querySelector<HTMLImageElement>('img')
  if (!image) return
  // A returned case can sit outside the initial catalog viewport, where its
  // lazy image would otherwise still be blank when the proxy disappears.
  image.loading = 'eager'
  await waitForImageDecode(image)
  await nextPaint()
}

/** Wait until HomeCases has actually exposed its decoded raster under proxy. */
async function waitForTargetHandoff(target: HTMLElement) {
  const localMedia = target.querySelector<HTMLElement>('[data-case-local-media]')
  if (!localMedia) {
    await nextPaint()
    return
  }

  const image = localMedia.querySelector<HTMLImageElement>('img')
  for (let frame = 0; frame < 12; frame += 1) {
    await nextPaint()
    const painted = Number.parseFloat(getComputedStyle(localMedia).opacity) >= 0.99
    const decoded = !image || (image.complete && image.naturalWidth > 0)
    if (painted && decoded) return
  }
}

async function returnThroughHistory(to: string) {
  router.back()
  const targetPath = to.split('#')[0] || '/'
  for (let frame = 0; frame < 18; frame += 1) {
    await nextPaint()
    if (router.currentRoute.value.path === targetPath) return
  }
}

async function findTarget(selector: string) {
  for (let frame = 0; frame < 12; frame += 1) {
    const target = document.querySelector<HTMLElement>(selector)
    const rect = target?.getBoundingClientRect()
    if (target && rect && rect.width > 2 && rect.height > 2) return target
    await nextPaint()
  }
  return null
}

/** Keep a hash destination pinned while the remounted home layout settles. */
function startRouteHashPin(to: string) {
  const hashAt = to.indexOf('#')
  if (hashAt < 0) return { ready: Promise.resolve(), stop: () => {} }
  const id = decodeURIComponent(to.slice(hashAt + 1))
  if (!id) return { ready: Promise.resolve(), stop: () => {} }

  let raf = 0
  let stopped = false
  let stableFrames = 0
  let tries = 0
  let resolveReady = () => {}
  let readyResolved = false
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const finishReady = () => {
    if (readyResolved) return
    readyResolved = true
    resolveReady()
  }
  const step = () => {
    if (stopped) {
      finishReady()
      return
    }
    const target = document.getElementById(id)
    if (target) {
      const rect = target.getBoundingClientRect()
      if (Math.abs(rect.top) > 0.75) {
        window.scrollTo({
          top: Math.max(0, window.scrollY + rect.top),
          left: 0,
          behavior: 'auto',
        })
        stableFrames = 0
      } else {
        stableFrames += 1
        if (stableFrames >= 3) finishReady()
      }
    }
    tries += 1
    if (tries >= 72) finishReady()
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)

  return {
    ready,
    stop: () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      finishReady()
    },
  }
}

watch(request, async (next) => {
  if (!next || active.value) return
  const root = rootEl.value
  const backdrop = backdropEl.value
  const frame = frameEl.value
  const image = imageEl.value
  if (!root || !backdrop || !frame || !image) return

  // Start resolving the cold route before decoding and staging the transition
  // image. Scheduled warmups normally finish this earlier; this is the fallback
  // for an immediate click or direct programmatic open.
  const routeWarmup = next.direction === 'open'
    ? warmCaseDetailRoute(next.to)
    : Promise.resolve()

  active.value = true
  wash.value = next.wash
  const proxySrc = next.proxySrc
  src.value = proxySrc ?? next.src
  // Keep the opening proxy on the exact candidate that is already visible in
  // the source card. The destination page loads its own full-size responsive
  // image underneath the transition.
  webpSrcset.value = proxySrc ? '' : (next.webpSrcset ?? '')
  avifSrcset.value = proxySrc ? '' : (next.avifSrcset ?? '')
  mobileSrc.value = proxySrc ? '' : (next.mobileSrc ?? '')
  mobileWebpSrcset.value = proxySrc ? '' : (next.mobileWebpSrcset ?? '')
  mobileAvifSrcset.value = proxySrc ? '' : (next.mobileAvifSrcset ?? '')
  alt.value = next.alt
  await nextTick()
  await waitForImageDecode(image, !!proxySrc)

  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const viewportBox = { top: 0, left: 0, width: viewport.width, height: viewport.height }
  const fullscreenPose = coverPose(image, viewportBox)
  gsap.set(root, { opacity: 1 })
  // The proxy is reused across routes; never retain the previous home radius.
  gsap.set(frame, { borderRadius: 0 })
  setFrameRadius(frame, 0)
  let sourceRadius = 0
  if (next.direction === 'open' && next.rect) {
    gsap.set(backdrop, { opacity: 0 })
    gsap.set(frame, next.rect)
    if (origin.value === 'home') {
      const source = Array.from(document.querySelectorAll<HTMLElement>('[data-case-media]'))
        .find(target => target.dataset.caseMedia === next.src)
      if (source) {
        sourceRadius = homeMediaRadius(source)
        setFrameRadius(frame, sourceRadius)
      }
    }
    gsap.set(image, {
      ...poseWithinFrame(
        coverPose(image, next.rect, next.imageRect ?? next.rect),
        next.rect,
      ),
      top: 0,
      left: 0,
      rotate: 0,
      opacity: 1,
      filter: next.imageFilter ?? 'none',
      transformOrigin: '0 0',
    })
  } else {
    gsap.set(backdrop, { opacity: 0 })
    gsap.set(frame, viewportBox)
    gsap.set(image, {
      ...fullscreenPose,
      top: 0,
      left: 0,
      // A fractional paint uploads the fixed proxy before its cover tween.
      opacity: 0.001,
      filter: 'none',
      rotate: 0,
      transformOrigin: '0 0',
    })
  }
  // Reveal only after the new src and its exact first pose are already on the
  // hidden layer. Otherwise v-show can expose one stale/default image frame.
  visible.value = true
  await nextTick()
  // Promote and paint the fixed proxy before geometry starts moving. Reusing
  // a decoded raster avoids network work, but a new composited layer still
  // needs its own first upload.
  await nextPaint()

  const hashPinSession: { stop?: () => void } = {}
  try {
    if (next.direction === 'open' && next.rect) {
      // Keep the source route mounted until the proxy fills the viewport. On
      // mobile this prevents a narrow clipped photo from sitting alone on the
      // destination wash while the route is already changing underneath it.
      const fill = gsap.timeline()
      fill.to(backdrop, {
        opacity: 1,
        duration: OPEN_FILL_DURATION,
        ease: 'power1.inOut',
      }, 0)
      fill.to(frame, {
        ...viewportBox,
        duration: OPEN_FILL_DURATION,
        ease: 'power3.inOut',
      }, 0)
      if (origin.value === 'home') {
        animateHomeCorners(fill, frame, sourceRadius, OPEN_FILL_DURATION, true)
      }
      fill.to(
        image,
        {
          x: fullscreenPose.x,
          y: fullscreenPose.y,
          scale: fullscreenPose.scale,
          filter: 'none',
          duration: OPEN_FILL_DURATION,
          ease: 'power3.inOut',
        },
        0,
      )
      await fill

      await routeWarmup
      await router.push(next.to)
      await nextPaint()

      // Scale 1 is the filled viewport. The final 15% is deliberately slower,
      // and the proxy dissolves only across that overshoot corridor.
      revealDetailContent()
      await nextPaint()
      const overshootPose = scalePoseAroundViewport(
        fullscreenPose,
        viewport,
        OPEN_OVERSHOOT_SCALE,
      )
      const reveal = gsap.timeline()
      reveal.to(image, {
        x: overshootPose.x,
        y: overshootPose.y,
        scale: overshootPose.scale,
        duration: OPEN_OVERSHOOT_DURATION,
        ease: 'power2.out',
      }, 0)
      reveal.to(root, {
        opacity: 0,
        duration: OPEN_OVERSHOOT_DURATION,
        ease: 'power2.out',
      }, 0)
      await reveal
      return
    }

    // Fully cover the detail before swapping routes. A fixed early delay used
    // to mount the catalog while this wash was still translucent, exposing a
    // brief catalog frame through the transition layer.
    gsap.set(root, { opacity: 1 })
    const detail = document.querySelector<HTMLElement>('.case-detail__inner')
    const cover = gsap.timeline()
    if (detail) {
      cover.to(detail, { opacity: 0, duration: 0.34, ease: 'power2.inOut' }, 0)
    }
    cover.to(backdrop, { opacity: 1, duration: 0.30, ease: 'power2.inOut' }, 0)
    cover.to(image, {
      opacity: 1,
      duration: 0.42,
      ease: 'power2.inOut',
    }, 0)

    await cover

    const targetTask = (async () => {
      if (next.historyBack) await returnThroughHistory(next.to)
      else await router.push(next.to)
      await nextPaint()
      const hashPin = startRouteHashPin(next.to)
      hashPinSession.stop = hashPin.stop
      await hashPin.ready
      const target = next.targetSelector ? await findTarget(next.targetSelector) : null
      if (target) await waitForTargetImagePaint(target)
      return target
    })()
    const targetEl = await targetTask

    if (targetEl) {
      const target = targetEl.getBoundingClientRect()
      const targetBox = { top: target.top, left: target.left, width: target.width, height: target.height }
      const targetImage = targetEl.matches('img')
        ? targetEl as HTMLImageElement
        : targetEl.querySelector<HTMLImageElement>('img')
      const targetImageRect = targetImage?.getBoundingClientRect()
      const targetPose = coverPose(image, targetBox, targetImageRect ?? targetBox)
      const targetLocalPose = poseWithinFrame(targetPose, targetBox)
      const flight = gsap.timeline()
      flight.to(frame, {
        ...targetBox,
        duration: RETURN_FLIGHT_DURATION,
        ease: 'power3.inOut',
      }, 0)
      if (next.to.split('#')[0] === '/' && targetEl.hasAttribute('data-case-media')) {
        animateHomeCorners(flight, frame, homeMediaRadius(targetEl), RETURN_FLIGHT_DURATION, false)
      }
      flight.to(image, {
        x: targetLocalPose.x,
        y: targetLocalPose.y,
        scale: targetLocalPose.scale,
        duration: RETURN_FLIGHT_DURATION,
        ease: 'power3.inOut',
        overwrite: 'auto',
      }, 0)
      // Keep the destination covered until the proxy is almost docked. An
      // earlier wash release exposed the already-mounted case photo beneath
      // the still-large proxy, which read as a second copy of the same image.
      flight.to(backdrop, { opacity: 0, duration: 0.16, ease: 'power1.out' }, 0.50)
      await flight
      markHomeReturnMediaDocked()

      // Do not crossfade into a surface that may still be presenting its gray
      // backing frame on mobile. Once the live raster is truly painted, swap
      // two geometrically identical layers atomically.
      await waitForTargetHandoff(targetEl)
      gsap.set(image, { opacity: 0 })
    } else {
      await gsap.to(image, {
        opacity: 0,
        duration: 0.42,
        ease: 'power2.out',
      })
      await gsap.to(backdrop, { opacity: 0, duration: 0.18, ease: 'power1.out' })
    }
    gsap.set(root, { opacity: 0 })
  } finally {
    hashPinSession.stop?.()
    if (next.direction === 'close') {
      completeDetailReturn()
      completeCaseDetailExit()
    } else {
      completeDetailOpen()
      completeCaseDetailEntry()
    }
    visible.value = false
    request.value = null
    active.value = false
  }
})
</script>

<template>
  <div
    v-show="visible"
    ref="rootEl"
    class="case-detail-transition"
    aria-hidden="true"
  >
    <div
      ref="backdropEl"
      class="case-detail-transition__backdrop"
      :style="{ backgroundColor: wash }"
    />
    <div ref="frameEl" class="case-detail-transition__frame">
      <picture>
        <source v-if="mobileAvifSrcset" media="(max-width: 767.98px)" type="image/avif" :srcset="mobileAvifSrcset" sizes="100vw">
        <source v-if="mobileWebpSrcset" media="(max-width: 767.98px)" type="image/webp" :srcset="mobileWebpSrcset" sizes="100vw">
        <source v-if="mobileSrc" media="(max-width: 767.98px)" :srcset="mobileSrc">
        <source v-if="avifSrcset" type="image/avif" :srcset="avifSrcset" sizes="100vw">
        <source v-if="webpSrcset" type="image/webp" :srcset="webpSrcset" sizes="100vw">
        <img ref="imageEl" :src="src" :alt="alt" class="case-detail-transition__image">
      </picture>
    </div>
  </div>
</template>

<style>
.case-detail-transition {
  position: fixed;
  inset: 0;
  z-index: 112;
  overflow: hidden;
  pointer-events: auto;
}

.case-detail-transition__backdrop {
  position: absolute;
  inset: 0;
}

.case-detail-transition__frame {
  position: fixed;
  top: 0;
  left: 0;
  overflow: hidden;
  will-change: top, left, width, height;
}

.case-detail-transition__frame picture {
  display: contents;
}

.case-detail-transition__image {
  position: absolute;
  display: block;
  max-width: none;
  will-change: transform, opacity;
}
</style>
