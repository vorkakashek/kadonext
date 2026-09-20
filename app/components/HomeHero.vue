<script setup lang="ts">
/**
 * Hero scroll section — in-flow title/description + the morph pose target.
 * Only the swarm and slogan live inside FlowSurfaceHost's clipped window.
 */
import { isAppleTouchDevice, isMobileChromeHeightOnlyResize, isNarrowViewport } from '~/utils/mobileViewport'
import {
  subscribeAppliedScrollFrame,
  type AppliedScrollFrame,
} from '~/utils/appliedScrollFrame'
import {
  mobileHeroCopyOpacity,
  mobileHeroCopyScale,
  mobileHeroCopyTranslation,
  readMobileHeroCopyLayout,
  type MobileHeroCopyLayout,
} from '~/utils/mobileHeroCopyMotion'

const { locale, tm } = useI18n()
const heroTitleLines = computed(() => {
  locale.value
  return tm('home.hero.titleLines') as string[]
})
const heroTitleLineWords = computed(() => (
  heroTitleLines.value.map(line => (
    line.trim().split(/\s+/).map(word => Array.from(word))
  ))
))
const heroDescriptionLines = computed(() => {
  locale.value
  return tm('home.hero.descriptionLines') as string[]
})

const heroIntroPending = useState<boolean>('home-hero-intro-pending', () => true)
const flowSurfaceMask = useFlowSurfaceMask()
const section = ref<HTMLElement | null>(null)
const surfaceSlot = ref<HTMLElement | null>(null)
const titleBlock = ref<HTMLElement | null>(null)
// Native sticky owns the full scroll compensation on iOS. JS only paints the
// small authored drift, so asynchronous scrolling cannot race a 1:1 transform.
const nativeCopyAnchor = ref(false)

/** Scroll compensation leaves a small visible downward drift before the copy is covered. */
const COPY_DESCENT_RATE = 0.22
const COPY_FADE_START_VH = 0.38
const COPY_FADE_END_VH = 0.72
let copyMotionVh = 0
let copyMotionWidth = 0
let copyMotionSectionTop: number | null = null
let initialMobileCopyLayout: MobileHeroCopyLayout | null = null
let removeAppliedScrollFrame: (() => void) | null = null

function copyMotionBaseVh() {
  if (typeof window === 'undefined') return 1
  const width = window.innerWidth
  if (!copyMotionVh || width !== copyMotionWidth) {
    copyMotionVh = Math.max(1, window.innerHeight)
    copyMotionWidth = width
  }
  return copyMotionVh
}

function copyExitTarget(scrollY: number) {
  if (isNarrowViewport()) {
    if (!flowSurfaceMask.heroCopyLayout && !initialMobileCopyLayout && section.value && surfaceSlot.value) {
      // The host publishes the canonical layout after its lazy mount. Keep the
      // first paint stable using the same transform-free layout reader + svh.
      const screen = Number.parseFloat(getComputedStyle(section.value).minHeight)
      initialMobileCopyLayout = readMobileHeroCopyLayout(
        section.value,
        surfaceSlot.value,
        Number.isFinite(screen) ? screen : window.innerHeight,
      )
    }
    const layout = flowSurfaceMask.heroCopyLayout ?? initialMobileCopyLayout
    const nativeCompensation = nativeCopyAnchor.value && layout
      ? Math.max(0, scrollY - layout.sectionTop)
      : 0
    return {
      y: layout ? mobileHeroCopyTranslation(scrollY, layout) - nativeCompensation : 0,
      opacity: layout ? mobileHeroCopyOpacity(scrollY, layout) : 1,
      scale: layout ? mobileHeroCopyScale(scrollY, layout) : 1,
    }
  }
  const vh = copyMotionBaseVh()
  if (copyMotionSectionTop === null && section.value) {
    copyMotionSectionTop = section.value.getBoundingClientRect().top + scrollY
  }
  const scrolled = Math.max(0, scrollY - (copyMotionSectionTop ?? 0))
  const fadeProgress = Math.min(
    1,
    Math.max(
      0,
      (scrolled - vh * COPY_FADE_START_VH)
        / (vh * (COPY_FADE_END_VH - COPY_FADE_START_VH)),
    ),
  )
  const easedFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress)
  return {
    y: Math.min(scrolled, vh * COPY_FADE_END_VH) * (1 + COPY_DESCENT_RATE),
    opacity: 1 - easedFade,
    scale: 1,
  }
}

