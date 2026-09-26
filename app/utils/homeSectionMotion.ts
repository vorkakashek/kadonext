/** Named landing poses are coalesced destinations in the shared Surface route. */
export const HOME_SECTION_DESTINATIONS = {
  home: { desktopProgress: 0, mobileSpace: 'document' },
  services: { desktopProgress: 3, mobileSpace: 'viewport' },
  'project-formats': { desktopProgress: 4, mobileSpace: 'document' },
  about: { desktopProgress: 7, mobileSpace: 'document' },
  contact: { desktopProgress: 8, mobileSpace: 'document' },
} as const

export type HomeMotionSection = keyof typeof HOME_SECTION_DESTINATIONS

export const HOME_SECTION_TIMING = {
  desktopStartDelayMs: 350,
  mobileApproachViewport: 0.2,
  minimumApproachPx: 96,
  morphDurationMs: 720,
} as const

export function isHomeMotionSection(id: string): id is HomeMotionSection {
  return Object.hasOwn(HOME_SECTION_DESTINATIONS, id)
}

export type HomeSectionMotion = {
  approach: (scrollTop: number) => void
  settle: (scrollTop?: number) => void
  cancel: () => void
}

type SectionMotionOwner = (targetId: string, scrollTop: number) => HomeSectionMotion | null
let owner: SectionMotionOwner | null = null

/**
 * One navigation transaction: hold → approach the coalesced pose → dock at arrival.
 * The scroll driver starts the approach independently of scroll completion. The
 * host retains geometry ownership through the scroll tail and cancels into the
 * live corridor only on interruption. Route selection and snapshot interpolation
 * are shared with the scroll contract; this module only coordinates document travel.
 */
export function registerHomeSectionMotion(next: SectionMotionOwner) {
  owner = next
  return () => { if (owner === next) owner = null }
}

export function beginHomeSectionMotion(targetId: string, scrollTop: number) {
  return owner?.(targetId, scrollTop) ?? null
}
