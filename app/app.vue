<script setup lang="ts">
import { PLAIN_COLD_HOME } from '~/utils/introExperiment'
import { wasCookieNoticeSeen } from '~/utils/cookieNotice'

const enhancementsReady = ref(false)
const cookieNoticeMountReady = ref(false)
const route = useRoute()
const basePath = computed(() => baseRoutePath(route.path))
// Capture the initial document route. Later SPA navigation keeps using the
// dedicated page/case transitions and should not be treated as a cold load.
const initialHomeDocument = basePath.value === '/'
useState<boolean>('initial-home-document', () => initialHomeDocument)
const pageCanvasMountReady = ref(!initialHomeDocument)
const simpleHomeIntroReady = useState<boolean>(
  'home-simple-intro-ready',
  () => !PLAIN_COLD_HOME || !initialHomeDocument,
)
const criticalFontReady = useState<boolean>(
  'home-critical-font-ready',
  () => !initialHomeDocument,
)
const heroWebglBooted = useState<boolean>('home-hero-webgl-booted', () => false)
const heroIntroPending = useState<boolean>('home-hero-intro-pending', () => true)
const cursorReady = computed(
  () => enhancementsReady.value && (!initialHomeDocument || heroWebglBooted.value),
)
const homeIntroGate = useHomeIntroGate()
const homeSurfaceReady = useState<boolean>('home-surface-ready', () => false)
let enhancementFallbackTimer = 0
let pageCanvasFallbackTimer = 0
let pageCanvasIdleId: number | null = null
let stopPageCanvasMountWatch: (() => void) | null = null
let fullFontIdleId: number | null = null
let fullFontFallbackTimer = 0
let cookieNoticeDelayTimer = 0
let cookieNoticeIdleId: number | null = null
let appUnmounted = false

useSiteSeo()

