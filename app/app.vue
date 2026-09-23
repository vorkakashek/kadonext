<script setup lang="ts">
const enhancementsReady = ref(false)
const route = useRoute()
const basePath = computed(() => baseRoutePath(route.path))
// Capture the initial document route. Later SPA navigation keeps using the
// dedicated page/case transitions and should not be treated as a cold load.
const initialHomeDocument = basePath.value === '/'
useState<boolean>('initial-home-document', () => initialHomeDocument)
const heroWebglBooted = useState<boolean>('home-hero-webgl-booted', () => false)
const cursorReady = computed(
  () => enhancementsReady.value && (!initialHomeDocument || heroWebglBooted.value),
)
const homeIntroGate = useHomeIntroGate()
const homeSurfaceReady = useState<boolean>('home-surface-ready', () => false)

useSiteSeo()

if (import.meta.client && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

onMounted(() => {
  // The cold home intro owns the first short scroll gate. It is intentionally
  // started after hydration: the SSR page remains paintable, and the bounded
  // fallback below guarantees that a missing live surface cannot dead-lock it.
  homeIntroGate.start(initialHomeDocument && !route.hash)

  const mountEnhancements = () => {
    enhancementsReady.value = true
  }
  // Closed overlays and decorative controls are not part of the first frame.
  // Load them during the first idle window, with a bounded fallback so the
  // menu and route transitions are ready before a typical first interaction.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(mountEnhancements, { timeout: 1200 })
  } else {
    globalThis.setTimeout(mountEnhancements, 400)
  }
})

watch(
  homeIntroGate.surfaceReady,
  (ready) => {
    if (ready) homeSurfaceReady.value = true
  },
  { immediate: true },
)

watch(
  () => basePath.value,
  (path) => {
    if (path !== '/') homeIntroGate.unlock()
  },
)
</script>

<template>
  <div>
    <div class="pc-live-stack">
      <div class="page-shell">
        <div class="page-shell__paint">
          <!-- Keep Nuxt's native route-key contract. Combining a custom
               page-key with the Home page's per-route KeepAlive corrupts the
               production activation context during SPA navigation. -->
          <NuxtPage />
        </div>
      </div>
    </div>
    <SiteHeader />
    <ClientOnly>
      <LazyCookieNotice />
      <LazyCaseDetailTransition v-if="enhancementsReady" />
      <LazyPageCanvas v-if="enhancementsReady" />
      <LazyPageIris v-if="enhancementsReady" />
      <LazySiteCursor v-if="cursorReady" />
      <LazyCustomScrollbar v-if="enhancementsReady" />
    </ClientOnly>
  </div>
</template>

<style>
/* Opaque navigation overlays must not let the document move underneath. */
html.page-canvas-lock,
html.page-iris-lock {
  overflow: hidden;
  overscroll-behavior: none;
}

html.page-canvas-lock body,
html.page-iris-lock body {
  overflow: hidden;
  overscroll-behavior: none;
}

html.home-intro-lock {
  overflow: hidden;
  overscroll-behavior: none;
}

html.home-intro-lock body {
  overflow: hidden;
  overscroll-behavior: none;
}

/* Lid over the swarm snaps off while the page iris still covers. */
html.page-iris-lock .hero-swarm-cover {
  transition: none !important;
}

.pc-live-stack {
  position: relative;
  z-index: 1;
}

.page-shell {
  position: relative;
  z-index: 1;
  min-height: 100svh;
  min-height: 100dvh;
}

/* Overlay is opaque — keep the live page compositing underneath so close
   iris has a real frame (visibility:hidden drops the WebGL buffer on Android). */
html.page-canvas-surface .page-shell {
  pointer-events: none;
}

.page-shell__paint {
  min-height: 100svh;
  min-height: 100dvh;
}
</style>