function paintCopyExit(y: number, opacity: number, scale = 1) {
  const el = titleBlock.value
  if (!el) return
  el.style.transform = `translate3d(0, ${y.toFixed(3)}px, 0) scale(${scale.toFixed(4)})`
  el.style.opacity = opacity.toFixed(4)
}

function updateCopyExit(scrollY?: number) {
  if (typeof window === 'undefined') return
  const target = copyExitTarget(scrollY ?? window.scrollY)
  paintCopyExit(target.y, target.opacity, target.scale)
}

function onAppliedCopyFrame(frame: AppliedScrollFrame) {
  updateCopyExit(frame.y)
}

function onCopyResize() {
  if (!isMobileChromeHeightOnlyResize()) {
    copyMotionVh = 0
    copyMotionWidth = 0
    copyMotionSectionTop = null
    initialMobileCopyLayout = null
  }
  updateCopyExit()
}

onMounted(() => {
  nativeCopyAnchor.value = isAppleTouchDevice()
  // Commit sticky before measuring/painting, including restored scroll on SPA
  // returns. Keep the initial markup identical to SSR during hydration.
  nextTick(updateCopyExit)
  removeAppliedScrollFrame = subscribeAppliedScrollFrame(onAppliedCopyFrame)
  window.addEventListener('resize', onCopyResize, { passive: true })
})

watch(
  () => flowSurfaceMask.heroCopyLayout,
  () => {
    if (typeof window !== 'undefined' && isNarrowViewport()) updateCopyExit()
  },
  { flush: 'sync' },
)

onUnmounted(() => {
  removeAppliedScrollFrame?.()
  removeAppliedScrollFrame = null
  window.removeEventListener('resize', onCopyResize)
})

defineProps<{
  surfaceReady?: boolean
}>()

defineExpose({ section, surfaceSlot })
</script>

<template>
  <section
    ref="section"
    class="hero pointer-events-none relative w-full overflow-visible touch-pan-y"
  >
    <div
      class="home-hero__copy mx-auto grid shrink-0 text-ink"
      :class="{
        'home-hero__copy--intro-hidden': heroIntroPending,
        'home-hero__copy--native-anchor': nativeCopyAnchor,
      }"
      :data-hero-copy-native-anchor="nativeCopyAnchor ? '' : undefined"
      :style="{
        maxWidth: 'var(--layout-content-max)',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        columnGap: 'var(--layout-gutter)',
      }"
    >
      <div
        ref="titleBlock"
        data-hero-title-block
        class="home-hero__title-block relative z-0 col-span-12 flex flex-col"
      >
        <h1
          class="home-hero__title"
          :aria-label="heroTitleLines.join(' ')"
        >
          <span class="sr-only">{{ heroTitleLines.join(' ') }}</span>
          <span
            v-for="(lineWords, lineIndex) in heroTitleLineWords"
            :key="lineIndex"
            class="home-hero__title-line-mask"
            :data-hero-title-line="lineIndex"
            aria-hidden="true"
          >
            <span
              v-for="(word, wordIndex) in lineWords"
              :key="wordIndex"
              class="home-hero__title-word-mask"
              :data-hero-title-mobile-row="lineIndex + wordIndex"
            >
              <span
                v-for="(char, charIndex) in word"
                :key="`${char}-${charIndex}`"
                class="home-hero__title-char"
              >{{ char }}</span>
            </span>
          </span>
        </h1>
        <div
          class="home-hero__desc-lines"
        >
          <div
            v-for="(line, lineIndex) in heroDescriptionLines"
            :key="lineIndex"
            class="home-hero__desc-mask"
          >
            <p
              data-hero-description-line
              class="home-hero__desc"
            >
              {{ line }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="home-hero__scene-grid mx-auto grid">
      <div
        ref="surfaceSlot"
        class="home-hero__surface-slot pointer-events-none relative col-span-12"
      >
        <!--
          SSR first frame for the surface. The live FlowSurface is intentionally
          lazy; keeping its tone + grain here prevents a blank panel and makes the
          decorative raster discoverable before client JavaScript. The primer is
          removed only after the live surface has painted underneath it.
        -->
        <div
          v-if="!surfaceReady"
          class="home-hero__surface-primer bg-stone"
          aria-hidden="true"
        >
          <div class="home-hero__surface-primer-grain" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
:global(:root) {
  --home-surface-grain: image-set(
    url('/textures/grain-tile-v2-256.avif') type('image/avif'),
    url('/textures/grain-tile-v2-256.webp') type('image/webp')
  );
}

.home-hero__surface-primer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: var(--flow-surface-radius, 24px);
}

