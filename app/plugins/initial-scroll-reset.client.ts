import { shouldResetInitialScroll } from '~/utils/initialScrollReset'

/**
 * Mobile browsers may restore a reload's scroll position after parsing the
 * document. Reset before Vue mounts, then cover the browser's final pageshow
 * restoration so FlowSurface always boots from the Hero coordinate system.
 */
export default defineNuxtPlugin((nuxtApp) => {
  if (!shouldResetInitialScroll(window.location.pathname, performance)) return

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

  let userMoved = false
  let settleRaf = 0

  const resetTop = () => {
    if (!userMoved) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }
  const markUserMoved = () => {
    userMoved = true
  }
  const removeInputGuards = () => {
    window.removeEventListener('touchstart', markUserMoved)
    window.removeEventListener('wheel', markUserMoved)
    window.removeEventListener('pointerdown', markUserMoved)
    window.removeEventListener('keydown', markUserMoved)
  }
  const finishReset = () => {
    resetTop()
    settleRaf = requestAnimationFrame(() => {
      resetTop()
      settleRaf = requestAnimationFrame(() => {
        settleRaf = 0
        resetTop()
        removeInputGuards()
      })
    })
  }

  resetTop()
  window.addEventListener('touchstart', markUserMoved, { passive: true })
  window.addEventListener('wheel', markUserMoved, { passive: true })
  window.addEventListener('pointerdown', markUserMoved, { passive: true })
  window.addEventListener('keydown', markUserMoved)
  window.addEventListener('pageshow', finishReset, { once: true })

  // Reassert immediately after the Vue tree is committed. FlowSurface mounts
  // on the following frame, so its first measurements can only see Hero/top.
  nuxtApp.hook('app:mounted', resetTop)

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (settleRaf) cancelAnimationFrame(settleRaf)
      window.removeEventListener('pageshow', finishReset)
      removeInputGuards()
    })
  }
})
