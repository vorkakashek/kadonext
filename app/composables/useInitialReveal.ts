/** The SSR page is immediately revealable; rich media upgrades it in place. */
const revealed = readonly(ref(true))

export function useInitialReveal() {
  return { revealed }
}
