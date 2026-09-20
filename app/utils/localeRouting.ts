import type { LocaleCode } from '~/generated/locales/manifest'

export const LOCALE_CODES = ['ru', 'en'] as const satisfies readonly LocaleCode[]
const LOCALE_PREFIX_RE = /^\/(ru|en)(?=\/|$)/

export function localeFromPath(path: string): LocaleCode | null {
  return LOCALE_PREFIX_RE.exec(path)?.[1] as LocaleCode | undefined ?? null
}

/** Remove only the leading locale segment, preserving query strings and hashes. */
export function stripLocalePrefix(path: string): string {
  const stripped = path.replace(LOCALE_PREFIX_RE, '')
  if (!stripped || stripped.startsWith('?') || stripped.startsWith('#')) return `/${stripped}`
  return stripped
}

/** Build a locale-prefixed internal URL from a base or already-localized URL. */
export function localizedPath(path: string, locale: LocaleCode): string {
  const base = stripLocalePrefix(path.startsWith('/') ? path : `/${path}`)
  return `/${locale}${base}`
}

export function baseRoutePath(path: string): string {
  return stripLocalePrefix(path).split(/[?#]/, 1)[0]!.replace(/\/+$/, '') || '/'
}

export function isLocalizedHome(path: string): boolean {
  return baseRoutePath(path) === '/'
}
