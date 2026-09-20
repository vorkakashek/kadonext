<script setup lang="ts">
const props = defineProps<{
  title: string
  blurb: string
  index: string
}>()

const { openCanvas } = usePageCanvas()
const { t } = useI18n()
const localePath = useLocalePath()

useSeoMeta({
  title: () => `${props.title} — KADO`,
  description: () => props.blurb,
})
</script>

<template>
  <div class="page-stub bg-sand text-ink">
    <main class="page-stub__main">
      <p class="page-stub__index" aria-hidden="true">{{ index }}</p>
      <h1 class="page-stub__title">{{ title }}</h1>
      <p class="page-stub__blurb">{{ blurb }}</p>
      <p class="page-stub__note">
        {{ t('pages.stubNote') }}
      </p>
      <div class="page-stub__actions">
        <NuxtLink class="page-stub__link" :to="localePath('/')">
          {{ t('common.home') }}
        </NuxtLink>
        <button type="button" class="page-stub__link page-stub__link--btn" @click="openCanvas">
          {{ t('common.openMenu') }}
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page-stub {
  min-height: 100svh;
  min-height: 100dvh;
}

.page-stub__main {
  box-sizing: border-box;
  max-width: var(--layout-content-max);
  margin-inline: auto;
  padding-inline: var(--layout-margin);
  padding-top: calc(var(--layout-surface-top) + var(--space-block));
  padding-bottom: var(--space-section);
}

.page-stub__index {
  margin: 0 0 0.5rem;
  font-size: var(--type-nav);
  letter-spacing: 0.08em;
  color: var(--palette-ash);
}

.page-stub__title {
  margin: 0;
  font-size: var(--type-display);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.05;
}

.page-stub__blurb {
  margin: 0.75rem 0 0;
  max-width: 28rem;
  font-size: var(--type-lead);
  line-height: 1.35;
}

.page-stub__note {
  margin: var(--space-block) 0 0;
  max-width: 32rem;
  font-size: var(--type-body);
  color: var(--palette-ash);
  line-height: 1.45;
}

.page-stub__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  margin-top: var(--space-block);
}

.page-stub__link {
  font-size: var(--type-nav);
  color: var(--palette-ink);
  text-decoration: underline;
  text-underline-offset: 0.2em;
  cursor: pointer;
  transition: opacity var(--motion-base) var(--motion-ease);
}

.page-stub__link--btn {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
}

.page-stub__link:hover,
.page-stub__link:focus-visible {
  opacity: var(--motion-hover-opacity);
}
</style>
