<script setup lang="ts">
import { onNavWaveEnter, onNavWaveLeave } from '~/utils/navWaveHover'

const currentYear = new Date().getFullYear()
const footerEl = ref<HTMLElement | null>(null)
const visualIsActive = ref(false)

let visualObserver: IntersectionObserver | null = null

onMounted(() => {
  const footer = footerEl.value
  if (!footer) return

  visualObserver = new IntersectionObserver(([entry]) => {
    visualIsActive.value = entry?.isIntersecting ?? false
  })
  visualObserver.observe(footer)
})

onUnmounted(() => {
  visualObserver?.disconnect()
  visualObserver = null
})
</script>

<template>
  <footer ref="footerEl" class="home-footer pointer-events-auto" aria-label="Подвал сайта">
    <div class="home-footer__surface">
      <div class="home-footer__info">
        <p class="home-footer__copyright">{{ currentYear }} KADŌ</p>
        <button
          class="home-footer__locale"
          type="button"
          lang="en"
          aria-label="Switch language"
        >
          en
        </button>

        <a
          class="home-footer__email"
          href="mailto:hello@kadonext.com"
          @mouseenter="onNavWaveEnter"
          @mouseleave="onNavWaveLeave"
          @focus="onNavWaveEnter"
          @blur="onNavWaveLeave"
        >
          hello@kadonext.com
          <TextLinkWave />
        </a>

        <div class="home-footer__legal">
          <NuxtLink
            class="home-footer__legal-title"
            to="/privacy"
            @mouseenter="onNavWaveEnter"
            @mouseleave="onNavWaveLeave"
            @focus="onNavWaveEnter"
            @blur="onNavWaveLeave"
          >
            политика конфиденциальности
            <TextLinkWave />
          </NuxtLink>
          <p class="home-footer__legal-note">
            *Instagram и Threads принадлежат Meta Platforms Inc. Деятельность
            Meta Platforms Inc. по реализации Instagram и Facebook признана
            экстремистской и запрещена на территории РФ.
          </p>
        </div>
      </div>
    </div>

    <div data-contact-photo-boundary class="home-footer__contact-anchor" aria-hidden="true" />
    <div class="home-footer__visual-spacer" aria-hidden="true" />
    <picture
      class="home-footer__visual"
      :class="{ 'is-active': visualIsActive }"
    >
      <source
        media="(max-width: 767.98px)"
        type="image/avif"
        srcset="/home/kira-photo-vertical-480.avif 480w, /home/kira-photo-vertical-960.avif 960w, /home/kira-photo-vertical-1200.avif 1200w"
        sizes="100vw"
      >
      <source
        media="(max-width: 767.98px)"
        type="image/webp"
        srcset="/home/kira-photo-vertical-480.webp 480w, /home/kira-photo-vertical-960.webp 960w, /home/kira-photo-vertical-1200.webp 1200w"
        sizes="100vw"
      >
      <source
        type="image/avif"
        srcset="/home/kira-photo-480.avif 480w, /home/kira-photo-960.avif 960w, /home/kira-photo-1440.avif 1440w, /home/kira-photo-1920.avif 1920w, /home/kira-photo-2760.avif 2760w, /home/kira-photo-3840.avif 3840w"
        sizes="100vw"
      >
      <source
        type="image/webp"
        srcset="/home/kira-photo-480.webp 480w, /home/kira-photo-960.webp 960w, /home/kira-photo-1440.webp 1440w, /home/kira-photo-1920.webp 1920w, /home/kira-photo-2760.webp 2760w, /home/kira-photo-3840.webp 3840w"
        sizes="100vw"
      >
      <img
        src="/home/kira-photo.webp"
        alt="Кира, кошка Антона"
        width="3840"
        height="1482"
        loading="lazy"
        decoding="async"
      >
    </picture>
  </footer>
</template>

<style scoped>
.home-footer {
  position: relative;
  width: 100%;
  /* Clip the fixed photo to the footer, including at the contact boundary. */
  clip-path: inset(0);
  color: var(--palette-ink);
}

.home-footer__surface {
  position: relative;
  z-index: 2;
  width: 100%;
  padding: var(--space-6) 0 calc(var(--space-2) + var(--space-1) / 2);
  background: var(--palette-sand);
}

.home-footer__info {
  display: grid;
  width: min(var(--layout-content-max), calc(100% - 2 * var(--layout-margin)));
  margin-inline: auto;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  align-items: start;
  font-size: var(--type-nav);
  letter-spacing: -0.025em;
  line-height: 1.25;
}

.home-footer__copyright,
.home-footer__legal-note {
  margin: 0;
}

.home-footer__copyright {
  grid-column: 2;
  white-space: nowrap;
}

.home-footer__locale {
  width: fit-content;
  border: 0;
  grid-column: 3;
  margin: -0.55rem -1.1rem;
  padding: 0.55rem 1.1rem;
  border-radius: 9999px;
  appearance: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  transition: background 0.22s ease, backdrop-filter 0.22s ease;
}

.home-footer__email {
  position: relative;
  width: fit-content;
  grid-column: 5 / span 2;
  white-space: nowrap;
}

.home-footer__legal {
  display: grid;
  grid-column: 8 / span 4;
  gap: var(--space-1);
}

.home-footer__legal-title {
  position: relative;
  width: fit-content;
  font-weight: 500;
  letter-spacing: -0.035em;
  line-height: 1.1;
}

.home-footer__email :deep(.text-link-wave),
.home-footer__legal-title :deep(.text-link-wave) {
  bottom: -0.22em;
}

.home-footer__legal-note {
  color: color-mix(in srgb, currentColor 35%, transparent);
  font-size: calc(var(--type-nav) * 0.66);
  letter-spacing: -0.015em;
  line-height: 1.45;
}

.home-footer__contact-anchor {
  height: 0;
}

.home-footer__visual-spacer {
  position: relative;
  width: 100%;
  aspect-ratio: 3840 / 1482;
}

.home-footer__visual {
  position: fixed;
  z-index: 1;
  bottom: 0;
  left: 0;
  display: block;
  width: 100%;
  aspect-ratio: 3840 / 1482;
  visibility: hidden;
  pointer-events: none;
}

.home-footer__visual.is-active {
  visibility: visible;
}

.home-footer__visual img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.home-footer__email:focus-visible,
.home-footer__legal-title:focus-visible,
.home-footer__locale:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}

@media (hover: hover) and (pointer: fine) {
  .home-footer__locale:hover,
  .home-footer__locale:focus-visible {
    background: color-mix(in srgb, var(--palette-sand) 70%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
}

@media (max-width: 1279.98px) {
  .home-footer__copyright {
    grid-column: 1 / span 2;
  }

  .home-footer__locale {
    grid-column: 3;
  }

  .home-footer__email {
    grid-column: 5 / span 3;
  }

  .home-footer__legal {
    grid-column: 8 / -1;
  }
}

@media (max-width: 767.98px) {
  .home-footer__surface {
    padding-top: var(--space-6);
  }

  .home-footer__info {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3) var(--layout-gutter);
  }

  .home-footer__copyright,
  .home-footer__locale,
  .home-footer__email,
  .home-footer__legal {
    grid-column: auto;
  }

  .home-footer__locale {
    justify-self: end;
  }

  .home-footer__email,
  .home-footer__legal {
    grid-column: 1 / -1;
  }

  .home-footer__visual-spacer,
  .home-footer__visual {
    aspect-ratio: 4 / 5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-footer__locale {
    transition: none;
  }
}

</style>
