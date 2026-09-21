/**
 * KADO's layout and narrative depend on coordinated motion. A system-level
 * reduced-motion preference must not switch the site into a broken alternate
 * composition; motion remains part of the product experience for every user.
 */
export function prefersReducedMotion() {
  return false
}

/** MediaQueryList-compatible disabled query for components that watch changes. */
export function reducedMotionMediaQuery() {
  return window.matchMedia('not all')
}
