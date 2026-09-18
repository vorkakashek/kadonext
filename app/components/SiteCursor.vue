<script setup lang="ts">
const { t } = useI18n()
const HOT_SEL = [
  'a',
  'button',
  '[role="button"]',
  '[role="link"]',
  '[role="option"]',
  'input',
  'textarea',
  'select',
  'summary',
  'label',
  '[tabindex]:not([tabindex="-1"])',
  '.pc-frame__sheet',
  '.hero-swarm',
  '.custom-scrollbar__track',
  '.custom-scrollbar__thumb',
].join(',')

/** Header chips — fade the dot instead of the “hot” grow. */
const CHIP_FADE_SEL = [
  '.nav-link',
  '.menu-btn--float',
  '.menu-fab',
].join(',')

const TEXT_SEL = [
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="color"]):not([type="range"]):not([type="hidden"])',
  'textarea',
  '[contenteditable="true"]',
].join(',')

const { suppressed, topLayerRequest } = useSiteCursor()
const { active: caseDetailTransitionActive } = useCaseDetailTransition()
const rootEl = ref<HTMLElement | null>(null)
const enabled = ref(false)
const topLayer = ref(false)
const hot = ref(false)
const caseOpen = ref(false)
const away = ref(true)
const textOver = ref(false)
const chipFade = ref(false)
const caseDetailSettling = ref(false)
let moveRaf = 0
let caseDetailSettleTimer = 0
let pointerX = 0
let pointerY = 0
let pointerSeen = false

// A popover paints above every ordinary z-index. Reinsert the cursor into
// that same layer after a menu opens, keeping it visible without intercepting input.
watch(topLayerRequest, async () => {
  if (!enabled.value || typeof rootEl.value?.showPopover !== 'function') return
  topLayer.value = true
  await nextTick()
  const el = rootEl.value
  if (!el) return
  if (el.matches(':popover-open')) el.hidePopover()
  el.showPopover()
})

function canUse() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function applyPos(x: number, y: number) {
  const el = rootEl.value
  if (!el) return
  el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
}

function setTextOver(on: boolean) {
  if (textOver.value === on) return
  textOver.value = on
  document.documentElement.classList.toggle('has-site-cursor-text', on)
}

function probe(x: number, y: number) {
  const node = document.elementFromPoint(x, y)
  if (!(node instanceof Element)) {
    hot.value = false
    caseOpen.value = false
    chipFade.value = false
    setTextOver(false)
    return
  }
  const overText = !!node.closest(TEXT_SEL)
  setTextOver(overText)
  const overChip = !!node.closest(CHIP_FADE_SEL)
  const overCaseMedia = !!node.closest('.cases-case-link, .projects-card, .case-detail__next')
  chipFade.value = overChip
  caseOpen.value = !caseDetailTransitionActive.value && !overText && overCaseMedia
  hot.value = !overText && !overChip && !overCaseMedia && !!node.closest(HOT_SEL)
}

watch(caseDetailTransitionActive, (active) => {
  if (caseDetailSettleTimer) window.clearTimeout(caseDetailSettleTimer)
  caseDetailSettleTimer = 0
  if (active) {
    caseDetailSettling.value = false
    if (moveRaf) {
      cancelAnimationFrame(moveRaf)
      moveRaf = 0
    }
    caseOpen.value = false
    hot.value = false
    chipFade.value = false
    setTextOver(false)
    if (pointerSeen) {
      away.value = false
      applyPos(pointerX, pointerY)
    }
    return
  }
  // Route mount and transition cleanup invalidate a large part of the case
  // layout. Keep cursor movement compositor-only while that work settles;
  // probing immediately here forced synchronous hit-testing on the new page.
  caseDetailSettling.value = true
  caseDetailSettleTimer = window.setTimeout(() => {
    caseDetailSettleTimer = 0
    caseDetailSettling.value = false
    requestAnimationFrame(() => probe(pointerX, pointerY))
  }, 600)
})

function flushMove() {
  moveRaf = 0
  away.value = false
  applyPos(pointerX, pointerY)
  // The case overlay owns the whole viewport. Hit-testing the animated page
  // below it would force style/layout work on every cursor frame.
  if (!caseDetailTransitionActive.value && !caseDetailSettling.value) {
    probe(pointerX, pointerY)
  }
}

