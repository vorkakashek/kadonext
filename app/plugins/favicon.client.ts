export default defineNuxtPlugin((nuxtApp) => {
  const theme = window.matchMedia('(prefers-color-scheme: dark)')
  const dark = ref(theme.matches)
  const update = () => { dark.value = theme.matches }

  // HTML media links select the initial icon before Nuxt starts. Once mounted,
  // use explicit URLs for browsers that don't reliably update favicon media queries.
  useHead(() => ({
    link: [
      {
        key: 'favicon-ico', rel: 'icon',
        href: dark.value ? '/favicon-dark.ico' : '/favicon.ico',
        sizes: '16x16 32x32 48x48 96x96', media: 'all',
      },
      {
        key: 'favicon-png', rel: 'icon',
        href: dark.value ? '/favicon-dark-96.png' : '/favicon-96.png',
        type: 'image/png', sizes: '96x96', media: 'all',
      },
      // Retire the initial dark links so they can't compete with the live pair.
      // Keep their href in sync as a fallback for browsers that ignore media.
      {
        key: 'favicon-dark-ico', rel: 'icon',
        href: dark.value ? '/favicon-dark.ico' : '/favicon.ico',
        sizes: '16x16 32x32 48x48 96x96', media: 'not all',
      },
      {
        key: 'favicon-dark-png', rel: 'icon',
        href: dark.value ? '/favicon-dark-96.png' : '/favicon-96.png',
        type: 'image/png', sizes: '96x96', media: 'not all',
      },
    ],
  }))

  theme.addEventListener('change', update)
  const cleanup = () => theme.removeEventListener('change', update)
  nuxtApp.vueApp.onUnmount(cleanup)
  if (import.meta.hot) import.meta.hot.dispose(cleanup)
})
