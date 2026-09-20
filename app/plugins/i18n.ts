import {
  defaultLocale,
  defaultMessages,
  localeLoaders,
  type LocaleCode,
} from '~/generated/locales/manifest'
import { localeFromPath } from '~/utils/localeRouting'

type LocaleMessages = Record<string, unknown>
type MessageParams = Record<string, string | number>

function resolveMessage(messages: LocaleMessages, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => (
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)[part]
      : undefined
  ), messages)
}

function interpolate(message: string, params?: MessageParams): string {
  if (!params) return message
  return message.replace(/\{([\w-]+)\}/g, (match, key: string) => (
    key in params ? String(params[key]) : match
  ))
}

export default defineNuxtPlugin(async () => {
  const localeCookie = useCookie<LocaleCode | null>('kadonext-locale', {
    default: () => null,
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
  })
  const pathLocale = localeFromPath(useRequestURL().pathname)
  const initialLocale = pathLocale
    ?? (localeCookie.value && localeCookie.value in localeLoaders ? localeCookie.value : defaultLocale)
  const initialMessages = initialLocale === defaultLocale
    ? defaultMessages as LocaleMessages
    : await localeLoaders[initialLocale]() as LocaleMessages
  const locale = useState<LocaleCode>('site-locale', () => initialLocale)
  const messages = shallowRef<LocaleMessages>(initialMessages)
  const loaded = new Map<LocaleCode, LocaleMessages>([
    [defaultLocale, defaultMessages as LocaleMessages],
    [initialLocale, initialMessages],
  ])

  function rememberLocale(nextLocale: LocaleCode) {
    localeCookie.value = nextLocale
    if (import.meta.client) {
      try {
        localStorage.setItem('kadonext-locale', nextLocale)
      } catch {
        /* Cookie remains the primary preference store. */
      }
    }
  }

  if (pathLocale) rememberLocale(initialLocale)

  function tm(key: string): unknown {
    return resolveMessage(messages.value, key)
  }

  function t(key: string, params?: MessageParams): string {
    const message = tm(key)
    return typeof message === 'string' ? interpolate(message, params) : key
  }

  async function setLocale(nextLocale: LocaleCode) {
    if (nextLocale === locale.value && messages.value === loaded.get(nextLocale)) {
      rememberLocale(nextLocale)
      return
    }
    let nextMessages = loaded.get(nextLocale)
    if (!nextMessages) {
      nextMessages = await localeLoaders[nextLocale]() as LocaleMessages
      loaded.set(nextLocale, nextMessages)
    }
    messages.value = nextMessages
    locale.value = nextLocale
    rememberLocale(nextLocale)
  }

  return {
    provide: {
      localeApi: { locale, setLocale, t, tm },
    },
  }
})
