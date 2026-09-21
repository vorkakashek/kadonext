<script setup lang="ts">
import { IconCheck, IconChevronDown } from '@tabler/icons-vue'

const props = defineProps<{ modelValue: string; devices: MediaDeviceInfo[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; refresh: [] }>()
const { raiseAbovePopover } = useSiteCursor()
const { t } = useI18n()
const triggerEl = ref<HTMLButtonElement | null>(null)
const menuEl = ref<HTMLDivElement | null>(null)
const open = ref(false)
const topLayer = ref(true)
const activeIndex = ref(0)
const menuId = `voice-devices-${useId()}`
const menuStyle = ref<Record<string, string>>({})
const options = computed(() => [
  { value: '', label: t('voice.defaultDevice') },
  ...props.devices.filter(device => device.deviceId && device.deviceId !== 'default')
    .map((device, index) => ({ value: device.deviceId, label: device.label || t('voice.microphone', { number: index + 1 }) })),
])
const selectedLabel = computed(() => options.value.find(option => option.value === props.modelValue)?.label || t('voice.defaultDevice'))
let search = ''
let lastSearchAt = 0

function positionMenu() {
  const trigger = triggerEl.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const viewport = window.visualViewport
  const left = viewport?.offsetLeft ?? 0
  const top = viewport?.offsetTop ?? 0
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  const gap = 8
  const margin = 12
  const below = top + height - rect.bottom
  const above = rect.top - top
  const upwards = below < 160 && above > below
  const menuWidth = Math.min(Math.max(rect.width, 320), width - margin * 2)
  menuStyle.value = {
    left: `${Math.max(left + margin, Math.min(rect.right - menuWidth, left + width - margin - menuWidth))}px`,
    top: `${upwards ? rect.top - gap : rect.bottom + gap}px`,
    width: `${menuWidth}px`,
    maxHeight: `${Math.max(0, Math.min(288, (upwards ? above : below) - gap - margin))}px`,
    transform: upwards ? 'translateY(-100%)' : 'none',
  }
}

function revealActiveOption() {
  const menu = menuEl.value
  const option = menu?.children[activeIndex.value] as HTMLElement | undefined
  if (!menu || !option) return
  // Scroll only the options, keeping the page and its surface still.
  const top = option.offsetTop
  const bottom = top + option.offsetHeight
  if (top < menu.scrollTop) menu.scrollTop = top
  else if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight
}

async function openMenu(last = false) {
  if (props.disabled || open.value) return
  emit('refresh')
  const selected = Math.max(0, options.value.findIndex(option => option.value === props.modelValue))
  activeIndex.value = last ? options.value.length - 1 : selected
  search = ''
  positionMenu()
  open.value = true
  await nextTick()
  if (!open.value) return
  if (topLayer.value && !menuEl.value?.matches(':popover-open')) menuEl.value?.showPopover()
  if (topLayer.value) raiseAbovePopover()
  revealActiveOption()
}

function closeMenu() {
  if (topLayer.value && menuEl.value?.matches(':popover-open')) menuEl.value.hidePopover()
  open.value = false
  search = ''
}

function choose(index: number) {
  const option = options.value[index]
  if (!option || props.disabled) return
  emit('update:modelValue', option.value)
  closeMenu()
  triggerEl.value?.focus({ preventScroll: true })
}

function move(index: number) {
  activeIndex.value = (index + options.value.length) % options.value.length
  void nextTick(revealActiveOption)
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      event.preventDefault()
      if (!open.value) void openMenu(event.key === 'ArrowUp')
      else move(activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1))
      return
    case 'Home':
    case 'End':
      event.preventDefault()
      if (!open.value) void openMenu()
      move(event.key === 'Home' ? 0 : options.value.length - 1)
      return
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (open.value) choose(activeIndex.value)
      else void openMenu()
      return
    case 'Escape':
      if (open.value) { event.preventDefault(); event.stopPropagation(); closeMenu() }
      return
    case 'Tab':
      closeMenu()
      return
  }
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
  event.preventDefault()
  if (!open.value) void openMenu()
  const now = performance.now()
  search = now - lastSearchAt < 700 ? search + event.key.toLocaleLowerCase() : event.key.toLocaleLowerCase()
  lastSearchAt = now
  const query = [...search].every(letter => letter === search[0]) ? search[0]! : search
  const count = options.value.length
  for (let step = 1; step <= count; step++) {
    const index = (activeIndex.value + step) % count
    if (options.value[index]?.label.toLocaleLowerCase().startsWith(query)) { move(index); break }
  }
}