if (import.meta.client && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

onMounted(async () => {
  appUnmounted = false
  const mobile = window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches
  const plainColdEntry = PLAIN_COLD_HOME && initialHomeDocument

  if (plainColdEntry) homeIntroGate.unlock()
  else homeIntroGate.start(initialHomeDocument)

  const mountPageCanvas = () => {
    pageCanvasIdleId = null
    if (pageCanvasFallbackTimer) {
      window.clearTimeout(pageCanvasFallbackTimer)
      pageCanvasFallbackTimer = 0
    }
    if (!appUnmounted) pageCanvasMountReady.value = true
  }
  const schedulePageCanvas = () => {
    if (pageCanvasMountReady.value || pageCanvasIdleId !== null) return
    if (pageCanvasFallbackTimer) {
      window.clearTimeout(pageCanvasFallbackTimer)
      pageCanvasFallbackTimer = 0
    }
    if (typeof window.requestIdleCallback === 'function') {
      pageCanvasIdleId = window.requestIdleCallback(mountPageCanvas, { timeout: 360 })
    } else {
      pageCanvasFallbackTimer = window.setTimeout(mountPageCanvas, 80)
    }
  }

  if (!initialHomeDocument || !mobile) {
    mountPageCanvas()
  } else {
    // Give the first visible hero frame exclusive priority, then prepare the
    // menu during the entrance instead of waiting for the whole timeline.
    // A failed intro must not permanently remove navigation.
    pageCanvasFallbackTimer = window.setTimeout(schedulePageCanvas, 3000)
    const queuePageCanvasAfterHeroStart = () => {
      stopPageCanvasMountWatch?.()
      stopPageCanvasMountWatch = null
      if (pageCanvasFallbackTimer) window.clearTimeout(pageCanvasFallbackTimer)
      pageCanvasFallbackTimer = window.setTimeout(schedulePageCanvas, 280)
    }
    if (!heroIntroPending.value) {
      queuePageCanvasAfterHeroStart()
    } else {
      stopPageCanvasMountWatch = watch(
        heroIntroPending,
        (pending) => {
          if (!pending) queuePageCanvasAfterHeroStart()
        },
        { flush: 'post' },
      )
    }
  }

  // Consent UI is neither content nor part of the first interaction. Keep its
  // component code and scoped CSS out of the critical path, and skip the chunk
  // entirely for returning visitors who have already dismissed it.
  if (!wasCookieNoticeSeen()) {
    cookieNoticeDelayTimer = window.setTimeout(() => {
      cookieNoticeDelayTimer = 0
      const mountCookieNotice = () => {
        cookieNoticeIdleId = null
        if (!appUnmounted && !wasCookieNoticeSeen()) cookieNoticeMountReady.value = true
      }
      if (typeof window.requestIdleCallback === 'function') {
        cookieNoticeIdleId = window.requestIdleCallback(mountCookieNotice, { timeout: 900 })
      } else {
        mountCookieNotice()
      }
    }, 1500)
  }

  const enableFullFonts = async () => {
    fullFontIdleId = null
    if (fullFontFallbackTimer) {
      window.clearTimeout(fullFontFallbackTimer)
      fullFontFallbackTimer = 0
    }
    if ('fonts' in document) {
      // Text and Display point at the same variable WOFF2. Loading the two
      // aliases concurrently makes Chromium issue duplicate cold requests;
      // prime one face first and let the second alias reuse the font cache.
      await Promise.allSettled([
        document.fonts.load('400 1rem "Fixel Text"'),
      ])
    }
    if (!appUnmounted) document.documentElement.classList.add('fonts-enhanced')
  }

  // Hero and header use Fixel Critical explicitly. Fetch the complete family
  // only after the authored entrance has had time to start, so it cannot
  // compete with the face that gates the first visible text.
  if (initialHomeDocument) {
    fullFontFallbackTimer = window.setTimeout(() => {
      fullFontFallbackTimer = 0
      if (typeof window.requestIdleCallback === 'function') {
        fullFontIdleId = window.requestIdleCallback(() => void enableFullFonts(), { timeout: 1150 })
      } else {
        void enableFullFonts()
      }
    }, mobile ? 2200 : 1400)
  } else {
    document.documentElement.classList.add('fonts-enhanced')
  }

  if (initialHomeDocument) {
    if ('fonts' in document) {
      // Keep the copy covered until the small critical face is ready. Both
      // desktop and mobile then animate the final glyph metrics from frame one.
      let fontFallbackTimer = 0
      await Promise.race([
        document.fonts.load('600 1rem "Fixel Critical"').catch(() => []),
        new Promise<void>((resolve) => {
          fontFallbackTimer = window.setTimeout(resolve, 1800)
        }),
      ])
      window.clearTimeout(fontFallbackTimer)
    }
    if (!appUnmounted) {
      criticalFontReady.value = true
      if (plainColdEntry) {
        requestAnimationFrame(() => {
          simpleHomeIntroReady.value = true
        })
      } else {
        simpleHomeIntroReady.value = true
      }
    }
  } else {
    criticalFontReady.value = true
    simpleHomeIntroReady.value = true
  }

  const mountEnhancements = () => {
    if (enhancementsReady.value) return
    enhancementsReady.value = true
    if (enhancementFallbackTimer) {
      window.clearTimeout(enhancementFallbackTimer)
      enhancementFallbackTimer = 0
    }
  }
  // Closed overlays and decorative controls are not part of the first frame.
  // Load them during the first idle window, with a bounded fallback so the
  // menu and route transitions are ready before a typical first interaction.
  if (mobile) {
    // Never turn the user's first tap into a synchronous mount burst: it can
    // contend with the cold-home entrance and used to leave the menu busy if
    // its lazy component had not mounted yet.
    enhancementFallbackTimer = window.setTimeout(mountEnhancements, 2400)
  } else if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(mountEnhancements, { timeout: 1200 })
  } else {
    globalThis.setTimeout(mountEnhancements, 400)
  }
})

onUnmounted(() => {
  appUnmounted = true
  if (fullFontIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(fullFontIdleId)
  }
  if (fullFontFallbackTimer) window.clearTimeout(fullFontFallbackTimer)
  if (enhancementFallbackTimer) window.clearTimeout(enhancementFallbackTimer)
  if (pageCanvasFallbackTimer) window.clearTimeout(pageCanvasFallbackTimer)
  if (pageCanvasIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(pageCanvasIdleId)
  }
  stopPageCanvasMountWatch?.()
  stopPageCanvasMountWatch = null
  if (cookieNoticeDelayTimer) window.clearTimeout(cookieNoticeDelayTimer)
  if (cookieNoticeIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(cookieNoticeIdleId)
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
      <LazyCookieNotice v-if="cookieNoticeMountReady" />
      <LazyCaseDetailTransition v-if="enhancementsReady" />
      <LazyPageCanvas v-if="pageCanvasMountReady" />
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
