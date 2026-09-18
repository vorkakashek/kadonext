<script setup lang="ts">
import { IconX } from '@tabler/icons-vue'

defineProps<{ label: string }>()
const emit = defineEmits<{ clear: [] }>()

function clearField(event: MouseEvent) {
  const field = (event.currentTarget as HTMLButtonElement).parentElement
    ?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  emit('clear')
  void nextTick(() => field?.focus({ preventScroll: true }))
}
</script>

<template>
  <button
    class="field-clear"
    type="button"
    :aria-label="label"
    :title="label"
    @pointerdown.prevent
    @click="clearField"
  >
    <IconX :size="18" stroke="1.5" aria-hidden="true" />
  </button>
</template>

<style scoped>
.field-clear {
  position: absolute;
  z-index: 2;
  top: var(--field-clear-top, calc(clamp(0.64rem, 0.96vw, 1rem) + clamp(-2.1rem, -2.7vw, -1.5rem) + clamp(1.65rem, 3vw, 3.5rem) * 0.43 / 2));
  right: -0.5rem;
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--palette-forest);
  cursor: pointer;
  transform: translateY(-50%);
}

.field-clear:hover {
  background: color-mix(in srgb, var(--palette-forest) 8%, transparent);
}

.field-clear:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>
