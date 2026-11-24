import { installButtonHover } from '~/utils/buttonHover'

export default defineNuxtPlugin((nuxtApp) => {
  let cleanup: (() => void) | undefined
  nuxtApp.hook('app:mounted', () => {
    cleanup = installButtonHover(document, window)
  })
  nuxtApp.vueApp.onUnmount(() => cleanup?.())
  if (import.meta.hot) import.meta.hot.dispose(() => cleanup?.())
})
