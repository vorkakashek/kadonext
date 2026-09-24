<script setup lang="ts">
defineProps<{
  disclosureId: string
  title: string
  paragraphs: string[]
}>()
const { t } = useI18n()

const emit = defineEmits<{
  layoutChange: []
}>()

const open = ref(false)

function toggle() {
  open.value = !open.value
}

function handleTransition(event: TransitionEvent) {
  if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return
  emit('layoutChange')
}
</script>

<template>
  <div
    class="case-disclosure"
    role="button"
    tabindex="0"
    :aria-expanded="open"
    :aria-controls="disclosureId"
    @click="toggle"
    @keydown.enter="toggle"
    @keydown.space.prevent="toggle"
  >
    <span class="case-disclosure__title" v-html="title" />
    <div
      :id="disclosureId"
      class="case-disclosure__body"
      :class="{ 'is-open': open }"
      @transitionend="handleTransition"
      @transitioncancel="handleTransition"
    >
      <div class="case-disclosure__body-clip">
        <div class="case-disclosure__body-inner">
          <p v-for="(paragraph, index) in paragraphs" :key="`${index}-${paragraph}`">{{ paragraph }}</p>
        </div>
      </div>
    </div>
    <span
      class="case-disclosure__trigger"
      aria-hidden="true"
    >
      <span class="case-disclosure__pill">
        <span class="case-disclosure__pill-label">{{ open ? t('projects.detail.disclosureCollapse') : t('projects.detail.disclosureRead') }}</span>
        <SiteIcon :name="open ? 'minus' : 'plus'" :size="18" />
      </span>
    </span>
  </div>
</template>

<style scoped>
.case-disclosure {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  text-align: center;
  cursor: pointer;
}

.case-disclosure__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.case-disclosure__title {
  display: block;
  max-width: 16ch;
  font-size: clamp(2.75rem, 6.5vw, 7.5rem);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 0.91;
}

.case-disclosure__pill {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  margin-top: var(--space-4);
  padding: 0;
  border: 1px solid color-mix(in srgb, currentColor 55%, transparent);
  border-radius: 999px;
  font-size: calc((var(--type-nav) + var(--type-lead)) * 0.5);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.25;
  overflow: hidden;
  transition: width 300ms cubic-bezier(0.22, 1, 0.36, 1), padding-left 300ms cubic-bezier(0.22, 1, 0.36, 1), margin-top 1s cubic-bezier(0.22, 1, 0.36, 1), background-color 300ms ease;
}

.case-disclosure:hover .case-disclosure__pill,
.case-disclosure:focus-visible .case-disclosure__pill {
  width: 7.6rem;
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.case-disclosure:not([aria-expanded='true']):hover .case-disclosure__pill,
.case-disclosure:not([aria-expanded='true']):focus-visible .case-disclosure__pill {
  padding-left: 0.4rem;
}

.case-disclosure[aria-expanded='true']:hover .case-disclosure__pill,
.case-disclosure[aria-expanded='true']:focus-visible .case-disclosure__pill {
  width: 11rem;
}

.case-disclosure__pill-label {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateX(0.35rem);
  transition: max-width 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, transform 300ms ease;
  white-space: nowrap;
}

.case-disclosure:hover .case-disclosure__pill-label,
.case-disclosure:focus-visible .case-disclosure__pill-label {
  max-width: 7.5rem;
  margin-right: 0.4rem;
  opacity: 1;
  transform: none;
}

.case-disclosure:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 0.75rem;
}

.case-disclosure__body {
  display: grid;
  grid-template-rows: 0fr;
  width: 100%;
  margin-top: 0;
  opacity: 0;
  transition: grid-template-rows 1s cubic-bezier(0.22, 1, 0.36, 1), margin-top 1s cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease;
}

.case-disclosure__body.is-open {
  grid-template-rows: 1fr;
  margin-top: var(--space-case-disclosure-open);
  opacity: 1;
}

.case-disclosure__body-clip {
  min-height: 0;
  overflow: hidden;
}

.case-disclosure__body-inner {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  row-gap: var(--space-4);
  text-align: left;
}

.case-disclosure__body p {
  margin: 0;
  font-size: var(--type-case-body-large);
  font-weight: 300;
  letter-spacing: -0.04em;
  line-height: 1.17;
  text-wrap: pretty;
}

.case-disclosure__body p:first-child { grid-column: 2 / span 5; }
.case-disclosure__body p:last-child { grid-column: 7 / span 5; }
.case-disclosure__body p:only-child { grid-column: 3 / span 8; }

@media (min-width: 1920px) {
  .case-disclosure__body p:first-child { grid-column: 2 / span 4; }
  .case-disclosure__body p:last-child { grid-column: 8 / span 4; }
  .case-disclosure__body p:only-child { grid-column: 4 / span 6; }
}

@media (max-width: 767.98px) {
  .case-disclosure__title {
    max-width: none;
    font-size: clamp(1.875rem, 8vw, 2.25rem);
  }
  .case-disclosure__body-inner {
    grid-template-columns: 1fr;
    row-gap: var(--space-3);
  }
  .case-disclosure__body p { font-size: var(--type-case-body); }
  .case-disclosure__body p:first-child,
  .case-disclosure__body p:last-child,
  .case-disclosure__body p:only-child { grid-column: 1; }
}

@media not all {
  .case-disclosure__pill,
  .case-disclosure__body { transition: none; }
}
</style>
