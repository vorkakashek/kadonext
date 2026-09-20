import { homeCaseIds } from './homeCases'
import { LOCALE_CODES, localizedPath, stripLocalePrefix } from './localeRouting'

/** Canonical production identity; fragments and tracking parameters are not pages. */
export const SITE_URL = 'https://kadonext.com'
export const SITE_NAME = 'KADO'
export const SITE_EMAIL = 'hello@kadonext.com'
export const SITE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
export const SITE_PATHS = ['/', '/projects', ...homeCaseIds.map(id => `/projects/${id}`), '/privacy', '/consent']
export const LOCALIZED_SITE_PATHS = LOCALE_CODES.flatMap(locale => SITE_PATHS.map(path => localizedPath(path, locale)))

export function isSiteIndexable(value: unknown): boolean {
  return value === true || value === 'true'
}

export function canonicalPath(path: string): string {
  return stripLocalePrefix(path).split(/[?#]/, 1)[0]!.replace(/\/+$/, '') || '/'
}

export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export function serializeJsonLd(value: unknown): string {
  // Do not let content close the script element when serialized into HTML.
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
