<script setup lang="ts">
type WorkFormat = {
  title: string
  description: string
  preview: string
  previewAvif: string
  alt: string
}

const { tm, t } = useI18n()
defineProps<{ surfaceReady?: boolean }>()
const rootEl = ref<HTMLElement | null>(null)
const surfaceEl = ref<HTMLElement | null>(null)
const previewEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const contrastEl = ref<HTMLElement | null>(null)
const headerEl = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const previewVisible = ref(false)
const previewsMounted = ref(false)
const hoverPreviewEnabled = ref(false)
const mobileThumbsEnabled = ref(false)
const { open: pageCanvasOpen, busy: pageCanvasBusy } = usePageCanvas()

const formats = computed(() => tm('home.formats.items') as WorkFormat[])
const activeFormat = computed(() => formats.value[activeIndex.value] ?? formats.value[0])
const formatsTitle = computed(() => t('home.formats.title'))
const formatsTitleWords = computed(() => (
  formatsTitle.value.trim().split(/\s+/).map((word) => Array.from(word))
))

function smallPreview(src: string) {
  return src.replace('-960.', '-480.')
}

defineExpose({ rootEl, surfaceEl })

let frame = 0
let lastPaintTime = 0
let previewWidth = 0
let previewHeight = 0
let targetX = 0
let targetY = 0
let currentX = 0
let currentY = 0
const previewFollowResponseMs = 50
const previewLoadPromises = new Map<string, Promise<void>>()
let previewActivationId = 0

function previewKey(format: WorkFormat) {
  return `${format.previewAvif}|${format.preview}`
}

function preloadFormatPreview(format: WorkFormat, priority: 'high' | 'low' = 'low') {
  const key = previewKey(format)
  const existing = previewLoadPromises.get(key)
  if (existing) return existing

  const promise = new Promise<void>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = priority

    const finish = async () => {
      try {
        await image.decode()
      }
      catch {
        // A completed load is still cache-warmed when explicit decoding is unavailable.
      }
      resolve()
    }

    const load = (src: string, fallback?: string) => {
      image.onload = () => void finish()
      image.onerror = fallback
        ? () => load(fallback)
        : () => resolve()
      image.src = src
    }

    load(format.previewAvif, format.preview)
  })

  previewLoadPromises.set(key, promise)
  return promise
}

function warmFormatPreviews(selectedIndex: number) {
  const selected = formats.value[selectedIndex]
  if (!selected) return Promise.resolve()

  const selectedReady = preloadFormatPreview(selected, 'high')
  formats.value.forEach((format, index) => {
    if (index !== selectedIndex) void preloadFormatPreview(format)
  })
  return selectedReady
}

function measurePreview() {
  const box = previewEl.value?.getBoundingClientRect()
  if (!box) return
  previewWidth = box.width
  previewHeight = box.height
}

function resolvePreviewPosition(clientX: number, clientY: number) {
  const width = previewWidth || Math.min(window.innerWidth * 0.28, 512)
  const height = previewHeight || width
  return {
    x: clientX - width / 2,
    y: clientY - height / 2,
  }
}

function syncContrastOverlay() {
  const list = listEl.value
  const contrast = contrastEl.value
  if (!list || !contrast) return

  const bounds = list.getBoundingClientRect()
  contrast.style.width = `${bounds.width}px`
  contrast.style.transform = `translate3d(${bounds.left - currentX}px, ${bounds.top - currentY}px, 0)`
}

