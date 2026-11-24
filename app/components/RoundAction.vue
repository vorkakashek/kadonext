<script setup lang="ts">
withDefaults(defineProps<{
  href: string
  external?: boolean
}>(), { external: false })
</script>

<template>
  <a
    class="round-action"
    data-button-hover
    :href="href"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
  >
    <span class="round-action__label"><slot /></span>
    <span class="round-action__icon" aria-hidden="true"><SiteIcon name="arrow-up-right" /></span>
  </a>
</template>

<style scoped>
.round-action {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
  align-items: center;
  gap: var(--space-3);
  padding: 6px 6px 6px 1.1em;
  overflow: hidden;
  border: 1px solid var(--palette-ink);
  border-radius: 999px;
  color: var(--palette-ink);
  font-size: var(--type-nav);
  line-height: 1.2;
  text-decoration: none;
  vertical-align: middle;
  transition: color .25s ease, border-color .25s ease;
}
.round-action__label { min-width: 0; }
.round-action__icon {
  display: grid;
  flex: 0 0 2.2em;
  width: 2.2em;
  height: 2.2em;
  place-items: center;
  border-radius: 50%;
  background: var(--palette-ink);
  color: var(--palette-milk);
  transition: transform var(--button-hover-duration) var(--button-hover-ease), background-color .22s ease;
}
.round-action:focus-visible { outline: 2px solid var(--palette-forest); outline-offset: 5px; }
.round-action[data-button-hover-active] { border-color: var(--palette-forest); transition-delay: 0s, .32s; }
.round-action[data-button-hover-active]::before { background-color: var(--palette-forest); transition-delay: 0s, .32s; }
.round-action[data-button-hover-active] .round-action__icon { background-color: transparent; transform: rotate(45deg); }
</style>
