import { servicePageLocaleLoaders, type LocaleCode } from '~/generated/locales/manifest'
import type { ServicePageId, ServicePageMessages } from '~/utils/servicePages'
import { getCurrentScope } from 'vue'

// Public, immutable copy is shared between service routes; it never enters
// Nuxt payload state or the cold-home locale bundle.
const loaded = new Map<LocaleCode, Promise<ServicePageMessages>>()

function loadCopy(locale: LocaleCode) {
  if (!loaded.has(locale)) {
    const pending = servicePageLocaleLoaders[locale]() as Promise<ServicePageMessages>
    loaded.set(locale, pending.catch((error) => {
      loaded.delete(locale)
      throw error
    }))
  }
  return loaded.get(locale)!
}

export async function useServicePage(id: ServicePageId) {
  const { locale } = useI18n()
  const scope = getCurrentScope()
  const messages = shallowRef(await loadCopy(locale.value))
  let revision = 0
  scope?.run(() => {
    watch(locale, async (nextLocale) => {
      const request = ++revision
      const next = await loadCopy(nextLocale)
      if (request === revision) messages.value = next
    })
    onScopeDispose(() => { revision += 1 })
  })
  return computed(() => ({
    page: messages.value.pages[id],
    shared: messages.value.shared,
    pages: messages.value.pages,
  }))
}
