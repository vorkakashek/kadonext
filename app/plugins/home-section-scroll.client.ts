import { isThumbNav } from '~/utils/mobileViewport'
import { homeSectionScrollTop } from '~/utils/homeSectionScroll'
import { isHomeAnchorTarget } from '~/utils/homeAnchorMotion'
import { baseRoutePath } from '~/utils/localeRouting'

/** Keep Nuxt's page/history scrolling; ease home anchors and returns to the top. */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const router = useRouter()
    const defaultScrollBehavior = router.options.scrollBehavior

    const scrollBehavior: NonNullable<typeof defaultScrollBehavior> = async (to, from, savedPosition) => {
      const homeToHome = baseRoutePath(to.path) === '/' && baseRoutePath(from.path) === '/'
      const sectionLink = homeToHome
        && isHomeAnchorTarget(to.hash.slice(1))
      const homeTopLink = homeToHome && !to.hash && !!from.hash
      const locked = ['preload-lock', 'page-canvas-lock', 'page-iris-lock'].some(
        name => document.documentElement.classList.contains(name),
      )
      if ((!sectionLink && !homeTopLink) || savedPosition || locked) {
        const position = await defaultScrollBehavior?.(to, from, savedPosition) ?? false
        if (position && !savedPosition && baseRoutePath(to.path) === '/'
          && to.hash === '#contact' && !isThumbNav()) {
          const target = document.getElementById('contact')
          if (target) return { top: homeSectionScrollTop(target), left: 0, behavior: position.behavior }
        }
        return position
      }

      await nextTick()
      if (router.currentRoute.value.fullPath !== to.fullPath) return false
      const target = homeTopLink ? document.documentElement : document.getElementById(to.hash.slice(1))
      if (!target) return defaultScrollBehavior?.(to, from, savedPosition) ?? false
      nuxtApp.$scrollToSection(target)
      return false
    }

    router.options.scrollBehavior = scrollBehavior
    let stopInitialAnchor: () => void = () => {}
    let initialAnchorCancelled = false
    const cancelInitialAnchor = () => {
      initialAnchorCancelled = true
      window.removeEventListener('pointerdown', cancelInitialAnchor, true)
      window.removeEventListener('wheel', cancelInitialAnchor, true)
      window.removeEventListener('keydown', cancelInitialAnchor, true)
    }
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (baseRoutePath(window.location.pathname) === '/' && window.location.hash === '#contact'
      && !isThumbNav() && navigation?.type !== 'back_forward') {
      const preload = useBrandPreload()
      window.addEventListener('pointerdown', cancelInitialAnchor, { capture: true, passive: true })
      window.addEventListener('wheel', cancelInitialAnchor, { capture: true, passive: true })
      window.addEventListener('keydown', cancelInitialAnchor, { capture: true })
      stopInitialAnchor = watch(preload.revealed, (ready) => {
        if (!ready) return
        // Position under the preloader, before its reveal can paint the page.
        if (!initialAnchorCancelled && baseRoutePath(router.currentRoute.value.path) === '/'
          && router.currentRoute.value.hash === '#contact') {
          const target = document.getElementById('contact')
          if (target) nuxtApp.$scrollToSection(target, true)
        }
        cancelInitialAnchor()
        stopInitialAnchor()
      }, { immediate: true, flush: 'sync' })
    }
    import.meta.hot?.dispose(() => {
      stopInitialAnchor()
      cancelInitialAnchor()
      if (router.options.scrollBehavior === scrollBehavior) {
        router.options.scrollBehavior = defaultScrollBehavior
      }
    })
  })
})
