/** Primary site routes + Page Canvas frames (spec §9.2). */

import { stripLocalePrefix } from './localeRouting'

export type SiteNavFrameKind = 'page'

export interface SiteNavFrame {
  id: string
  kind: SiteNavFrameKind
  /** Route for page frames. */
  to: string
  labelKey: string
  blurbKey: string
  /** Display index in canvas (01…). */
  index: string
  /** Preview motif class key for CSS miniature (fallback if shot missing). */
  motif: 'home' | 'projects' | 'services' | 'about' | 'contact'
  /** Static color viewport shot (desktop). */
  preview: string
  /** Baked grayscale sibling — no CSS filter on the tile. */
  previewBw: string
  /** Phone viewport color shot — used on thumb tiles, not a crop of `preview`. */
  previewM: string
  /** Baked grayscale sibling for `previewM`. */
  previewMBw: string
}

/** Header shortcuts (subset). */
export const headerLinks = [
  { labelKey: 'navigation.header.projects', to: '/projects' },
  { labelKey: 'navigation.header.services', to: '/#services' },
  { labelKey: 'navigation.header.contact', to: '/#contact' },
] as const

/** Full Page Canvas — link list + hover preview. */
export const canvasFrames: SiteNavFrame[] = [
  {
    id: 'home',
    kind: 'page',
    to: '/',
    labelKey: 'navigation.frames.home.label',
    blurbKey: 'navigation.frames.home.blurb',
    index: '01',
    motif: 'home',
    preview: '/previews/home.jpg',
    previewBw: '/previews/home-bw.jpg',
    previewM: '/previews/home-m.jpg',
    previewMBw: '/previews/home-m-bw.jpg',
  },
  {
    id: 'projects',
    kind: 'page',
    to: '/projects',
    labelKey: 'navigation.frames.projects.label',
    blurbKey: 'navigation.frames.projects.blurb',
    index: '02',
    motif: 'projects',
    preview: '/previews/projects.jpg',
    previewBw: '/previews/projects-bw.jpg',
    previewM: '/previews/projects-m.jpg',
    previewMBw: '/previews/projects-m-bw.jpg',
  },
  {
    id: 'services',
    kind: 'page',
    to: '/#services',
    labelKey: 'navigation.frames.services.label',
    blurbKey: 'navigation.frames.services.blurb',
    index: '03',
    motif: 'services',
    preview: '/previews/services.jpg',
    previewBw: '/previews/services-bw.jpg',
    previewM: '/previews/services-m.jpg',
    previewMBw: '/previews/services-m-bw.jpg',
  },
  {
    id: 'about',
    kind: 'page',
    to: '/#about',
    labelKey: 'navigation.frames.about.label',
    blurbKey: 'navigation.frames.about.blurb',
    index: '04',
    motif: 'about',
    preview: '/previews/about.jpg',
    previewBw: '/previews/about-bw.jpg',
    previewM: '/previews/about-m.jpg',
    previewMBw: '/previews/about-m-bw.jpg',
  },
  {
    id: 'contact',
    kind: 'page',
    to: '/#contact',
    labelKey: 'navigation.frames.contact.label',
    blurbKey: 'navigation.frames.contact.blurb',
    index: '05',
    motif: 'contact',
    preview: '/previews/contact.jpg',
    previewBw: '/previews/contact-bw.jpg',
    previewM: '/previews/contact-m.jpg',
    previewMBw: '/previews/contact-m-bw.jpg',
  },
]

export function matchFramePath(path: string): string {
  const clean = stripLocalePrefix(path).replace(/\/+$/, '') || '/'
  const exact = canvasFrames.find((f) => clean === f.to)
  if (exact) return exact.id
  if (clean === '/') return 'home'
  const pathOnly = clean.split('#', 1)[0] || '/'
  const hit = canvasFrames.find((f) => (
    !f.to.includes('#')
    && f.to !== '/'
    && pathOnly.startsWith(f.to)
  ))
  return hit?.id ?? 'home'
}
