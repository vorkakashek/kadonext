<script setup lang="ts">
import {
  rememberCookieNotice,
  wasCookieNoticeSeen,
} from '~/utils/cookieNotice'

const visible = ref(false)

function dismiss() {
  rememberCookieNotice()
  visible.value = false
}

onMounted(() => {
  visible.value = !wasCookieNoticeSeen()
})
</script>

<template>
  <Transition name="cookie-notice">
    <aside
      v-if="visible"
      class="cookie-notice pointer-events-auto"
      aria-labelledby="cookie-notice-title"
    >
      <div class="cookie-notice__copy">
        <p class="cookie-notice__eyebrow">немного памяти</p>
        <h2 id="cookie-notice-title">сайт тоже кое-что запоминает</h2>
        <p class="cookie-notice__text">
          Технические cookie и память браузера сохраняют настройки и не
          показывают одно и то же дважды. Ничего личного — буквально.
          <NuxtLink to="/privacy">Что именно?</NuxtLink>
        </p>
      </div>

      <button class="cookie-notice__button" type="button" @click="dismiss">
        ок
      </button>
    </aside>
  </Transition>
</template>

<style scoped>
.cookie-notice {
  position: fixed;
  right: max(var(--layout-margin), var(--safe-right));
  bottom: max(var(--layout-margin), var(--safe-bottom));
  /* Above every interactive overlay, but below the brand preloader (10000). */
  z-index: 9999;
  display: grid;
  width: min(42rem, calc(100vw - var(--layout-margin) * 2));
  padding: clamp(1.25rem, 2vw, 1.75rem);
  border: 1px solid color-mix(in srgb, var(--palette-ink) 18%, transparent);
  border-radius: var(--radius-surface);
  background: color-mix(in srgb, var(--palette-milk) 96%, transparent);
  box-shadow: 0 1.25rem 4rem color-mix(in srgb, var(--palette-ink) 14%, transparent);
  color: var(--palette-ink);
  gap: clamp(1.25rem, 2vw, 2rem);
  outline: none;
  backdrop-filter: blur(16px);
}

.cookie-notice__copy {
  display: grid;
  gap: 0.6rem;
}

.cookie-notice__eyebrow,
.cookie-notice__text,
.cookie-notice h2 {
  margin: 0;
}

.cookie-notice__eyebrow {
  color: var(--palette-ash);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  line-height: 1.2;
}

.cookie-notice h2 {
  max-width: 19ch;
  font-size: clamp(1.6rem, 2.1vw, 2.15rem);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 0.98;
}

.cookie-notice__text {
  max-width: 55ch;
  font-size: 0.9rem;
  letter-spacing: -0.015em;
  line-height: 1.42;
}

.cookie-notice__text a {
  border-bottom: 1px solid currentColor;
  white-space: nowrap;
}

.cookie-notice__button {
  justify-self: start;
  min-width: 7rem;
  min-height: 3rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--palette-ink);
  border-radius: 999px;
  background: var(--palette-ink);
  color: var(--palette-milk);
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  letter-spacing: -0.015em;
  line-height: 1.15;
  transition: background-color var(--motion-fast), color var(--motion-fast);
}

.cookie-notice__button:focus-visible {
  outline: 2px solid var(--palette-forest);
  outline-offset: 3px;
}

@media (hover: hover) and (pointer: fine) {
  .cookie-notice__text a:hover {
    color: var(--palette-forest);
  }

  .cookie-notice__button:hover {
    border-color: var(--palette-forest);
    background: var(--palette-forest);
    color: var(--palette-milk);
  }
}

.cookie-notice-enter-active,
.cookie-notice-leave-active {
  transition:
    opacity var(--motion-base),
    transform var(--motion-layout) cubic-bezier(0.22, 1, 0.36, 1);
}

.cookie-notice-enter-from,
.cookie-notice-leave-to {
  opacity: 0;
  transform: translateY(1.25rem) scale(0.98);
}

@media (max-width: 767.98px) {
  .cookie-notice {
    right: max(var(--layout-margin), var(--safe-right));
    bottom: max(var(--layout-margin), var(--safe-bottom));
    width: calc(100vw - var(--layout-margin) * 2);
    padding: 1.25rem;
    gap: 1.25rem;
  }

  .cookie-notice h2 {
    font-size: clamp(1.5rem, 7.3vw, 1.85rem);
  }

  .cookie-notice__button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cookie-notice-enter-active,
  .cookie-notice-leave-active,
  .cookie-notice__button {
    transition: none;
  }
}
</style>