function outside(event: Event) {
  const target = event.target
  if (!(target instanceof Node)) return
  if (!triggerEl.value?.contains(target) && !menuEl.value?.contains(target)) closeMenu()
}
function onScroll(event: Event) {
  if (event.target instanceof Node && menuEl.value?.contains(event.target)) return
  closeMenu()
}
function onVisibilityChange() { if (document.hidden) closeMenu() }
function onResize() { if (open.value) positionMenu() }
function listen(add: boolean) {
  const action = add ? 'addEventListener' : 'removeEventListener'
  document[action]('pointerdown', outside, true)
  document[action]('focusin', outside, true)
  document[action]('visibilitychange', onVisibilityChange)
  window[action]('scroll', onScroll, true)
  window[action]('resize', onResize)
  window.visualViewport?.[action]('resize', onResize)
}
watch(open, value => listen(value), { flush: 'sync' })
watch(() => props.disabled, value => { if (value) closeMenu() })
watch(options, (value, previous) => {
  const active = previous[activeIndex.value]?.value ?? props.modelValue
  activeIndex.value = Math.max(0, value.findIndex(option => option.value === active))
  if (open.value) void nextTick(revealActiveOption)
})
onMounted(() => { topLayer.value = typeof menuEl.value?.showPopover === 'function' })
onDeactivated(closeMenu)
onBeforeUnmount(() => { closeMenu(); listen(false) })
</script>

<template>
  <div class="voice-device-select">
    <button
      ref="triggerEl"
      type="button"
      class="voice-device-select__trigger"
      role="combobox"
      :aria-label="t('voice.deviceWithName', { name: selectedLabel })"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="menuId"
      :aria-activedescendant="open ? `${menuId}-${activeIndex}` : undefined"
      :disabled="disabled"
      :title="selectedLabel"
      @click="open ? closeMenu() : openMenu()"
      @keydown="onKeydown"
      @focus="emit('refresh')"
    >
      <span class="voice-device-select__label">{{ selectedLabel }}</span>
      <IconChevronDown :size="16" stroke="1.5" aria-hidden="true" />
    </button>
    <!-- The browser top layer escapes the animated surface's clipping without moving it.
         Older browsers move only this small menu to the document body. -->
    <Teleport to="body" :disabled="topLayer">
      <div
        :id="menuId"
        ref="menuEl"
        v-show="topLayer || open"
        class="voice-device-select__menu"
        :popover="topLayer ? 'manual' : undefined"
        role="listbox"
        :aria-label="t('voice.device')"
        :style="menuStyle"
        data-lenis-prevent
      >
        <div
          v-for="(option, index) in options"
          :id="`${menuId}-${index}`"
          :key="option.value"
          class="voice-device-select__option"
          :class="{ 'is-active': activeIndex === index, 'is-selected': modelValue === option.value }"
          role="option"
          :aria-selected="modelValue === option.value"
          @pointermove="activeIndex = index"
          @mousedown.prevent
          @click="choose(index)"
        >
          <span>{{ option.label }}</span>
          <IconCheck v-if="modelValue === option.value" :size="16" stroke="1.5" aria-hidden="true" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.voice-device-select { min-width: 0; }
.voice-device-select__trigger { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; width: 100%; min-height: 2.5rem; padding: 0.25rem 0; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--palette-forest) 22%, transparent); border-radius: 0; background: transparent; color: var(--palette-forest); font: inherit; font-size: 0.8rem; text-align: left; cursor: pointer; }
.voice-device-select__label { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; transform: translateY(0.12em); }
.voice-device-select__trigger :deep(svg) { flex: none; transition: transform 0.18s ease; }
.voice-device-select__trigger[aria-expanded="true"] { border-bottom-color: var(--palette-forest); }
.voice-device-select__trigger[aria-expanded="true"] :deep(svg) { transform: rotate(180deg); }
.voice-device-select__trigger:focus-visible { outline: 2px solid var(--palette-forest); outline-offset: 4px; }
.voice-device-select__trigger:disabled { opacity: 0.45; cursor: default; }
.voice-device-select__menu { position: fixed; inset: auto; z-index: 1000; box-sizing: border-box; margin: 0; padding: 0.35rem; border: 1px solid color-mix(in srgb, var(--palette-forest) 22%, transparent); border-radius: 4px; background: var(--palette-sand); color: var(--palette-forest); box-shadow: 0 8px 24px color-mix(in srgb, var(--palette-ink) 12%, transparent); font-family: var(--font-sans); font-size: 0.8rem; line-height: 1.35; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--palette-moss) transparent; }
.voice-device-select__option { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; min-height: 2.75rem; padding: 0.65rem 0.75rem; border-radius: 2px; cursor: pointer; }
.voice-device-select__option > span { min-width: 0; overflow-wrap: anywhere; transform: translateY(0.12em); }
.voice-device-select__option :deep(svg) { flex: none; }
.voice-device-select__option.is-selected { font-weight: 500; }
.voice-device-select__option.is-active { background: var(--palette-forest); color: var(--palette-sand); }
@media not all { .voice-device-select__trigger :deep(svg) { transition: none; } }
</style>