.hero {
  min-height: var(--app-screen);
  padding-bottom: var(--layout-margin);
}

.home-hero__copy {
  width: var(--layout-content);
  padding-top: calc(var(--layout-surface-top) + var(--space-block));
}

.home-hero__copy--intro-hidden {
  opacity: 0;
  visibility: hidden;
}

.home-hero__title-block {
  align-items: center;
  container-type: inline-size;
  gap: 12px;
  color: var(--palette-ink);
  text-align: center;
  will-change: transform, opacity;
}

.home-hero__title {
  --home-hero-title-size: min(168px, 12cqi);

  width: 100%;
  margin-inline: auto;
  font-size: var(--home-hero-title-size);
  font-weight: 600;
  font-synthesis: none;
  letter-spacing: -0.03em;
  line-height: 0.9;
  text-align: center;
  white-space: nowrap;
}

.home-hero__title-line-mask {
  display: flex;
  width: max-content;
  margin-inline: auto;
}

.home-hero__title-word-mask {
  display: inline-block;
  overflow: hidden;
  padding-top: 0.08em;
  padding-right: 0.04em;
}

.home-hero__title-word-mask + .home-hero__title-word-mask {
  margin-left: 0.22em;
}

.home-hero__title-char {
  display: inline-block;
  will-change: transform;
}

.home-hero__desc-lines {
  width: 100%;
  max-width: none;
}

.home-hero__desc-mask {
  width: 100%;
  overflow: hidden;
}

.home-hero__desc {
  margin: 0;
  color: var(--palette-ink);
  font-size: calc(var(--type-slogan) * 0.9);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.2;
  will-change: transform;
}

.home-hero__scene-grid {
  width: var(--layout-content);
  margin-top: calc(var(--space-4) * 2);
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
}

.home-hero__surface-slot {
  aspect-ratio: 4 / 5;
}

.home-hero__surface-primer-grain {
  position: absolute;
  inset: 0;
  background-image: var(--home-surface-grain);
  background-position: 0 0;
  background-repeat: repeat;
  background-size: 224px 224px;
  opacity: 0.2;
  mix-blend-mode: soft-light;
}

@media (max-width: 767.98px) {
  .home-hero__copy {
    position: relative;
    z-index: 1;
  }

  .home-hero__copy--native-anchor {
    position: sticky;
    top: 0;
  }

  .home-hero__title {
    display: grid;
    grid-template-columns: max-content max-content;
    justify-content: center;
    column-gap: 0.22em;
    font-size: calc(clamp(44px, 14.3cqi, 105.6px) * 0.95);
  }

  .home-hero__title-line-mask {
    display: contents;
  }

  .home-hero__title-word-mask {
    display: block;
    width: max-content;
    margin: 0;
  }

  .home-hero__title-word-mask + .home-hero__title-word-mask {
    margin-left: 0;
  }

  .home-hero__title-line-mask[data-hero-title-line="0"] .home-hero__title-word-mask:first-child {
    grid-column: 1 / -1;
    grid-row: 1;
    justify-self: center;
  }

  .home-hero__title-line-mask[data-hero-title-line="0"] .home-hero__title-word-mask:last-child {
    grid-column: 1;
    grid-row: 2;
  }

  .home-hero__title-line-mask[data-hero-title-line="1"] .home-hero__title-word-mask:first-child {
    grid-column: 2;
    grid-row: 2;
  }

  .home-hero__title-line-mask[data-hero-title-line="1"] .home-hero__title-word-mask:last-child {
    grid-column: 1 / -1;
    grid-row: 3;
    justify-self: center;
  }

  .home-hero__surface-slot {
    /* The in-flow scene must paint over the sticky copy during its physical wipe. */
    z-index: 2;
  }

  .home-hero__surface-primer-grain {
    background-size: 176px 176px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-hero__title-block {
    transform: none !important;
  }
}

@media (min-width: 768px) {
  .home-hero__title-block {
    gap: 40px;
  }

  .home-hero__desc-lines {
    max-width: 36ch;
  }

  .home-hero__desc {
    font-size: var(--type-slogan);
  }

  .home-hero__surface-slot {
    aspect-ratio: auto;
    height: calc(
      var(--app-screen)
      - var(--layout-surface-top)
      - var(--layout-margin)
    );
  }
}

@media (min-width: 1024px) {
  .home-hero__desc-lines {
    max-width: none;
  }

  .home-hero__desc {
    white-space: nowrap;
  }
}

</style>
