/** Mobile copy pacing is visual motion, never touch-input damping. */
/** Downward viewport drift starts with the first scroll from the page top. */
export const MOBILE_HERO_COPY_DESCENT_RATE = 0.25
export const MOBILE_HERO_COPY_TRAVEL_VH = 1.2
/** Movement and fade begin together; the copy clears over half a screen of scroll. */
export const MOBILE_HERO_COPY_FADE_TRAVEL_VH = 0.5
export const MOBILE_HERO_COPY_EXIT_SCALE = 0.8
const COPY_COVER_BLEED_PX = 2

export type MobileHeroCopyLayout = {
  sectionTop: number
  titleTop: number
  titleHeight: number
  surfaceTop: number
  viewportHeight: number
}

/** Layout offsets exclude both the copy transform and its children's intro transforms. */
function layoutTopWithin(element: HTMLElement, ancestor: HTMLElement) {
  let top = 0
  let current: HTMLElement | null = element
  while (current && current !== ancestor) {
    top += current.offsetTop
    current = current.offsetParent as HTMLElement | null
  }
  return current === ancestor ? top : null
}

/** Capture on layout/width changes only, never during a scroll paint. */
export function readMobileHeroCopyLayout(
  section: HTMLElement,
  surface: HTMLElement,
  viewportHeight: number,
): MobileHeroCopyLayout | null {
  const title = section.querySelector<HTMLElement>('[data-hero-title-block]')
  if (!title) return null
  const titleInset = layoutTopWithin(title, section)
  const surfaceInset = layoutTopWithin(surface, section)
  if (titleInset === null || surfaceInset === null) return null
  const sectionTop = section.getBoundingClientRect().top + window.scrollY
  return {
    sectionTop,
    titleTop: sectionTop + titleInset,
    titleHeight: title.offsetHeight,
    surfaceTop: sectionTop + surfaceInset,
    viewportHeight: Math.max(1, viewportHeight),
  }
}

/**
 * Preserve the existing Surface runway independently of the copy transform.
 * The copy is no longer held in place for a physical wipe over its title.
 */
export function mobileHeroSurfaceMorphStartScrollY(layout: MobileHeroCopyLayout) {
  const gap = Math.max(0, layout.surfaceTop - layout.titleTop + COPY_COVER_BLEED_PX)
  return layout.sectionTop + gap
}

/** All copy exit effects share the absolute page-top start. */
export function mobileHeroCopyMotionStartY(_layout: MobileHeroCopyLayout) {
  return 0
}

export function mobileHeroCopyTranslation(scrollY: number, layout: MobileHeroCopyLayout) {
  const scrolled = Math.max(0, scrollY - mobileHeroCopyMotionStartY(layout))
  const travel = layout.viewportHeight * MOBILE_HERO_COPY_TRAVEL_VH
  return Math.min(scrolled, travel) * (1 + MOBILE_HERO_COPY_DESCENT_RATE)
}

function mobileHeroCopyExitProgress(scrollY: number, layout: MobileHeroCopyLayout) {
  const progress = Math.min(1, Math.max(
    0,
    (scrollY - mobileHeroCopyMotionStartY(layout))
      / (layout.viewportHeight * MOBILE_HERO_COPY_FADE_TRAVEL_VH),
  ))
  return progress * progress * (3 - 2 * progress)
}

export function mobileHeroCopyOpacity(scrollY: number, layout: MobileHeroCopyLayout) {
  return 1 - mobileHeroCopyExitProgress(scrollY, layout)
}

export function mobileHeroCopyScale(scrollY: number, layout: MobileHeroCopyLayout) {
  return 1 - (1 - MOBILE_HERO_COPY_EXIT_SCALE) * mobileHeroCopyExitProgress(scrollY, layout)
}
