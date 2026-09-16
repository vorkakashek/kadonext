export const CASE_RAIL_TOUCH_EVENT = 'case-rail-touch'

export type CaseRailTouchFrame = {
  type: string
  deltaX: number
  timeStamp: number
}

/** The first nonzero move selects one axis until the finger is released. */
export function createCaseRailTouchAxis() {
  let axis: 'horizontal' | 'vertical' | null = null

  return (type: string, deltaX: number, deltaY: number) => {
    if (type === 'touchstart' || type === 'touchcancel') {
      axis = null
      return { deltaX: 0, deltaY: 0 }
    }
    if (type === 'touchmove' && axis === null && (deltaX !== 0 || deltaY !== 0)) {
      axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
    }
    const delta = {
      deltaX: axis === 'horizontal' ? deltaX : 0,
      deltaY: axis === 'vertical' ? deltaY : 0,
    }
    // Filter the release delta before resetting so inertia uses the chosen axis.
    if (type === 'touchend') axis = null
    return delta
  }
}
