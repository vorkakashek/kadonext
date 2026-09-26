import { localizeHomeCases } from '~/utils/homeCases'
import { localizeProjectCaseDetails } from '~/utils/projectCaseDetails'
import { projectDetailLocaleLoaders } from '~/generated/locales/manifest'

export function useHomeCases() {
  const { locale, tm } = useI18n()
  const config = useRuntimeConfig()
  const assetCdnUrl = String(config.public.assetCdnUrl || config.app.cdnURL || '')
  return computed(() => {
    locale.value
    return localizeHomeCases(tm('projects.items'), assetCdnUrl)
  })
}

export async function useProjectCaseDetails() {
  const { locale } = useI18n()
  const config = useRuntimeConfig()
  const assetCdnUrl = String(config.public.assetCdnUrl || config.app.cdnURL || '')
  const copy = shallowRef(await projectDetailLocaleLoaders[locale.value]())

  watch(locale, async (nextLocale) => {
    copy.value = await projectDetailLocaleLoaders[nextLocale]()
  })

  return computed(() => localizeProjectCaseDetails(copy.value, assetCdnUrl))
}
