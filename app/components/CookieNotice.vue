<script setup lang="ts">
import {
  COOKIE_NOTICE_COOKIE,
  COOKIE_NOTICE_MAX_AGE,
} from '~/utils/cookieNotice'

const noticeCookie = useCookie<string | null>(COOKIE_NOTICE_COOKIE, {
  default: () => null,
  maxAge: COOKIE_NOTICE_MAX_AGE,
  path: '/',
  sameSite: 'lax',
  secure: useRequestURL().protocol === 'https:',
})
const visible = ref(noticeCookie.value !== '1')
const { t, tm } = useI18n()
const localePath = useLocalePath()
const titleLines = computed(() => tm('cookieNotice.titleLines') as string[])
const noticeTextParts = computed(() => {
  const words = t('cookieNotice.text').trim().split(/\s+/)
  if (words.length < 2) return words

  const totalLength = words.reduce((sum, word) => sum + word.length, 0) + words.length - 1
  let currentLength = 0
  let splitAt = 1
  for (let index = 0; index < words.length - 1; index++) {
    currentLength += words[index]!.length + (index > 0 ? 1 : 0)
    splitAt = index + 1
    if (currentLength >= totalLength / 2) break
  }
  return [
    words.slice(0, splitAt).join(' '),
    words.slice(splitAt).join(' '),
  ]
})

function dismiss() {
  noticeCookie.value = '1'
  visible.value = false
}

</script>

<template>
  <Transition name="cookie-notice" appear>
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
        <div class="cookie-notice__text">
          <p v-for="part in noticeTextParts" :key="part">{{ part }}</p>
          <p class="cookie-notice__note">
            {{ t('cookieNotice.note') }}
            <NuxtLink :to="localePath('/privacy')" no-prefetch>{{ t('cookieNotice.details') }}</NuxtLink>
          </p>
        </div>
      </div>

      <button class="cookie-notice__button" type="button" @click="dismiss">
        {{ t('cookieNotice.accept') }}
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
  padding: clamp(1.25rem, 2vw, 1.75rem);
  border: 1px solid color-mix(in srgb, var(--palette-ink) 18%, transparent);
  border-radius: var(--radius-surface);
  background: color-mix(in srgb, var(--palette-milk) 96%, transparent);
  box-shadow: 0 1.25rem 4rem color-mix(in srgb, var(--palette-ink) 14%, transparent);
  color: var(--palette-ink);
  font-family: "Fixel Critical", ui-sans-serif, system-ui, sans-serif;
  gap: clamp(1.25rem, 2vw, 2rem);
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
  max-width: 19ch;
  font-size: clamp(1.45rem, 1.8vw, 1.85rem);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1;
}

.cookie-notice h2 span {
  display: block;
}

.cookie-notice__text {
  display: grid;
  max-width: 55ch;
  font-size: 0.9rem;
  letter-spacing: -0.015em;
  line-height: 1.42;
}

.cookie-notice__text p {
  margin: 0;
}

.cookie-notice__note {
  display: block;
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
  font-size: 0.95rem;
  font-weight: 500;
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
    padding-block: clamp(1rem, 1.5vw, 1.35rem) max(1rem, var(--safe-bottom));
    padding-inline: max(var(--layout-margin-content), var(--safe-left))
      max(var(--layout-margin-content), var(--safe-right));
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 0;
    gap: clamp(2rem, 5vw, 6rem);
  }

  .cookie-notice__copy {
    grid-template-columns: minmax(13rem, 0.55fr) minmax(0, 1.45fr);
    align-items: center;
    gap: clamp(2rem, 5vw, 6rem);
  }

  .cookie-notice__text {
    display: block;
    max-width: none;
  }

  .cookie-notice__text p {
    display: inline;
  }

  .cookie-notice__text p + p::before {
    content: " ";
  }

  .cookie-notice__note {
    display: inline;
    margin-left: 0;
  }

  .cookie-notice__button {
    justify-self: end;
    font-size: 1.125rem;
  }
}

@media (max-width: 767.98px) {
  .cookie-notice {
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    padding: 1.25rem max(1.25rem, var(--safe-right))
      max(1.25rem, var(--safe-bottom)) max(1.25rem, var(--safe-left));
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 0;
    /* The sheet is visually opaque on mobile. Avoid a live blur pass over the
       continuously rendered WebGL scene underneath it. */
    background: var(--palette-milk);
    backdrop-filter: none;
    gap: 1.25rem;
  }

  .cookie-notice h2 {
    font-size: clamp(1.35rem, 6.4vw, 1.65rem);
  }

  .cookie-notice__button {
    width: 100%;
  }
}

</style>
