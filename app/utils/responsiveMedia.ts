type ResponsiveMediaPreset = {
  width: number
  height: number
  webpSrcset: string
  avifSrcset: string
  sizes: string
  mobileSrc?: string
  mobileWebpSrcset?: string
  mobileAvifSrcset?: string
}

const presets: Record<string, ResponsiveMediaPreset> = {
  '/home/cases/keys-store/keys-1.webp': {
    width: 3200,
    height: 2400,
    webpSrcset: '/home/cases/keys-store/keys-1-480.webp 480w, /home/cases/keys-store/keys-1-960.webp 960w, /home/cases/keys-store/keys-1-1440.webp 1440w, /home/cases/keys-store/keys-1-2079.webp 2079w',
    avifSrcset: '/home/cases/keys-store/keys-1-480.avif 480w, /home/cases/keys-store/keys-1-960.avif 960w, /home/cases/keys-store/keys-1-1440.avif 1440w, /home/cases/keys-store/keys-1-2079.avif 2079w',
    sizes: '(max-width: 767px) 92vw, 50vw',
    mobileSrc: '/home/cases/keys-store/keys-1-vertical.webp',
    mobileWebpSrcset: '/home/cases/keys-store/keys-1-vertical-480.webp 480w, /home/cases/keys-store/keys-1-vertical-960.webp 960w, /home/cases/keys-store/keys-1-vertical-1440.webp 1440w',
    mobileAvifSrcset: '/home/cases/keys-store/keys-1-vertical-480.avif 480w, /home/cases/keys-store/keys-1-vertical-960.avif 960w, /home/cases/keys-store/keys-1-vertical-1440.avif 1440w',
  },
  '/home/cases/keys-store/keys-2.webp': {
    width: 4000,
    height: 4000,
    webpSrcset: '/home/cases/keys-store/keys-2-480.webp 480w, /home/cases/keys-store/keys-2-960.webp 960w, /home/cases/keys-store/keys-2-1440.webp 1440w, /home/cases/keys-store/keys-2-2079.webp 2079w',
    avifSrcset: '/home/cases/keys-store/keys-2-480.avif 480w, /home/cases/keys-store/keys-2-960.avif 960w, /home/cases/keys-store/keys-2-1440.avif 1440w, /home/cases/keys-store/keys-2-2079.avif 2079w',
    sizes: '(max-width: 767px) 92vw, 50vw',
  },
  '/home/cases/keys-store/keys-3.webp': {
    width: 3840,
    height: 2160,
    webpSrcset: '/home/cases/keys-store/keys-3-480.webp 480w, /home/cases/keys-store/keys-3-960.webp 960w, /home/cases/keys-store/keys-3-1440.webp 1440w, /home/cases/keys-store/keys-3-2079.webp 2079w',
    avifSrcset: '/home/cases/keys-store/keys-3-480.avif 480w, /home/cases/keys-store/keys-3-960.avif 960w, /home/cases/keys-store/keys-3-1440.avif 1440w, /home/cases/keys-store/keys-3-2079.avif 2079w',
    sizes: '(max-width: 767px) 92vw, 50vw',
  },
  ...Object.fromEntries([5, 6, 7, 8].map(index => [
    `/home/cases/keys-store/keys-${index}.webp`,
    {
      width: 2560,
      height: 1440,
      webpSrcset: `/home/cases/keys-store/keys-${index}-480.webp 480w, /home/cases/keys-store/keys-${index}-960.webp 960w, /home/cases/keys-store/keys-${index}-1440.webp 1440w, /home/cases/keys-store/keys-${index}-2079.webp 2079w`,
      avifSrcset: `/home/cases/keys-store/keys-${index}-480.avif 480w, /home/cases/keys-store/keys-${index}-960.avif 960w, /home/cases/keys-store/keys-${index}-1440.avif 1440w, /home/cases/keys-store/keys-${index}-2079.avif 2079w`,
      sizes: '(max-width: 767px) 92vw, 50vw',
    },
  ])),
  '/home/cases/keys-store/keys-4.webp': {
    width: 2560,
    height: 1440,
    webpSrcset: '/home/cases/keys-store/keys-4-480.webp 480w, /home/cases/keys-store/keys-4-960.webp 960w, /home/cases/keys-store/keys-4-1440.webp 1440w, /home/cases/keys-store/keys-4-2079.webp 2079w',
    avifSrcset: '/home/cases/keys-store/keys-4-480.avif 480w, /home/cases/keys-store/keys-4-960.avif 960w, /home/cases/keys-store/keys-4-1440.avif 1440w, /home/cases/keys-store/keys-4-2079.avif 2079w',
    sizes: '(max-width: 767px) 92vw, 50vw',
    mobileSrc: '/home/cases/keys-store/keys-4-vertical.webp',
    mobileWebpSrcset: '/home/cases/keys-store/keys-4-vertical-480.webp 480w, /home/cases/keys-store/keys-4-vertical-960.webp 960w, /home/cases/keys-store/keys-4-vertical-1440.webp 1440w',
    mobileAvifSrcset: '/home/cases/keys-store/keys-4-vertical-480.avif 480w, /home/cases/keys-store/keys-4-vertical-960.avif 960w, /home/cases/keys-store/keys-4-vertical-1440.avif 1440w',
  },
  '/home/cases/keys-store/keys-9.webp': {
    width: 5504,
    height: 3072,
    webpSrcset: '/home/cases/keys-store/keys-9-480.webp 480w, /home/cases/keys-store/keys-9-960.webp 960w, /home/cases/keys-store/keys-9-1440.webp 1440w, /home/cases/keys-store/keys-9-2079.webp 2079w, /home/cases/keys-store/keys-9-2760.webp 2760w',
    avifSrcset: '/home/cases/keys-store/keys-9-480.avif 480w, /home/cases/keys-store/keys-9-960.avif 960w, /home/cases/keys-store/keys-9-1440.avif 1440w, /home/cases/keys-store/keys-9-2079.avif 2079w, /home/cases/keys-store/keys-9-2760.avif 2760w',
    sizes: '100vw',
  },
  '/home/cases/keys-store/keys-10.webp': {
    width: 2175,
    height: 3022,
    webpSrcset: '/home/cases/keys-store/keys-10-480.webp 480w, /home/cases/keys-store/keys-10-960.webp 960w, /home/cases/keys-store/keys-10-1440.webp 1440w, /home/cases/keys-store/keys-10-2079.webp 2079w',
    avifSrcset: '/home/cases/keys-store/keys-10-480.avif 480w, /home/cases/keys-store/keys-10-960.avif 960w, /home/cases/keys-store/keys-10-1440.avif 1440w, /home/cases/keys-store/keys-10-2079.avif 2079w',
    sizes: '(max-width: 767px) 78vw, 34vw',
    mobileSrc: '/home/cases/keys-store/keys-10-horizontal.webp',
    mobileWebpSrcset: '/home/cases/keys-store/keys-10-horizontal-480.webp 480w, /home/cases/keys-store/keys-10-horizontal-960.webp 960w, /home/cases/keys-store/keys-10-horizontal-1440.webp 1440w, /home/cases/keys-store/keys-10-horizontal-2079.webp 2079w',
    mobileAvifSrcset: '/home/cases/keys-store/keys-10-horizontal-480.avif 480w, /home/cases/keys-store/keys-10-horizontal-960.avif 960w, /home/cases/keys-store/keys-10-horizontal-1440.avif 1440w, /home/cases/keys-store/keys-10-horizontal-2079.avif 2079w',
  },
  '/home/cases/keys-store/keys-11.webp': {
    width: 4500,
    height: 3000,
    webpSrcset: '/home/cases/keys-store/keys-11-480.webp 480w, /home/cases/keys-store/keys-11-960.webp 960w, /home/cases/keys-store/keys-11-1440.webp 1440w, /home/cases/keys-store/keys-11-2079.webp 2079w, /home/cases/keys-store/keys-11-2760.webp 2760w',
    avifSrcset: '/home/cases/keys-store/keys-11-480.avif 480w, /home/cases/keys-store/keys-11-960.avif 960w, /home/cases/keys-store/keys-11-1440.avif 1440w, /home/cases/keys-store/keys-11-2079.avif 2079w, /home/cases/keys-store/keys-11-2760.avif 2760w',
    sizes: '(max-width: 767px) 108vw, 64vw',
  },
  '/home/cases/keys-store/keys-12.webp': {
    width: 3412,
    height: 2000,
    webpSrcset: '/home/cases/keys-store/keys-12-480.webp 480w, /home/cases/keys-store/keys-12-960.webp 960w, /home/cases/keys-store/keys-12-1440.webp 1440w, /home/cases/keys-store/keys-12-2079.webp 2079w, /home/cases/keys-store/keys-12-2760.webp 2760w',
    avifSrcset: '/home/cases/keys-store/keys-12-480.avif 480w, /home/cases/keys-store/keys-12-960.avif 960w, /home/cases/keys-store/keys-12-1440.avif 1440w, /home/cases/keys-store/keys-12-2079.avif 2079w, /home/cases/keys-store/keys-12-2760.avif 2760w',
    sizes: '100vw',
    mobileSrc: '/home/cases/keys-store/keys-12-vertical.webp',
    mobileWebpSrcset: '/home/cases/keys-store/keys-12-vertical-480.webp 480w, /home/cases/keys-store/keys-12-vertical-960.webp 960w, /home/cases/keys-store/keys-12-vertical-1440.webp 1440w',
    mobileAvifSrcset: '/home/cases/keys-store/keys-12-vertical-480.avif 480w, /home/cases/keys-store/keys-12-vertical-960.avif 960w, /home/cases/keys-store/keys-12-vertical-1440.avif 1440w',
  },
  '/home/cases/schmidt/schmidt-1.webp': {
    width: 6000,
    height: 4000,
    webpSrcset: '/home/cases/schmidt/schmidt-1-480.webp 480w, /home/cases/schmidt/schmidt-1-960.webp 960w, /home/cases/schmidt/schmidt-1-1440.webp 1440w, /home/cases/schmidt/schmidt-1-1920.webp 1920w, /home/cases/schmidt/schmidt-1-2760.webp 2760w',
    avifSrcset: '/home/cases/schmidt/schmidt-1-480.avif 480w, /home/cases/schmidt/schmidt-1-960.avif 960w, /home/cases/schmidt/schmidt-1-1440.avif 1440w, /home/cases/schmidt/schmidt-1-1920.avif 1920w, /home/cases/schmidt/schmidt-1-2760.avif 2760w',
    sizes: '(max-width: 767px) 100vw, 100vw',
    mobileSrc: '/home/cases/schmidt/schmidt-1-vertical.webp',
    mobileWebpSrcset: '/home/cases/schmidt/schmidt-1-vertical-480.webp 480w, /home/cases/schmidt/schmidt-1-vertical-960.webp 960w, /home/cases/schmidt/schmidt-1-vertical-1440.webp 1440w',
    mobileAvifSrcset: '/home/cases/schmidt/schmidt-1-vertical-480.avif 480w, /home/cases/schmidt/schmidt-1-vertical-960.avif 960w, /home/cases/schmidt/schmidt-1-vertical-1440.avif 1440w',
  },
  '/home/cases/schmidt/schmidt-3.webp': {
    width: 2560,
    height: 1280,
    webpSrcset: '/home/cases/schmidt/schmidt-3-480.webp 480w, /home/cases/schmidt/schmidt-3-960.webp 960w, /home/cases/schmidt/schmidt-3-1440.webp 1440w, /home/cases/schmidt/schmidt-3-1920.webp 1920w, /home/cases/schmidt/schmidt-3-2560.webp 2560w',
    avifSrcset: '/home/cases/schmidt/schmidt-3-480.avif 480w, /home/cases/schmidt/schmidt-3-960.avif 960w, /home/cases/schmidt/schmidt-3-1440.avif 1440w, /home/cases/schmidt/schmidt-3-1920.avif 1920w, /home/cases/schmidt/schmidt-3-2560.avif 2560w',
    sizes: '100vw',
    mobileSrc: '/home/cases/schmidt/schmidt-3-vertical.webp',
    mobileWebpSrcset: '/home/cases/schmidt/schmidt-3-vertical-480.webp 480w, /home/cases/schmidt/schmidt-3-vertical-960.webp 960w, /home/cases/schmidt/schmidt-3-vertical-1080.webp 1080w',
    mobileAvifSrcset: '/home/cases/schmidt/schmidt-3-vertical-480.avif 480w, /home/cases/schmidt/schmidt-3-vertical-960.avif 960w, /home/cases/schmidt/schmidt-3-vertical-1080.avif 1080w',
  },
  '/home/cases/schmidt/schmidt-4.webp': {
    width: 1600,
    height: 2000,
    webpSrcset: '/home/cases/schmidt/schmidt-4-480.webp 480w, /home/cases/schmidt/schmidt-4-960.webp 960w, /home/cases/schmidt/schmidt-4-1440.webp 1440w, /home/cases/schmidt/schmidt-4-1600.webp 1600w',
    avifSrcset: '/home/cases/schmidt/schmidt-4-480.avif 480w, /home/cases/schmidt/schmidt-4-960.avif 960w, /home/cases/schmidt/schmidt-4-1440.avif 1440w, /home/cases/schmidt/schmidt-4-1600.avif 1600w',
    sizes: '(max-width: 767px) 58vw, 35vw',
  },
  '/home/cases/schmidt/schmidt-5.webp': {
    width: 2560,
    height: 1600,
    webpSrcset: '/home/cases/schmidt/schmidt-5-480.webp 480w, /home/cases/schmidt/schmidt-5-960.webp 960w, /home/cases/schmidt/schmidt-5-1440.webp 1440w, /home/cases/schmidt/schmidt-5-1920.webp 1920w, /home/cases/schmidt/schmidt-5-2560.webp 2560w',
    avifSrcset: '/home/cases/schmidt/schmidt-5-480.avif 480w, /home/cases/schmidt/schmidt-5-960.avif 960w, /home/cases/schmidt/schmidt-5-1440.avif 1440w, /home/cases/schmidt/schmidt-5-1920.avif 1920w, /home/cases/schmidt/schmidt-5-2560.avif 2560w',
    sizes: '(max-width: 767px) 116vw, 62vw',
  },
  ...Object.fromEntries([6, 7, 8, 9].map(number => [
    `/home/cases/schmidt/schmidt-${number}.webp`,
    {
      width: 2560,
      height: 1600,
      webpSrcset: [480, 960, 1440, 1920, 2560]
        .map(width => `/home/cases/schmidt/schmidt-${number}-${width}.webp ${width}w`)
        .join(', '),
      avifSrcset: [480, 960, 1440, 1920, 2560]
        .map(width => `/home/cases/schmidt/schmidt-${number}-${width}.avif ${width}w`)
        .join(', '),
      sizes: '(max-width: 767px) 116vw, 45vw',
    },
  ])),
  '/home/cases/schmidt/schmidt-10.webp': {
    width: 2560,
    height: 1280,
    webpSrcset: '/home/cases/schmidt/schmidt-10-480.webp 480w, /home/cases/schmidt/schmidt-10-960.webp 960w, /home/cases/schmidt/schmidt-10-1440.webp 1440w, /home/cases/schmidt/schmidt-10-1920.webp 1920w, /home/cases/schmidt/schmidt-10-2560.webp 2560w',
    avifSrcset: '/home/cases/schmidt/schmidt-10-480.avif 480w, /home/cases/schmidt/schmidt-10-960.avif 960w, /home/cases/schmidt/schmidt-10-1440.avif 1440w, /home/cases/schmidt/schmidt-10-1920.avif 1920w, /home/cases/schmidt/schmidt-10-2560.avif 2560w',
    sizes: '100vw',
    mobileSrc: '/home/cases/schmidt/schmidt-10-vertical.webp',
    mobileWebpSrcset: '/home/cases/schmidt/schmidt-10-vertical-480.webp 480w, /home/cases/schmidt/schmidt-10-vertical-960.webp 960w, /home/cases/schmidt/schmidt-10-vertical-1440.webp 1440w',
    mobileAvifSrcset: '/home/cases/schmidt/schmidt-10-vertical-480.avif 480w, /home/cases/schmidt/schmidt-10-vertical-960.avif 960w, /home/cases/schmidt/schmidt-10-vertical-1440.avif 1440w',
  },
  '/home/cases/schmidt/schmidt-11.webp': {
    width: 2560,
    height: 1280,
    webpSrcset: '/home/cases/schmidt/schmidt-11-480.webp 480w, /home/cases/schmidt/schmidt-11-960.webp 960w, /home/cases/schmidt/schmidt-11-1440.webp 1440w, /home/cases/schmidt/schmidt-11-1920.webp 1920w, /home/cases/schmidt/schmidt-11-2560.webp 2560w',
    avifSrcset: '/home/cases/schmidt/schmidt-11-480.avif 480w, /home/cases/schmidt/schmidt-11-960.avif 960w, /home/cases/schmidt/schmidt-11-1440.avif 1440w, /home/cases/schmidt/schmidt-11-1920.avif 1920w, /home/cases/schmidt/schmidt-11-2560.avif 2560w',
    sizes: '100vw',
    mobileSrc: '/home/cases/schmidt/schmidt-11-vertical.webp',
    mobileWebpSrcset: '/home/cases/schmidt/schmidt-11-vertical-480.webp 480w, /home/cases/schmidt/schmidt-11-vertical-960.webp 960w, /home/cases/schmidt/schmidt-11-vertical-1440.webp 1440w, /home/cases/schmidt/schmidt-11-vertical-1920.webp 1920w, /home/cases/schmidt/schmidt-11-vertical-2215.webp 2215w',
    mobileAvifSrcset: '/home/cases/schmidt/schmidt-11-vertical-480.avif 480w, /home/cases/schmidt/schmidt-11-vertical-960.avif 960w, /home/cases/schmidt/schmidt-11-vertical-1440.avif 1440w, /home/cases/schmidt/schmidt-11-vertical-1920.avif 1920w, /home/cases/schmidt/schmidt-11-vertical-2215.avif 2215w',
  },
}

/**
 * Decorate localized content with generated delivery candidates. The content
 * stays readable and source-led; asset metadata has one shared authority.
 */
export function attachResponsiveMedia<T>(value: T, assetCdnUrl = ''): T {
  if (Array.isArray(value)) {
    const attached = value.map(item => attachResponsiveMedia(item))
    return (assetCdnUrl ? prefixAssetTree(attached, assetCdnUrl) : attached) as T
  }
  if (!value || typeof value !== 'object') return value

  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    next[key] = attachResponsiveMedia(child)
  }
  const src = typeof next.src === 'string' ? next.src : ''
  const preset = presets[src]
  const merged = preset ? { ...next, ...preset } : next
  return (assetCdnUrl ? prefixAssetTree(merged, assetCdnUrl) : merged) as T
}

function prefixAssetTree<T>(value: T, assetCdnUrl: string): T {
  if (typeof value === 'string') return prefixPublicAssetReferences(value, assetCdnUrl) as T
  if (Array.isArray(value)) return value.map(item => prefixAssetTree(item, assetCdnUrl)) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, prefixAssetTree(child, assetCdnUrl)]),
  ) as T
}
import { prefixPublicAssetReferences } from './assetCdn'
