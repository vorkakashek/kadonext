/** Keep Nuxt's page/history scrolling; ease only the two home-section links. */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const router = useRouter()
    const defaultScrollBehavior = router.options.scrollBehavior

    const scrollBehavior: NonNullable<typeof defaultScrollBehavior> = async (to, from, savedPosition) => {
      const sectionLink = to.path === '/' && from.path === '/'
        && (to.hash === '#services' || to.hash === '#contact')
      const locked = ['preload-lock', 'page-canvas-lock', 'page-iris-lock'].some(
        name => document.documentElement.classList.contains(name),
      )
      if (!sectionLink || savedPosition || locked) {
        return defaultScrollBehavior?.(to, from, savedPosition) ?? false
      }

      await nextTick()
      if (router.currentRoute.value.fullPath !== to.fullPath) return false
      const target = document.getElementById(to.hash.slice(1))
      if (!target) return defaultScrollBehavior?.(to, from, savedPosition) ?? false
      nuxtApp.$scrollToSection(target)
      return false
    }

    router.options.scrollBehavior = scrollBehavior
    import.meta.hot?.dispose(() => {
      if (router.options.scrollBehavior === scrollBehavior) {
        router.options.scrollBehavior = defaultScrollBehavior
      }
    })
  })
})
