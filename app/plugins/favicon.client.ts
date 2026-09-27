export default defineNuxtPlugin(() => {
  // The favicon link in nuxt.config.ts is already rendered during SSR.
  // Re-registering the same icons through useHead after hydration made Chrome
  // fetch the favicon up to six times during a cold Lighthouse navigation.
})
