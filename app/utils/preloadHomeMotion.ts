/**
 * Warm GSAP / Three module graph before SPA return to `/`,
 * so logo→home doesn't pay cold dynamic-import on the critical path.
 */
let gsapWarm: Promise<void> | null = null
let threeWarm: Promise<void> | null = null
let heroEnvironmentWarm: Promise<void> | null = null

export function preloadGsapBundle() {
  if (!import.meta.client) return Promise.resolve()
  if (!gsapWarm) {
    gsapWarm = Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ]).then(() => undefined)
  }
  return gsapWarm
}

export function preloadThreeBundle() {
  if (!import.meta.client) return Promise.resolve()
  if (!threeWarm) {
    // Evaluate Three separately from the async Vue scene. On a cold mobile
    // load, importing the complete component here can make module evaluation,
    // Vue mount and WebGL context creation collapse into one long task. The
    // renderer dependency is the expensive part; warming it first leaves the
    // much smaller component wrapper for the following task.
    threeWarm = import('three').then(() => undefined)
  }
  return threeWarm
}

export function preloadHomeMotionBundles() {
  return Promise.all([preloadGsapBundle(), preloadThreeBundle()]).then(
    () => undefined,
  )
}

/** Warm only the desktop HDR response, without evaluating the Three scene. */
export function preloadHeroEnvironmentAsset() {
  if (!import.meta.client || heroEnvironmentWarm) return heroEnvironmentWarm ?? Promise.resolve()

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean }
  }).connection
  if (
    connection?.saveData
    || connection?.effectiveType === 'slow-2g'
    || connection?.effectiveType === '2g'
  ) return Promise.resolve()

  const runtimeConfig = (globalThis as typeof globalThis & {
    __NUXT__?: { config?: { public?: { assetCdnUrl?: string } } }
  }).__NUXT__?.config?.public
  const environmentUrl = prefixPublicAssetReferences(
    '/env/studio_small_09_256.hdr',
    String(runtimeConfig?.assetCdnUrl || ''),
  )
  heroEnvironmentWarm = fetch(environmentUrl, {
    credentials: 'same-origin',
  })
    // Consume the body so the later HDRLoader request can reliably reuse the
    // completed HTTP-cache entry instead of racing an abandoned response.
    .then(response => response.arrayBuffer())
    .then(() => undefined)
    .catch(() => undefined)
  return heroEnvironmentWarm
}

/** Warm motion modules and the desktop Hero environment before scene mount. */
export function preloadHomeSceneAssets(modeOrEvent?: 'desktop' | 'mobile' | Event) {
  void preloadHomeMotionBundles()
  if (typeof window === 'undefined') return

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean }
  }).connection
  if (
    connection?.saveData
    || connection?.effectiveType === 'slow-2g'
    || connection?.effectiveType === '2g'
  ) return

  const requestedMode = typeof modeOrEvent === 'string' ? modeOrEvent : undefined
  const mobile = requestedMode
    ? requestedMode === 'mobile'
    : window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches
  // Mobile uses baked matcaps and has no HDR/PMREM startup cost.
  if (mobile) return
  void preloadHeroEnvironmentAsset()
}
import { prefixPublicAssetReferences } from './assetCdn'
