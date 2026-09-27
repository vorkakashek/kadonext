import { baseRoutePath } from './localeRouting.ts'

interface NavigationEntryLike {
  type?: string
}

interface NavigationPerformanceLike {
  getEntriesByType?: (type: string) => ArrayLike<unknown>
  navigation?: { type?: number }
}

/**
 * Reload is the only cold entry that must discard a previous home position.
 * New visits already start at zero; history traversal keeps its own contract.
 */
export function isReloadNavigation(source: NavigationPerformanceLike) {
  const entry = source.getEntriesByType?.('navigation')?.[0] as NavigationEntryLike | undefined
  if (entry?.type) return entry.type === 'reload'

  // Safari versions without Navigation Timing L2 expose the legacy numeric API.
  return source.navigation?.type === 1
}

export function shouldResetInitialScroll(
  pathname: string,
  source: NavigationPerformanceLike,
) {
  return baseRoutePath(pathname) === '/' && isReloadNavigation(source)
}
