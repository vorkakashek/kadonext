<script setup lang="ts">
/**
 * Lusion-style overlay scrollbar: native bar hidden, thin thumb appears only while scrolling.
 * Short rail (not full viewport) — track sits in the middle-right with generous insets.
 * Thumb position lerps toward scroll so it trails slightly instead of locking 1:1.
 */
/** Vertical inset as a fraction of viewport — keeps the rail short. */
const EDGE_Y_RATIO = 0.29
const TRACK_PAD = 8
const MIN_THUMB = 28
/** Cap so the thumb never reads as a fat full-height pillar. */
const MAX_THUMB_RATIO = 0.32
const HIDE_MS = 900
/** Display follow strength per frame (~60fps). Lower = more lag. */
const LERP = 0.08
/** Snap when close enough to avoid endless micro-rAF. */
const LERP_EPS = 0.25

const visible = ref(false)
const needed = ref(false)
const thumbH = ref(MIN_THUMB)
/** Rendered (lerped) thumb offset. */
const thumbY = ref(0)
const trackH = ref(0)
const edgeY = ref(80)

let hideTimer = 0
let dragging = false
let dragOffset = 0
let targetY = 0
let lerpRaf = 0

const { surfaceOn: canvasSurface } = usePageCanvas()
const homeCases = useHomeCases()
const onCanvas = computed(() => canvasSurface.value)
const route = useRoute()
const activeCase = computed(() => {
  const id = typeof route.params.id === 'string' ? route.params.id : ''
  return baseRoutePath(route.path).startsWith('/projects/')
    ? homeCases.value.find((caseItem) => caseItem.id === id)
    : undefined
})
const inverseCaseTheme = computed(() => activeCase.value?.inverse === true)

function navScroller(): HTMLElement | null {
  if (!onCanvas.value) return null
  return document.querySelector('[data-pc-scroller]') as HTMLElement | null
}

function metrics() {
  const nav = navScroller()
  const sh = nav ? nav.scrollHeight : document.documentElement.scrollHeight
  const ch = nav ? nav.clientHeight : window.innerHeight
  const sy = nav ? nav.scrollTop : window.scrollY
  const maxScroll = Math.max(0, sh - ch)
  const inset = Math.max(64, Math.round(window.innerHeight * EDGE_Y_RATIO))
  edgeY.value = inset
  const usable = Math.max(0, window.innerHeight - inset * 2 - TRACK_PAD * 2)
  trackH.value = usable
  needed.value = maxScroll > 1 && usable > MIN_THUMB
  if (!needed.value) {
    visible.value = false
    targetY = 0
    thumbY.value = 0
    return { maxScroll: 0, usable: 0, ch, sh, inset, nav }
  }
  const ratio = ch / Math.max(sh, 1)
  const raw = usable * ratio
  const capped = Math.min(usable * MAX_THUMB_RATIO, raw)
  thumbH.value = Math.min(usable, Math.max(MIN_THUMB, capped))
  const maxY = Math.max(0, usable - thumbH.value)
  targetY = maxScroll > 0 ? maxY * (sy / maxScroll) : 0
  if (dragging) {
    thumbY.value = targetY
  }
  return { maxScroll, usable, ch, sh, inset, nav }
}

function tickLerp() {
  lerpRaf = 0
  if (dragging) {
    thumbY.value = targetY
    return
  }
  const cur = thumbY.value
  const next = cur + (targetY - cur) * LERP
  if (Math.abs(targetY - next) < LERP_EPS) {
    thumbY.value = targetY
    return
  }
  thumbY.value = next
  lerpRaf = requestAnimationFrame(tickLerp)
}

function ensureLerp() {
  if (dragging) {
    thumbY.value = targetY
    return
  }
  if (!lerpRaf) lerpRaf = requestAnimationFrame(tickLerp)
}

function syncFromScroll() {
  metrics()
  ensureLerp()
}

function flash(measureFirst = true) {
  if (measureFirst) metrics()
  if (!needed.value) return
  visible.value = true
  window.clearTimeout(hideTimer)
  if (!dragging) {
    hideTimer = window.setTimeout(() => {
      visible.value = false
    }, HIDE_MS)
  }
}

function onScroll() {
  syncFromScroll()
  flash(false)
}

