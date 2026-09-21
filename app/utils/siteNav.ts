/** Primary site routes + Page Canvas frames (spec §9.2). */

import type { LocaleCode } from '~/generated/locales/manifest'
import { stripLocalePrefix } from './localeRouting'

export type SiteNavFrameKind = 'page'

export interface SiteNavPreviewSet {
  /** Static color viewport shot (desktop). */
  desktop: string
  /** Baked grayscale sibling for `desktop`. */
  desktopBw: string
  /** Phone viewport color shot. */
  mobile: string
  /** Baked grayscale sibling for `mobile`. */
  mobileBw: string
}

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
  /** Locale-specific viewport shots used by Page Canvas. */
  previews: Record<LocaleCode, SiteNavPreviewSet>
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
    previews: previewSet('home'),
  },
  {
    id: 'projects',
    kind: 'page',
    to: '/projects',
    labelKey: 'navigation.frames.projects.label',
    blurbKey: 'navigation.frames.projects.blurb',
    index: '02',
    motif: 'projects',
    previews: previewSet('projects'),
  },
  {
    id: 'services',
    kind: 'page',
    to: '/#services',
    labelKey: 'navigation.frames.services.label',
    blurbKey: 'navigation.frames.services.blurb',
    index: '03',
    motif: 'services',
    previews: previewSet('services'),
  },
  {
    id: 'about',
    kind: 'page',
    to: '/#about',
    labelKey: 'navigation.frames.about.label',
    blurbKey: 'navigation.frames.about.blurb',
    index: '04',
    motif: 'about',
    previews: previewSet('about'),
  },
  {
    id: 'contact',
    kind: 'page',
    to: '/#contact',
    labelKey: 'navigation.frames.contact.label',
    blurbKey: 'navigation.frames.contact.blurb',
    index: '05',
    motif: 'contact',
    previews: previewSet('contact'),
  },
]

function previewSet(id: string): Record<LocaleCode, SiteNavPreviewSet> {
  const paths = (prefix: string): SiteNavPreviewSet => ({
    desktop: `${prefix}/${id}.jpg`,
    desktopBw: `${prefix}/${id}-bw.jpg`,
    mobile: `${prefix}/${id}-m.jpg`,
    mobileBw: `${prefix}/${id}-m-bw.jpg`,
  })

  return {
    ru: paths('/previews'),
    en: paths('/previews/en'),
  }
}

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