function paintPreview(timestamp: number) {
  frame = 0
  const el = previewEl.value
  if (!el) return

  const elapsedMs = lastPaintTime
    ? Math.min(timestamp - lastPaintTime, 32)
    : 1000 / 60
  const follow = reducedMotion
    ? 1
    : 1 - Math.exp(-elapsedMs / previewFollowResponseMs)
  lastPaintTime = timestamp

  currentX += (targetX - currentX) * follow
  currentY += (targetY - currentY) * follow
  el.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`
  syncContrastOverlay()

  if (Math.abs(targetX - currentX) > 0.2 || Math.abs(targetY - currentY) > 0.2) {
    frame = requestAnimationFrame(paintPreview)
  }
  else {
    lastPaintTime = 0
  }
}

function schedulePreviewPaint() {
  if (!frame) frame = requestAnimationFrame(paintPreview)
}

function setPointerTarget(event: PointerEvent, snap = false) {
  const position = resolvePreviewPosition(event.clientX, event.clientY)
  targetX = position.x
  targetY = position.y
  if (snap) {
    currentX = targetX
    currentY = targetY
  }
  schedulePreviewPaint()
}

async function activate(index: number, event?: PointerEvent) {
  if (!hoverPreviewEnabled.value) return
  const activationId = ++previewActivationId
  const wasVisible = previewVisible.value
  previewsMounted.value = true
  const selected = formats.value[index]
  if (!selected) return

  const selectedReady = warmFormatPreviews(index)
  if (!wasVisible) previewVisible.value = false

  await nextTick()
  measurePreview()
  if (event) setPointerTarget(event, !wasVisible)
  await selectedReady

  if (activationId !== previewActivationId || !hoverPreviewEnabled.value) return
  activeIndex.value = index
  await nextTick()
  previewVisible.value = true
  schedulePreviewPaint()
}

function onPointerMove(event: PointerEvent) {
  if (!hoverPreviewEnabled.value) return
  setPointerTarget(event)
}

function onPointerLeave(event?: PointerEvent) {
  previewActivationId += 1
  previewVisible.value = false

  const list = event?.currentTarget
  if (list instanceof HTMLElement) {
    if (!event) return
    const bounds = list.getBoundingClientRect()
    const position = resolvePreviewPosition(
      Math.min(bounds.right, Math.max(bounds.left, event.clientX)),
      Math.min(bounds.bottom, Math.max(bounds.top, event.clientY)),
    )
    targetX = position.x
    targetY = position.y
    schedulePreviewPaint()
    return
  }

  if (frame) cancelAnimationFrame(frame)
  frame = 0
  lastPaintTime = 0
}

function onFocus(index: number) {
  void activate(index)
}

function onBlur(event: FocusEvent) {
  const next = event.relatedTarget
  if (!(next instanceof Node) || !rootEl.value?.contains(next)) {
    previewActivationId += 1
    previewVisible.value = false
  }
}

function onViewportScroll() {
  if (previewVisible.value) schedulePreviewPaint()
}

function onViewportResize() {
  measurePreview()
  if (previewVisible.value) schedulePreviewPaint()
}

let hoverMedia: MediaQueryList | null = null
let mobileThumbMedia: MediaQueryList | null = null
let reducedMotionMedia: MediaQueryList | null = null
let reducedMotion = false
let entranceMotionCtx: { revert: () => void } | null = null
let entranceMotionObservers: IntersectionObserver[] = []

function clearEntranceMotion() {
  entranceMotionObservers.forEach(observer => observer.disconnect())
  entranceMotionObservers = []
  entranceMotionCtx?.revert()
  entranceMotionCtx = null
}

async function setupEntranceMotion() {
  clearEntranceMotion()

  const root = rootEl.value
  const header = headerEl.value
  if (!root || !header) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  const chars = Array.from(
    header.querySelectorAll<HTMLElement>('.work-formats__title-char'),
  )
  const title = header.querySelector<HTMLElement>('.work-formats__title')
  const intro = header.querySelector<HTMLElement>('.work-formats__intro')
  const items = Array.from(
    root.querySelectorAll<HTMLElement>('.work-formats__item'),
  )
  const animatedElements = [
    ...chars,
    ...(intro ? [intro] : []),
    ...items.flatMap(item => Array.from(
      item.querySelectorAll<HTMLElement>(
        '.work-formats__number-text, .work-formats__name-text, .work-formats__description, .work-formats__thumb-slot, .work-formats__thumb img',
      ),
    )),
  ]

  if (reducedMotion) {
    gsap.set(animatedElements, { clearProps: 'all' })
    gsap.set(items, { clearProps: '--work-formats-divider-scale' })
    return
  }

  const observeTimeline = (
    trigger: HTMLElement,
    timeline: ReturnType<typeof gsap.timeline>,
  ) => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) timeline.play()
        else timeline.reverse()
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0 },
    )
    observer.observe(trigger)
    entranceMotionObservers.push(observer)
  }

  entranceMotionCtx = gsap.context(() => {
    if (chars.length) {
      gsap.set(chars, { yPercent: 115 })
      if (intro) gsap.set(intro, { autoAlpha: 0, y: 24 })

      const headerReveal = gsap.timeline({
        paused: mobileThumbsEnabled.value,
        scrollTrigger: mobileThumbsEnabled.value
          ? undefined
          : {
              trigger: title ?? header,
              start: 'center bottom',
              toggleActions: 'play none none reverse',
            },
      })
      headerReveal.to(chars, {
        yPercent: 0,
        duration: mobileThumbsEnabled.value ? 0.72 : 1.1,
        stagger: mobileThumbsEnabled.value ? 0.025 : 0.055,
        ease: 'power4.out',
      })
      if (intro) {
        headerReveal.to(intro, {
          autoAlpha: 1,
          y: 0,
          duration: 0.72,
          ease: 'power3.out',
        }, mobileThumbsEnabled.value ? 0.16 : 0.3)
      }

      if (mobileThumbsEnabled.value) {
        observeTimeline(title ?? header, headerReveal)
      }
    }

    items.forEach((item, index) => {
      const number = item.querySelector<HTMLElement>('.work-formats__number-text')
      const name = item.querySelector<HTMLElement>('.work-formats__name-text')
      const description = item.querySelector<HTMLElement>('.work-formats__description')
      const thumb = item.querySelector<HTMLElement>('.work-formats__thumb-slot')
      const thumbImage = item.querySelector<HTMLElement>('.work-formats__thumb img')
      const copyTargets = [number, name, description].filter(
        (element): element is HTMLElement => !!element,
      )

      gsap.set(copyTargets, { autoAlpha: 0, y: mobileThumbsEnabled.value ? 30 : 22 })
      if (index > 0) gsap.set(item, { '--work-formats-divider-scale': 0 })
      if (thumb) gsap.set(thumb, { clipPath: 'inset(0 0 100% 0)' })
      if (thumbImage) gsap.set(thumbImage, { scale: 1.08 })

      const itemReveal = gsap.timeline({
        paused: mobileThumbsEnabled.value,
        defaults: { ease: 'power3.out' },
        scrollTrigger: mobileThumbsEnabled.value
          ? undefined
          : {
              trigger: item,
              start: 'top 88%',
              toggleActions: 'play none none reverse',
            },
      })

      if (index > 0) {
        itemReveal.to(item, {
          '--work-formats-divider-scale': 1,
          duration: 0.7,
          ease: 'power2.out',
        }, 0)
      }
      if (thumb) {
        itemReveal.to(thumb, {
          clipPath: 'inset(0 0 0% 0)',
          duration: 0.88,
          ease: 'power4.inOut',
        }, 0)
      }
      if (thumbImage) {
        itemReveal.to(thumbImage, {
          scale: 1,
          duration: 1.05,
          ease: 'power3.out',
        }, 0.08)
      }
      if (number) {
        itemReveal.to(number, {
          autoAlpha: 1,
          y: 0,
          duration: 0.58,
        }, mobileThumbsEnabled.value ? 0.12 : 0.04)
      }
      if (name) {
        itemReveal.to(name, {
          autoAlpha: 1,
          y: 0,
          duration: 0.72,
        }, mobileThumbsEnabled.value ? 0.2 : 0.1)
      }
      if (description) {
        itemReveal.to(description, {
          autoAlpha: 1,
          y: 0,
          duration: 0.68,
        }, mobileThumbsEnabled.value ? 0.3 : 0.2)
      }

      if (mobileThumbsEnabled.value) {
        observeTimeline(item, itemReveal)
      }
    })
  }, header)
}

function syncHoverPreviewMode() {
  hoverPreviewEnabled.value = !!hoverMedia?.matches
  mobileThumbsEnabled.value = !!mobileThumbMedia?.matches
  reducedMotion = !!reducedMotionMedia?.matches
  if (!hoverPreviewEnabled.value) {
    previewActivationId += 1
    previewVisible.value = false
  }
}

async function onMotionMediaChange() {
  syncHoverPreviewMode()
  await nextTick()
  await setupEntranceMotion()
}

watch(
  () => pageCanvasOpen.value || pageCanvasBusy.value,
  (navigationActive) => {
    if (navigationActive) onPointerLeave()
  },
)

onBeforeRouteLeave(() => {
  onPointerLeave()
})

onDeactivated(() => {
  onPointerLeave()
})

onMounted(async () => {
  hoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)')
  mobileThumbMedia = window.matchMedia('(max-width: 767.98px)')
  reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncHoverPreviewMode()
  hoverMedia.addEventListener('change', syncHoverPreviewMode)
  mobileThumbMedia.addEventListener('change', onMotionMediaChange)
  reducedMotionMedia.addEventListener('change', onMotionMediaChange)
  window.addEventListener('scroll', onViewportScroll, { passive: true })
  window.addEventListener('resize', onViewportResize, { passive: true })
  await setupEntranceMotion()
})

onUnmounted(() => {
  clearEntranceMotion()
  if (frame) cancelAnimationFrame(frame)
  hoverMedia?.removeEventListener('change', syncHoverPreviewMode)
  mobileThumbMedia?.removeEventListener('change', onMotionMediaChange)
  reducedMotionMedia?.removeEventListener('change', onMotionMediaChange)
  window.removeEventListener('scroll', onViewportScroll)
  window.removeEventListener('resize', onViewportResize)
})
</script>

<template>
  <section
    id="services"
    ref="rootEl"
    class="work-formats pointer-events-auto relative z-10 w-full"
    :aria-labelledby="'work-formats-title'"
  >
    <div class="work-formats__layout">
      <header ref="headerEl" class="work-formats__header">
        <h2
          id="work-formats-title"
          class="work-formats__title"
          :aria-label="formatsTitle"
        >
          <span class="sr-only">{{ formatsTitle }}</span>
          <span
            v-for="(word, wordIndex) in formatsTitleWords"
            :key="`${word.join('')}-${wordIndex}`"
            class="work-formats__title-word-mask"
            aria-hidden="true"
          >
            <span class="work-formats__title-word-reveal">
              <span
                v-for="(char, charIndex) in word"
                :key="`${char}-${charIndex}`"
                class="work-formats__title-char"
              >{{ char }}</span>
            </span>
          </span>
        </h2>
        <p class="work-formats__intro">
          {{ t('home.formats.intro') }}
        </p>
      </header>

      <div class="work-formats__body">
        <div
          ref="surfaceEl"
          class="work-formats__surface"
          :class="{ 'is-surface-ready': surfaceReady }"
          aria-hidden="true"
        />

        <ol
          ref="listEl"
          class="work-formats__list"
          :class="{ 'has-active': previewVisible }"
          @pointermove="onPointerMove"
          @pointerleave="onPointerLeave"
        >
          <li
            v-for="(item, index) in formats"
            :key="item.title"
            class="work-formats__item"
            :class="{ 'is-active': previewVisible && activeIndex === index }"
          >
            <div
              class="work-formats__trigger"
              :tabindex="hoverPreviewEnabled ? 0 : undefined"
              :aria-controls="hoverPreviewEnabled ? 'work-formats-preview' : undefined"
              @pointerenter="activate(index, $event)"
              @focus="onFocus(index)"
              @blur="onBlur"
            >
              <span class="work-formats__thumb-slot" aria-hidden="true">
                <picture
                  v-if="mobileThumbsEnabled"
                  class="work-formats__thumb"
                >
                  <source type="image/avif" :srcset="smallPreview(item.previewAvif)">
                  <img
                    :src="smallPreview(item.preview)"
                    alt=""
                    width="160"
                    height="160"
                    loading="lazy"
                    decoding="async"
                  >
                </picture>
              </span>
              <span class="work-formats__marker">
                <span class="work-formats__number">
                  <span class="work-formats__number-text">{{ String(index + 1).padStart(3, '0') }}</span>
                </span>
                <span class="work-formats__arrow" aria-hidden="true">
                  <svg viewBox="0 0 40 40" fill="none">
                    <path d="M5 20h27M23 10l10 10-10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </span>
              </span>
              <span class="work-formats__copy">
                <h3 class="work-formats__name">
                  <span class="work-formats__name-text">{{ item.title }}</span>
                </h3>
                <span class="work-formats__description">{{ item.description }}</span>
              </span>
            </div>
          </li>
        </ol>

        <div
          v-if="hoverPreviewEnabled"
          id="work-formats-preview"
          ref="previewEl"
          class="work-formats__preview"
          :class="{ 'is-visible': previewVisible }"
          role="img"
          :aria-label="activeFormat?.alt"
          aria-live="polite"
        >
          <picture
            v-for="(item, index) in previewsMounted ? formats : []"
            :key="item.preview"
            class="work-formats__picture"
            :class="{ 'is-active': activeIndex === index }"
            aria-hidden="true"
          >
            <source type="image/avif" :srcset="item.previewAvif">
            <img
              :src="item.preview"
              :alt="item.alt"
              width="960"
              height="960"
              loading="lazy"
              decoding="async"
            >
          </picture>

          <ol
            ref="contrastEl"
            class="work-formats__contrast"
            aria-hidden="true"
          >
            <li
              v-for="(item, index) in formats"
              :key="`contrast-${item.title}`"
              class="work-formats__contrast-item"
              :class="{ 'is-active': activeIndex === index }"
            >
              <div class="work-formats__trigger">
                <span class="work-formats__marker">
                  <span class="work-formats__number">
                    <span class="work-formats__number-text">{{ String(index + 1).padStart(3, '0') }}</span>
                  </span>
                  <span class="work-formats__arrow">
                    <svg viewBox="0 0 40 40" fill="none">
                      <path d="M5 20h27M23 10l10 10-10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                </span>
                <span class="work-formats__copy">
                  <span class="work-formats__name">
                    <span class="work-formats__name-text">{{ item.title }}</span>
                  </span>
                  <span class="work-formats__description">{{ item.description }}</span>
                </span>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.work-formats {
  min-height: var(--app-screen);
  padding: var(--space-section) var(--layout-margin-content)
    calc(var(--space-section) * 0.5);
}

.work-formats__layout {
  display: grid;
  width: 100%;
  max-width: var(--layout-content-max);
  margin-inline: auto;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  row-gap: var(--space-block);
}

.work-formats__header,
.work-formats__body {
  grid-column: 1 / -1;
}

.work-formats__title {
  --work-formats-title-size: clamp(3.25rem, 8.5vw, 8rem);
  margin: 0;
  font-size: var(--work-formats-title-size);
  font-weight: 400;
  letter-spacing: -0.065em;
  line-height: 0.88;
}

.work-formats__title-word-mask {
  display: inline-block;
  overflow: hidden;
  padding-top: 0.08em;
  padding-right: 0.04em;
  vertical-align: bottom;
}

.work-formats__title-word-mask:not(:last-child) {
  margin-right: 0.22em;
}

.work-formats__title-word-reveal,
.work-formats__title-char {
  display: inline-block;
}

.work-formats__title-char {
  will-change: transform;
}

.work-formats__intro {
  max-width: 38rem;
  margin-top: var(--space-2);
  font-size: var(--type-lead);
  letter-spacing: -0.025em;
  line-height: 1.3;
}

.work-formats__body {
  position: relative;
  display: grid;
  min-height: min(50rem, 70svh);
  grid-template-columns: repeat(8, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  align-items: center;
}

.work-formats__surface {
  position: absolute;
  inset-block: 0;
  left: calc(-1 * (var(--layout-column) + var(--layout-gutter)));
  width: var(--layout-span-4);
  overflow: hidden;
  border-radius: var(--flow-surface-radius, 24px);
  background: var(--palette-stone);
}

.work-formats__surface.is-surface-ready {
  background: transparent;
}

.work-formats__surface[data-flow-surface-proxy-active] {
  background: var(--palette-stone);
}

.work-formats__surface::after {
  position: absolute;
  inset: 0;
  background-image: var(--home-surface-grain);
  background-position: 0 0;
  background-repeat: repeat;
  background-size: 224px 224px;
  content: '';
  mix-blend-mode: soft-light;
  opacity: 0;
}

.work-formats__surface[data-flow-surface-proxy-active]::after {
  opacity: 0.2;
}

@media (max-width: 767.98px) {
  .work-formats__surface::after {
    background-size: 176px 176px;
  }
}

.work-formats__list {
  position: relative;
  display: flex;
  margin: 0;
  padding: 0;
  grid-column: 1 / -1;
  flex-direction: column;
  list-style: none;
}

.work-formats__item {
  position: relative;
  z-index: 20;
  color: var(--palette-ink);
  transition: color 0.28s ease;
}

.work-formats__item.is-active,
.work-formats__item:focus-within {
  z-index: 40;
}

.work-formats__item + .work-formats__item::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 1px;
  background: color-mix(in srgb, var(--palette-ink) 18%, transparent);
  content: '';
  transform: scaleX(var(--work-formats-divider-scale, 1));
  transform-origin: left center;
}

.work-formats__list.has-active .work-formats__item:not(.is-active):not(:focus-within) {
  color: color-mix(in srgb, var(--palette-ink) 42%, var(--palette-sand));
}

/* While the preview is visible, the real rows stay below the photo. Only the
   hovered row is redrawn inside it, so the image covers every other item. */
.work-formats__list.has-active .work-formats__item {
  z-index: 20;
}

.work-formats__trigger {
  position: relative;
  display: grid;
  width: 100%;
  padding: clamp(1rem, 2.2svh, 1.75rem) 0;
  grid-template-columns: var(--layout-span-1) minmax(0, 1fr);
  column-gap: var(--layout-gutter);
  align-items: start;
  color: inherit;
  text-align: left;
}

.work-formats__trigger:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 8px;
}

.work-formats__marker {
  position: relative;
  display: grid;
  width: 3ch;
  height: 1.3em;
  justify-self: start;
  align-items: center;
  overflow: hidden;
  font-size: var(--type-lead);
}

.work-formats__number,
.work-formats__arrow {
  width: 100%;
  height: 1em;
  grid-area: 1 / 1;
  transition: opacity 0.24s ease, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.work-formats__arrow {
  display: flex;
  align-items: center;
  opacity: 0;
  transform: translateX(-100%);
}

.work-formats__thumb-slot {
  display: none;
}

.work-formats__item.is-active .work-formats__arrow,
.work-formats__item:focus-within .work-formats__arrow {
  opacity: 1;
  transform: translateX(0);
}

.work-formats__arrow svg {
  width: 100%;
  height: 100%;
}

.work-formats__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.65rem;
}

.work-formats__name {
  overflow: hidden;
  margin: 0;
  font-size: var(--type-slogan);
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1.1;
}

.work-formats__name-text {
  display: inline-block;
}

.work-formats__number {
  display: flex;
  align-items: center;
  font-size: inherit;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  line-height: 1.2;
  opacity: 1;
  transform: translateX(0);
}

.work-formats__number-text {
  display: inline-block;
}

.work-formats__description {
  max-width: 58rem;
  font-size: var(--type-body);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.35;
}

.work-formats__preview {
  position: fixed;
  z-index: 30;
  top: 0;
  left: 0;
  width: clamp(20.48rem, 32vw, 37.12rem);
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-surface);
  background: var(--palette-stone);
  opacity: 0;
  pointer-events: none;
  transform: translate3d(-200vw, -200vh, 0);
  transition: opacity 0.22s ease;
  isolation: isolate;
  will-change: transform, opacity;
}

.work-formats__preview.is-visible {
  opacity: 1;
}

.work-formats__contrast {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  display: flex;
  margin: 0;
  padding: 0;
  color: #fff;
  flex-direction: column;
  list-style: none;
  mix-blend-mode: difference;
  pointer-events: none;
  will-change: transform;
}

.work-formats__contrast-item {
  position: relative;
  color: inherit;
}

.work-formats__contrast-item:not(.is-active) {
  visibility: hidden;
}

.work-formats__contrast-item.is-active .work-formats__arrow {
  opacity: 1;
  transform: translateX(0);
}

.work-formats__picture,
.work-formats__picture img {
  display: block;
  width: 100%;
  height: 100%;
}

.work-formats__picture {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.work-formats__picture.is-active {
  z-index: 1;
  opacity: 1;
}

.work-formats__picture img {
  object-fit: cover;
  transform: scale(1.045);
  transition: transform 0.75s cubic-bezier(0.22, 1, 0.36, 1);
}

.work-formats__preview.is-visible .work-formats__picture.is-active img {
  transform: scale(1);
}

@media (min-width: 768px) {
  .work-formats__header,
  .work-formats__body {
    grid-column: 3 / span 8;
  }

  .work-formats__description {
    font-size: var(--type-lead);
  }

  .work-formats__item.is-active .work-formats__number,
  .work-formats__item:focus-within .work-formats__number,
  .work-formats__contrast-item.is-active .work-formats__number {
    opacity: 0;
    transform: translateX(100%);
  }

  .work-formats__surface {
    /* The live FlowSurface occupies this slot after its first committed paint. */
  }

}

@media (max-width: 767.98px) {
  .work-formats {
    padding-block: calc(var(--space-section) * 0.75)
      calc(var(--space-section) * 0.375);
  }

  .work-formats__title {
    --work-formats-title-size: clamp(3.5rem, 17vw, 5.75rem);
  }

  .work-formats__body {
    display: grid;
    min-height: 0;
    padding-block: var(--space-block);
    align-items: center;
  }

  .work-formats__surface {
    position: absolute;
    inset-block: 0;
    left: calc(-2 * var(--layout-margin));
    width: calc(100% + 4 * var(--layout-margin));
    height: auto;
    margin: 0;
  }

  .work-formats__trigger {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto auto;
    column-gap: 0;
    row-gap: var(--space-2);
    align-items: stretch;
    padding-block: clamp(2.6rem, 11.2vw, 3.6rem);
  }

  .work-formats__arrow {
    display: none;
  }

  .work-formats__thumb-slot,
  .work-formats__thumb,
  .work-formats__thumb img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
  }

  .work-formats__thumb-slot {
    grid-column: 2;
    grid-row: 1;
    width: clamp(11rem, 56vw, 14rem);
    justify-self: end;
    overflow: hidden;
    border-radius: var(--radius-surface);
    background: var(--palette-stone);
  }

  .work-formats__thumb {
    height: 100%;
  }

  .work-formats__thumb img {
    height: 100%;
    object-fit: cover;
  }

  .work-formats__copy {
    display: contents;
  }

  .work-formats__name {
    display: contents;
    font-size: calc(var(--type-slogan) * 1.3);
  }

  .work-formats__marker {
    grid-column: 1;
    grid-row: 1;
    align-self: end;
    justify-self: start;
    width: auto;
    height: auto;
    overflow: visible;
    font-size: var(--type-nav);
    line-height: 1.1;
  }

  .work-formats__number {
    width: auto;
    height: auto;
    opacity: 1;
    transform: none;
  }

  .work-formats__name-text {
    display: block;
    grid-column: 1 / -1;
    grid-row: 2;
    margin-top: calc(var(--space-2) * 0.5);
  }

  .work-formats__description {
    grid-column: 1 / -1;
    grid-row: 3;
    max-width: none;
  }

  .work-formats__preview {
    position: absolute;
    top: 0;
    right: 0;
    left: auto;
    width: 62vw;
    max-width: 24rem;
    transform: none !important;
  }

  .work-formats__preview.is-visible {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .work-formats__item,
  .work-formats__number,
  .work-formats__arrow,
  .work-formats__preview {
    transition: none;
  }

  .work-formats__picture img {
    transform: none;
    transition: none;
  }
}
</style>
