<script setup lang="ts">
const props = defineProps<{
  progress: number
  targetEl?: HTMLElement | null
}>()

const mask = useFlowSurfaceMask()
const rootEl = ref<HTMLElement | null>(null)
const stageBox = reactive({
  left: 0,
  top: 0,
  width: 1,
  height: 1,
})
let resizeObserver: ResizeObserver | null = null
let measureFrame = 0

function measureStage() {
  measureFrame = 0
  const target = props.targetEl
  const root = rootEl.value
  if (!target || !root) return

  const targetBox = target.getBoundingClientRect()
  const frame = root.closest<HTMLElement>('[data-flow-surface-frame]')
  const frameBox = frame?.getBoundingClientRect()
  const frameLeft = frameBox?.left ?? mask.left
  const frameTop = frameBox?.top ?? mask.top

  stageBox.left = targetBox.left - frameLeft
  stageBox.top = targetBox.top - frameTop
  stageBox.width = Math.max(1, targetBox.width)
  stageBox.height = Math.max(1, targetBox.height)
}

function scheduleMeasure() {
  if (!measureFrame) measureFrame = requestAnimationFrame(measureStage)
}

watch(
  () => [
    props.targetEl,
    mask.top,
    mask.left,
    mask.width,
    mask.height,
  ] as const,
  measureStage,
  { flush: 'post' },
)

watch(
  () => props.targetEl,
  (target) => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (target) {
      resizeObserver = new ResizeObserver(measureStage)
      resizeObserver.observe(target)
    }
    void nextTick(measureStage)
  },
  { immediate: true, flush: 'post' },
)

onMounted(() => {
  window.addEventListener('scroll', scheduleMeasure, { passive: true })
  window.addEventListener('resize', scheduleMeasure, { passive: true })
  void nextTick(measureStage)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (measureFrame) cancelAnimationFrame(measureFrame)
  window.removeEventListener('scroll', scheduleMeasure)
  window.removeEventListener('resize', scheduleMeasure)
})

const interactive = computed(() => props.progress > 0.985)
// The contact controls sit several viewports below the first frame. Start their
// async chunk during the Surface approach, before the stage becomes interactive.
const formReady = computed(() => props.progress > 0.25)
</script>

<template>
  <div
    ref="rootEl"
    class="home-contact-stage absolute left-0 top-0"
    :class="{ 'is-interactive': interactive }"
    :style="{
      width: `${stageBox.width}px`,
      height: `${stageBox.height}px`,
      transform: `translate3d(${stageBox.left}px, ${stageBox.top}px, 0)`,
    }"
    :inert="!interactive"
  >
    <LazyHomeContactForm v-if="formReady" form-id="contact-live" />
  </div>
</template>

<style scoped>
.home-contact-stage {
  overflow: hidden;
  pointer-events: none;
  will-change: transform;
}

.home-contact-stage.is-interactive {
  pointer-events: auto;
}

@media not all {
  .home-contact-stage { will-change: auto; }
}
</style>
