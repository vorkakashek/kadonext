import { localeFromPath, localizedPath } from '~/utils/localeRouting'

export default defineNuxtRouteMiddleware(async (to) => {
  const { locale, setLocale } = useI18n()
  const pathLocale = localeFromPath(to.path)

  if (pathLocale) {
    await setLocale(pathLocale)
    return
  }

  // Static HTML cannot inspect Accept-Language. The early head script normally
  // redirects before Nuxt boots; this covers client-side and script-delayed visits.
  if (import.meta.server) return
  const saved = useCookie<'ru' | 'en' | null>('kadonext-locale').value
  let stored: string | null = null
  try {
    stored = localStorage.getItem('kadonext-locale')
  } catch {
    /* Browser storage can be unavailable in hardened privacy modes. */
  }
  const preference = saved === 'ru' || saved === 'en'
    ? saved
    : stored === 'ru' || stored === 'en' ? stored : null
  const detected = preference
    ? preference
    : (navigator.languages[0] ?? navigator.language).toLowerCase().startsWith('ru') ? 'ru' : 'en'
  await setLocale(detected)
  return navigateTo(localizedPath(to.fullPath, detected), { replace: true })
})