function scrollToThumbY(y: number) {
  const { maxScroll, usable, nav } = metrics()
  if (maxScroll <= 0) return
  const maxY = Math.max(0, usable - thumbH.value)
  const t = maxY > 0 ? Math.min(1, Math.max(0, y / maxY)) : 0
  const next = t * maxScroll
  if (nav) nav.scrollTop = next
  else window.scrollTo(0, next)
}

function onThumbPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  dragging = true
  visible.value = true
  window.clearTimeout(hideTimer)
  if (lerpRaf) {
    cancelAnimationFrame(lerpRaf)
    lerpRaf = 0
  }
  thumbY.value = targetY
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  dragOffset = e.clientY - (edgeY.value + TRACK_PAD + thumbY.value)
}

function onThumbPointerMove(e: PointerEvent) {
  if (!dragging) return
  const y = e.clientY - edgeY.value - TRACK_PAD - dragOffset
  scrollToThumbY(y)
  metrics()
  thumbY.value = targetY
}

function onThumbPointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* already released */
  }
  flash()
  ensureLerp()
}

function onTrackPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest('.custom-scrollbar__thumb')) return
  e.preventDefault()
  const y = e.clientY - edgeY.value - TRACK_PAD - thumbH.value / 2
  scrollToThumbY(y)
  syncFromScroll()
  flash()
}

function onResize() {
  syncFromScroll()
}

let navBound: HTMLElement | null = null

function bindNavScroll(el: HTMLElement | null) {
  if (navBound === el) return
  if (navBound) navBound.removeEventListener('scroll', onScroll)
  navBound = el
  if (navBound) navBound.addEventListener('scroll', onScroll, { passive: true })
}

watch(
  onCanvas,
  async (on) => {
    await nextTick()
    bindNavScroll(on ? navScroller() : null)
    syncFromScroll()
  },
  { flush: 'post' },
)

onMounted(() => {
  metrics()
  thumbY.value = targetY
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
})

onUnmounted(() => {
  bindNavScroll(null)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  window.clearTimeout(hideTimer)
  if (lerpRaf) cancelAnimationFrame(lerpRaf)
})
</script>

<template>
  <div
    class="custom-scrollbar"
    :class="{
      'custom-scrollbar--on': visible && needed,
      'custom-scrollbar--canvas': onCanvas,
      'custom-scrollbar--inverse': inverseCaseTheme,
    }"
    :style="{ paddingTop: `${edgeY}px`, paddingBottom: `${edgeY}px` }"
    aria-hidden="true"
  >
    <div
      class="custom-scrollbar__track"
      :style="{ height: `${trackH}px` }"
      @pointerdown="onTrackPointerDown"
    >
      <div
        class="custom-scrollbar__thumb"
        :style="{
          height: `${thumbH}px`,
          transform: `translate3d(0, ${thumbY}px, 0)`,
        }"
        @pointerdown="onThumbPointerDown"
        @pointermove="onThumbPointerMove"
        @pointerup="onThumbPointerUp"
        @pointercancel="onThumbPointerUp"
      />
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 45;
  width: 22px;
  padding-inline: 0;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.35s ease;
}

.custom-scrollbar--on {
  opacity: 1;
}

.custom-scrollbar--canvas {
  z-index: 90;
}

/* Case details own their background, while this fixed overlay lives outside
   the page tree. Mirror the detail's inverse theme here so it stays visible
   over dark case washes. */
.custom-scrollbar--inverse {
  --scrollbar-ink: var(--palette-milk, #f5f1e8);
}

.custom-scrollbar__track {
  position: relative;
  width: 2px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--scrollbar-ink, var(--palette-ink)) 18%, transparent);
  pointer-events: auto;
  cursor: pointer;
}

.custom-scrollbar__thumb {
  position: absolute;
  top: 0;
  left: 50%;
  width: 4px;
  margin-left: -2px;
  border-radius: 9999px;
  background: var(--scrollbar-ink, var(--palette-ink));
  transform: translate3d(0, 0, 0);
  will-change: transform;
  cursor: grab;
  touch-action: none;
}

.custom-scrollbar__thumb:active {
  cursor: grabbing;
}

@media (pointer: coarse) {
  /* Keep native feel on phones — overlay bar is a desktop cue. */
  .custom-scrollbar {
    display: none;
  }
}

@media not all {
  .custom-scrollbar {
    transition: none;
  }
}
</style>
