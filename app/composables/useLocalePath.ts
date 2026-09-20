import { localizedPath } from '~/utils/localeRouting'

export function useLocalePath() {
  const { locale } = useI18n()
  return (path: string) => localizedPath(path, locale.value)
}
