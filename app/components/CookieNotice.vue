<script setup lang="ts">
import {
  rememberCookieNotice,
  wasCookieNoticeSeen,
} from '~/utils/cookieNotice'

// Static generation cannot know the visitor's cookie, so keep server and
// client initial trees identical. Returning visitors are hidden before paint
// by the small head probe, then this node is removed after hydration.
const visible = ref(true)
const { t, tm } = useI18n()
const localePath = useLocalePath()
const titleLines = computed(() => tm('cookieNotice.titleLines') as string[])

function dismiss() {
  // Persist synchronously before Vue removes the notice. `useCookie` writes
  // through an async watcher; hiding the only consumer in the same tick could
  // leave the UI dismissed without ever committing the browser cookie.
  rememberCookieNotice()
  visible.value = false
}

onMounted(() => {
  if (wasCookieNoticeSeen()) {
    visible.value = false
  }
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
        <h2 id="cookie-notice-title">
          <span
            v-for="line in titleLines"
            :key="line"
            class="cookie-notice__title-line"
          >{{ line }}</span>
        </h2>
        <span class="cookie-notice__mobile-cookie" aria-hidden="true">🍪</span>
        <div class="cookie-notice__text">
          <p>
            {{ t('cookieNotice.text') }}
            <NuxtLink :to="localePath('/privacy')" no-prefetch>{{ t('cookieNotice.details') }}</NuxtLink>
          </p>
        </div>
      </div>

      <button class="cookie-notice__button" type="button" @click="dismiss">
        <span class="cookie-notice__button-label cookie-notice__button-label--desktop">{{ t('cookieNotice.accept') }}</span>
        <span class="cookie-notice__button-label cookie-notice__button-label--mobile">{{ t('cookieNotice.acceptMobile') }}</span>
      </button>
    </aside>
  </Transition>
</template>

<style scoped>
.cookie-notice {
  position: fixed;
  right: max(var(--layout-margin), var(--safe-right));
  bottom: max(var(--layout-margin), var(--safe-bottom));
  /* Above the site's interactive overlays. */
  z-index: 9999;
  display: grid;
  width: min(42rem, calc(100vw - var(--layout-margin) * 2));
  padding: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--palette-ink) 18%, transparent);
  border-radius: var(--radius-surface);
  background: color-mix(in srgb, var(--palette-milk) 96%, transparent);
  box-shadow: 0 1.25rem 4rem color-mix(in srgb, var(--palette-ink) 14%, transparent);
  color: var(--palette-ink);
  font-family: "Fixel Critical", ui-sans-serif, system-ui, sans-serif;
  gap: 0.75rem;
  outline: none;
  backdrop-filter: blur(16px);
}

.cookie-notice__copy {
  display: grid;
  gap: 0.6rem;
}

.cookie-notice__text,
.cookie-notice h2 {
  margin: 0;
}

.cookie-notice h2 {
  font-size: clamp(1rem, 1.6vw, 1.25rem);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1.1;
  white-space: nowrap;
}

.cookie-notice h2 span {
  display: block;
}

.cookie-notice__text {
  display: grid;
  max-width: 55ch;
  font-size: 0.84rem;
  letter-spacing: -0.015em;
  line-height: 1.3;
}

.cookie-notice__text p {
  margin: 0;
}

.cookie-notice__text a {
  border-bottom: 1px solid currentColor;
  white-space: nowrap;
}

.cookie-notice__mobile-cookie {
  display: none;
}

.cookie-notice__button {
  --button-hover-fill: var(--palette-forest);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
  min-width: 6rem;
  min-height: 2.5rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--palette-ink);
  border-radius: 999px;
  background: var(--palette-ink);
  color: var(--palette-milk);
  cursor: pointer;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: -0.015em;
  line-height: 1.15;
  transition: background-color var(--motion-fast), color var(--motion-fast);
}

.cookie-notice__button-label {
  transform: translateY(calc(0.08em + 1px));
}

.cookie-notice__button-label--mobile {
  display: none;
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
    color: var(--palette-milk);
  }
}

.cookie-notice-enter-active,
.cookie-notice-leave-active {
  transition:
    transform 0.62s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.28s ease-out;
  will-change: transform, opacity;
}

.cookie-notice-leave-active {
  transition-duration: 0.38s, 0.24s;
  transition-timing-function: cubic-bezier(0.64, 0, 0.78, 0), ease-in;
}

.cookie-notice-enter-from,
.cookie-notice-leave-to {
  transform: translate3d(0, calc(100% + 4rem), 0);
  opacity: 0;
}

@media (min-width: 768px) {
  .cookie-notice {
    right: 0;
    bottom: 0;
    left: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    width: 100%;
    padding-block: 0.65rem max(0.65rem, var(--safe-bottom));
    padding-inline: max(var(--layout-margin-content), var(--safe-left))
      max(var(--layout-margin-content), var(--safe-right));
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 0;
    gap: clamp(1.25rem, 3vw, 3rem);
  }

  .cookie-notice__copy {
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: clamp(1.25rem, 3vw, 3rem);
  }

  .cookie-notice__text {
    display: block;
    max-width: none;
    font-size: var(--type-case-body-small);
    line-height: 1.3;
  }

  .cookie-notice__text p {
    display: inline;
  }

  .cookie-notice__button {
    justify-self: end;
    font-size: calc((var(--type-nav) + var(--type-lead)) * 0.3);
  }
}

@media (max-width: 767.98px) {
  .cookie-notice {
    right: 0;
    bottom: 0;
    left: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    width: 100%;
    padding: 0.65rem max(0.875rem, var(--safe-right))
      max(0.65rem, var(--safe-bottom)) max(0.875rem, var(--safe-left));
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 0;
    /* The sheet is visually opaque on mobile. Avoid a live blur pass over the
       continuously rendered WebGL scene underneath it. */
    background: var(--palette-milk);
    backdrop-filter: none;
    gap: 0.65rem;
  }

  .cookie-notice__copy {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.55rem;
  }

  .cookie-notice h2 {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .cookie-notice__text {
    font-size: clamp(0.7rem, 2.85vw, 0.8rem);
    line-height: 1.25;
  }

  .cookie-notice__mobile-cookie {
    display: block;
    font-size: 1.1rem;
    line-height: 1;
  }

  .cookie-notice__button {
    min-width: 3rem;
    min-height: 2.25rem;
    padding: 0.5rem 0.65rem;
    font-size: 0.8rem;
  }

  .cookie-notice__button-label--desktop {
    display: none;
  }

  .cookie-notice__button-label--mobile {
    display: inline;
    transform: none;
  }
}

</style>
