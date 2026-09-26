export default defineNuxtPlugin(() => {
  // The four SSR links in nuxt.config.ts already use light/dark media queries.
  // Re-registering the same icons through useHead after hydration made Chrome
  // fetch the favicon up to six times during a cold Lighthouse navigation.
})
