<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="ambient-sound"
    :aria-label="t('accessibility.ambientSoundEmpty')"
    aria-disabled="true"
  >
    <span class="ambient-sound__meter" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  </button>
</template>

<style scoped>
.ambient-sound {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  min-height: 44px;
  padding: 10px;
  border: 0;
  border-radius: 9999px;
  appearance: none;
  background: var(--palette-sand);
  color: var(--palette-ink);
  font: inherit;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
  line-height: 1.25;
  cursor: pointer;
  transition: color 0.3s var(--motion-ease, ease);
}

.ambient-sound::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: var(--palette-ink);
  content: '';
  transform: scale(0);
  transition: transform 0.36s var(--motion-ease, ease);
}

.ambient-sound__meter {
  position: relative;
  z-index: 1;
}

.ambient-sound__meter {
  display: inline-flex;
  align-items: center;
  width: 14px;
  height: 14px;
  gap: 2px;
}

.ambient-sound__meter span {
  display: block;
  width: 2px;
  height: 10px;
  border-radius: 999px;
  background: currentColor;
  transform: scaleY(0.22);
  transform-origin: center;
}

.ambient-sound:not(.ambient-sound--on) .ambient-sound__meter span:first-child {
  width: 14px;
  height: 2px;
  transform: none;
}

.ambient-sound:not(.ambient-sound--on) .ambient-sound__meter span:nth-child(n + 2) {
  display: none;
}

.ambient-sound--on .ambient-sound__meter span {
  animation: ambient-meter 1.5s ease-in-out infinite alternate;
}

.ambient-sound--on .ambient-sound__meter span:nth-child(2) {
  animation-duration: 1.05s;
  animation-delay: -0.44s;
}

.ambient-sound--on .ambient-sound__meter span:nth-child(3) {
  animation-duration: 1.8s;
  animation-delay: -0.82s;
}

.ambient-sound[aria-disabled='true'] {
  cursor: default;
}

@media (max-width: 767.98px), (pointer: coarse) {
  .ambient-sound {
    width: 44px;
    min-height: 44px;
    justify-content: center;
    padding: 10px;
  }

}

@media (hover: hover) and (pointer: fine) {
  .ambient-sound:not([aria-disabled='true']):hover,
  .ambient-sound:not([aria-disabled='true']):focus-visible {
    color: var(--palette-milk, #f5f1e8);
  }

  .ambient-sound:not([aria-disabled='true']):hover::before,
  .ambient-sound:not([aria-disabled='true']):focus-visible::before {
    transform: scale(1);
  }
}

@keyframes ambient-meter {
  from { transform: scaleY(0.22); }
  to { transform: scaleY(0.9); }
}

@media not all {
  .ambient-sound,
  .ambient-sound::before {
    transition: none;
  }

  .ambient-sound--on .ambient-sound__meter span {
    animation: none;
    transform: scaleY(0.7);
  }
}
</style>
