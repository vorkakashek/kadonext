/** Named landing poses are coalesced destinations in the shared Surface route. */
export const HOME_ANCHOR_DESTINATIONS = {
  home: { desktopProgress: 0, mobileSpace: 'document' },
  services: { desktopProgress: 3, mobileSpace: 'viewport' },
  about: { desktopProgress: 4, mobileSpace: 'document' },
  contact: { desktopProgress: 5, mobileSpace: 'document' },
} as const

export type HomeAnchorTarget = keyof typeof HOME_ANCHOR_DESTINATIONS

export const HOME_ANCHOR_TIMING = {
  desktopStartDelayMs: 350,
  mobileApproachViewport: 0.2,
  minimumApproachPx: 96,
  morphDurationMs: 720,
} as const

export function isHomeAnchorTarget(id: string): id is HomeAnchorTarget {
  return Object.hasOwn(HOME_ANCHOR_DESTINATIONS, id)
}

export type HomeAnchorMotion = {
  approach: (scrollTop: number) => void
  settle: (scrollTop?: number) => void
  cancel: () => void
}

type AnchorMotionOwner = (targetId: string, scrollTop: number) => HomeAnchorMotion | null
let owner: AnchorMotionOwner | null = null

/**
 * One navigation transaction: hold → approach the coalesced pose → dock at arrival.
 * The driver starts the approach independently of scroll completion. The host
 * retains geometry ownership through the scroll tail and cancels into the live
 * corridor only on interruption. Route selection and snapshot interpolation are
 * shared with the scroll contract; this module only coordinates document travel.
 */
export function registerHomeAnchorMotion(next: AnchorMotionOwner) {
  owner = next
  return () => { if (owner === next) owner = null }
}

export function beginHomeAnchorMotion(targetId: string, scrollTop: number) {
  return owner?.(targetId, scrollTop) ?? null
}
