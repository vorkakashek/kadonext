/**
 * Warm GSAP / Three module graph before SPA return to `/`,
 * so logo→home doesn't pay cold dynamic-import on the critical path.
 */
let gsapWarm: Promise<void> | null = null
let threeWarm: Promise<void> | null = null

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
    threeWarm = import('three').then(() => undefined)
  }
  return threeWarm
}

export function preloadHomeMotionBundles() {
  return Promise.all([preloadGsapBundle(), preloadThreeBundle()]).then(
    () => undefined,
  )
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
  const runtimeConfig = (globalThis as typeof globalThis & {
    __NUXT__?: { config?: { public?: { assetCdnUrl?: string } } }
  }).__NUXT__?.config?.public
  const environmentUrl = prefixPublicAssetReferences(
    '/env/studio_small_09_256.hdr',
    String(runtimeConfig?.assetCdnUrl || ''),
  )
  void fetch(environmentUrl, {
    credentials: 'same-origin',
  }).catch(() => undefined)
}
import { prefixPublicAssetReferences } from './assetCdn'