function onMove(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  pointerX = e.clientX
  pointerY = e.clientY
  pointerSeen = true
  if (caseDetailTransitionActive.value || caseDetailSettling.value) {
    // Keep the dot independent from the shared animation RAF and avoid a DOM
    // hit-test while the fullscreen transition proxy is changing geometry.
    away.value = false
    applyPos(pointerX, pointerY)
    return
  }
  if (!moveRaf) moveRaf = requestAnimationFrame(flushMove)
}

function onDocLeave(e: PointerEvent) {
  const next = e.relatedTarget
  if (next instanceof Node && document.documentElement.contains(next)) return
  if (moveRaf) {
    cancelAnimationFrame(moveRaf)
    moveRaf = 0
  }
  away.value = true
  hot.value = false
  caseOpen.value = false
  chipFade.value = false
}

onMounted(() => {
  if (!canUse()) return
  enabled.value = true
  document.documentElement.classList.add('has-site-cursor')
  window.addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onDocLeave)
})

onUnmounted(() => {
  if (moveRaf) cancelAnimationFrame(moveRaf)
  if (caseDetailSettleTimer) window.clearTimeout(caseDetailSettleTimer)
  window.removeEventListener('pointermove', onMove)
  document.documentElement.removeEventListener('pointerleave', onDocLeave)
  document.documentElement.classList.remove('has-site-cursor', 'has-site-cursor-text')
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="enabled"
      ref="rootEl"
      :popover="topLayer ? 'manual' : undefined"
      class="site-cursor"
      :class="{
        'site-cursor--hot': hot,
        'site-cursor--case-open': caseOpen,
        'site-cursor--case-transition': caseDetailTransitionActive || caseDetailSettling,
        'site-cursor--hide': suppressed || away || textOver || chipFade,
      }"
      aria-hidden="true"
    >
      <span class="site-cursor__dot">
        <span class="site-cursor__label">{{ t('common.open') }}</span>
      </span>
    </div>
  </Teleport>
</template>

<style>
.site-cursor {
  position: fixed;
  inset: auto;
  top: 0;
  left: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  overflow: visible;
  z-index: 10050;
  width: 8px;
  height: 8px;
  pointer-events: none;
  contain: layout style paint;
  mix-blend-mode: difference;
  will-change: transform, opacity, width, height;
  opacity: 1;
  transition:
    width 0.24s var(--motion-ease, ease),
    height 0.24s var(--motion-ease, ease),
    opacity 0.28s var(--motion-ease, ease);
}

.site-cursor::backdrop { background: transparent; pointer-events: none; }

.site-cursor--case-transition {
  /* Difference blending ties the cursor repaint to every changing pixel of
     the fullscreen proxy. Normal blending keeps this tiny layer independent. */
  isolation: isolate;
  mix-blend-mode: normal;
}

.site-cursor--case-transition .site-cursor__dot {
  border: 1px solid rgb(0 0 0 / 28%);
  background: var(--palette-milk, #f5f1e8);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 24%);
}

.site-cursor__dot {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #fff;
  border: 0 solid #fff;
  will-change: background-color, border-width;
  transition:
    background-color 0.24s var(--motion-ease, ease),
    border-width 0.24s var(--motion-ease, ease);
}

.site-cursor__label {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: #fff;
  font-size: var(--type-nav);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.18s var(--motion-ease, ease);
}

.site-cursor--hot {
  width: 16px;
  height: 16px;
}

.site-cursor--hot .site-cursor__dot {
  border-width: 2px;
  background-color: transparent;
}

.site-cursor--case-open {
  width: clamp(7.5rem, 10vw, 10rem);
  height: clamp(7.5rem, 10vw, 10rem);
  mix-blend-mode: normal;
}

.site-cursor--case-open .site-cursor__dot {
  border-width: 0;
  background-color: var(--palette-ink, #171915);
}

.site-cursor--case-open .site-cursor__label {
  color: var(--palette-milk, #f5f1e8);
  opacity: 1;
}

.site-cursor--hide {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .site-cursor {
    transition: none;
  }

  .site-cursor__dot {
    transition: none;
  }
}
</style>
