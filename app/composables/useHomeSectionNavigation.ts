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
        if (baseRoutePath(route.path) !== '/') return false
        await waitForScrollUnlock()
      }
      // Vue Router resolves a navigation before its asynchronous scroll
      // behavior necessarily commits. The route plugin suppresses that native
      // top reset while this command is pending; land once on the final section
      // underneath the iris instead of starting a second visible page journey.
      return await scrollToSection(id, immediate || enteringHome)
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
