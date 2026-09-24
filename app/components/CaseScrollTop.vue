<script setup lang="ts">
const { t } = useI18n()
const visible = ref(false)
const { scrollY, scrollDelta, scrollRevision } = useMotionRuntime()
const { motionActive } = useCaseDetailExperience()
const { style: fabStyle } = useMobileFabGeometry()

function updateVisibility() {
  if (!motionActive.value) {
    visible.value = false
    return
  }
  const nextScrollY = scrollY.value
  const delta = scrollDelta.value

  if (nextScrollY <= 24) visible.value = false
  else if (delta > 0.5) visible.value = false
  else if (delta < -0.5) visible.value = true
}

watch(scrollRevision, updateVisibility)
watch(motionActive, (active) => {
  if (!active || scrollY.value <= 24) visible.value = false
}, { immediate: true })

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
}
</script>

<template>
  <button
    type="button"
    class="case-scroll-top"
    :class="{ 'case-scroll-top--visible': visible }"
    :style="fabStyle"
    :aria-label="t('common.scrollTop')"
    :aria-hidden="!visible"
    :tabindex="visible ? 0 : -1"
    @click="scrollToTop"
  >
    <SiteIcon name="arrow-up" :size="22" />
  </button>
</template>

<style scoped>
.case-scroll-top {
  position: fixed;
  left: calc(2 * var(--layout-margin) + var(--safe-left, 0px));
  bottom: calc(2 * var(--layout-margin) + var(--safe-bottom, 0px));
  z-index: 110;
  display: grid;
  box-sizing: border-box;
  width: 42px;
  height: 42px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  place-items: center;
  appearance: none;
  color: inherit;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateY(12px) scale(0.92);
  visibility: hidden;
  transition:
    opacity 220ms ease,
    transform 260ms var(--motion-ease, ease),
    visibility 220ms;
}

.case-scroll-top--visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
  visibility: visible;
}

.case-scroll-top:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}

@media not all {
  .case-scroll-top { transition: none; }
}
</style>
