import { baseRoutePath } from '~/utils/localeRouting'
import { isHomeSectionId, type HomeSectionId } from '~/utils/homeSections'

/**
 * Section destinations are UI commands, not route state. Strip old internal
 * fragments so browser history and native anchor restoration can no longer
 * compete with the Lenis-owned scroll position.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  const router = useRouter()
  const defaultScrollBehavior = router.options.scrollBehavior
  const pendingSection = useState<HomeSectionId | null>('home-pending-section', () => null)

  function withoutHomeSectionHash(path: string, hash: string) {
    if (baseRoutePath(path) !== '/' || !isHomeSectionId(hash.slice(1))) return null
    return path
  }

  const removeGuard = router.beforeEach((to) => {
    if (!withoutHomeSectionHash(to.path, to.hash)) return
    return {
      path: to.path,
      query: to.query,
      replace: true,
    }
  })

  const cleanInitialPath = withoutHomeSectionHash(window.location.pathname, window.location.hash)
  if (cleanInitialPath) {
    history.replaceState(history.state, '', `${cleanInitialPath}${window.location.search}`)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    await router.replace({ path: router.currentRoute.value.path, query: router.currentRoute.value.query })
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }

  nuxtApp.hook('app:mounted', () => {
    const scrollBehavior: NonNullable<typeof defaultScrollBehavior> = async (to, from, savedPosition) => {
      const samePage = baseRoutePath(to.path) === baseRoutePath(from.path)
      if (
        samePage
        && document.documentElement.classList.contains('language-switch-lock')
      ) return false
      if (baseRoutePath(to.path) === '/' && !samePage) {
        // Named landings (including the physical case-detail return) own their
        // exact destination. Every ordinary Home entry starts at Hero instead
        // of reviving Vue Router's saved position from the kept-alive page.
        if (pendingSection.value) return false
        // Resolve immediately while PageIris is still opaque. Nuxt's default
        // behavior waits for page:loading:end and can expose the old Home
        // position before its eventual top reset.
        return { left: 0, top: 0, behavior: 'instant' }
      }
      return await defaultScrollBehavior?.(to, from, savedPosition) ?? false
    }
    router.options.scrollBehavior = scrollBehavior

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        removeGuard()
        if (router.options.scrollBehavior === scrollBehavior) {
          router.options.scrollBehavior = defaultScrollBehavior
        }
      })
    }
  })
})
