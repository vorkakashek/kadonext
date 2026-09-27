import { baseRoutePath } from '~/utils/localeRouting'
import type { HomeSectionId } from '~/utils/homeSections'

export function useHomeSectionNavigation() {
  const nuxtApp = useNuxtApp()
  const route = useRoute()
  const router = useRouter()
  const localePath = useLocalePath()
  const activeSection = useState<HomeSectionId>('home-active-section', () => 'home')
  const pendingSection = useState<HomeSectionId | null>('home-pending-section', () => null)

  async function targetElement(id: HomeSectionId) {
    await nextTick()
    for (let frame = 0; frame < 24; frame += 1) {
      const target = id === 'home'
        ? document.documentElement
        : document.getElementById(id)
      if (target) return target
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
    return null
  }

  async function waitForScrollUnlock() {
    for (let frame = 0; frame < 180; frame += 1) {
      const locked = document.documentElement.classList.contains('page-canvas-lock')
        || document.documentElement.classList.contains('page-iris-lock')
        || document.documentElement.classList.contains('home-intro-lock')
      if (!locked) return
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
  }

  async function waitForHomeRouteCommit() {
    for (let frame = 0; frame < 120; frame += 1) {
      if (baseRoutePath(route.path) === '/') {
        // Nuxt publishes its deferred route only after the Home subtree has
        // committed. Give layout and Lenis one more pair of frames to measure
        // the new document instead of retaining the shorter previous route.
        await nextTick()
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        return true
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
    return false
  }

  async function scrollToSection(id: HomeSectionId, immediate = false) {
    const target = await targetElement(id)
    if (!target) return false
    activeSection.value = id
    nuxtApp.$scrollToSection(target, immediate)
    return true
  }

  async function navigateToSection(id: HomeSectionId, immediate = false) {
    pendingSection.value = id
    try {
      const enteringHome = baseRoutePath(route.path) !== '/'
      if (enteringHome) {
        await router.push(localePath('/'))
        // Nuxt's `useRoute()` proxy intentionally updates after the new page
        // has painted. Vue Router's source of truth is already current when
        // push() resolves, so use it for this transaction check; reading the
        // deferred proxy here used to abort every cross-page section command.
        if (baseRoutePath(router.currentRoute.value.path) !== '/') return false
      }
      // Vue Router resolves a navigation before its asynchronous scroll
      // behavior necessarily commits. The route plugin suppresses that native
      // top reset while this command is pending. For a cross-page command,
      // position Home immediately while PageIris still owns the opaque cover;
      // waiting for its lock to clear exposes both the jump and the Surface's
      // first activation sync before the destination is ready to be seen.
      let landed = await scrollToSection(id, immediate || enteringHome)
      if (enteringHome) {
        // The first write happens under the route cover. Reassert after Nuxt's
        // deferred route/page commit so Lenis measures Home rather than clamps
        // the destination to the previous page's scroll range.
        if (await waitForHomeRouteCommit()) {
          landed = await scrollToSection(id, true) || landed
        }
        // Keep pendingSection claimed until Vue Router's deferred scroll
        // behavior has finished. Clearing it on the landing frame lets that
        // late behavior overwrite the destination with its default top reset.
        await waitForScrollUnlock()
      }
      return landed
    } finally {
      if (pendingSection.value === id) pendingSection.value = null
    }
  }

  function selectSection(id: HomeSectionId) {
    activeSection.value = id
  }

  return {
    activeSection,
    pendingSection,
    navigateToSection,
    scrollToSection,
    selectSection,
  }
}
