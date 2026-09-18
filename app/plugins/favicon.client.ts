export default defineNuxtPlugin((nuxtApp) => {
  const theme = window.matchMedia('(prefers-color-scheme: dark)')
  const dark = ref(theme.matches)
  const update = () => { dark.value = theme.matches }

  // Explicit URLs also work in browsers that ignore media queries inside SVG favicons.
  useHead(() => ({
    link: [
      {
        key: 'favicon-ico', rel: 'icon',
        href: dark.value ? '/favicon-dark.ico' : '/favicon.ico',
        sizes: '16x16 32x32 48x48 96x96',
      },
      {
        key: 'favicon-png', rel: 'icon',
        href: dark.value ? '/favicon-dark-96.png' : '/favicon-96.png',
        type: 'image/png', sizes: '96x96',
      },
    ],
  }))

  theme.addEventListener('change', update)
  const cleanup = () => theme.removeEventListener('change', update)
  nuxtApp.vueApp.onUnmount(cleanup)
  if (import.meta.hot) import.meta.hot.dispose(cleanup)
})
