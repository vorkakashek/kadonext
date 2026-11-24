<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
useHead({ bodyAttrs: { class: 'sidequest-interactive' } })
</script>

<template>
  <main class="sidequest-playground">
    <header class="sidequest-playground__bar">
      <a :href="localePath('/projects/sidequest')">← {{ t('projects.interactive.back') }}</a>
      <h1>SIDEQUEST</h1>
      <span>{{ t('projects.interactive.hint') }}</span>
    </header>
    <iframe
      class="sidequest-playground__frame"
      src="/experiments/sidequest/index.html"
      :title="t('projects.interactive.frameTitle')"
      allow="autoplay"
    />
  </main>
</template>

<style>
body.sidequest-interactive { overflow: hidden; cursor: auto; }
.sidequest-playground { height: var(--app-screen, 100svh); display: flex; flex-direction: column; background: #d8ed82; color: #20231e; }
.sidequest-playground__bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex: 0 0 44px; padding-inline: 1.4rem; background: #20231e; color: #f9f7ed; font-size: 12px; }
.sidequest-playground__bar a { color: inherit; text-decoration: none; cursor: pointer; }
.sidequest-playground__bar a:focus-visible { outline: 1px solid currentColor; outline-offset: 5px; }
.sidequest-playground__bar h1 { margin: 0; font: inherit; letter-spacing: .08em; }
.sidequest-playground__bar > span { opacity: .7; font-size: 11px; }
.sidequest-playground__frame { display: block; width: 100%; flex: 1 1 auto; min-height: 0; border: 0; background: #d8ed82; }
@media (max-width: 767px) { .sidequest-playground__bar { padding-inline: .8rem; } .sidequest-playground__bar > span { display: none; } }
</style>
