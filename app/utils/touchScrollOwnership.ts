type TouchScrollEvent = {
  type: string
  cancelable: boolean
  touches: { length: number }
  preventDefault: () => void
}

/** Keep one scroll owner until every finger is released. */
export function createTouchScrollOwnership() {
  let nativeGesture = false

  return (event: TouchScrollEvent, bypass = false) => {
    if (event.type === 'touchstart') {
      // A second finger must not restart an existing gesture as Lenis-owned.
      if (event.touches.length === 1) nativeGesture = bypass
      if (event.touches.length > 1) nativeGesture = true
    }

    if (event.type === 'touchmove') {
      if (bypass || event.touches.length !== 1 || !event.cancelable) {
        nativeGesture = true
      }
      // Lenis skips zero/ horizontal-only deltas before cancelling the event.
      // Cancel those early moves too, so the browser cannot claim the gesture.
      if (!nativeGesture) event.preventDefault()
    }

    const owned = !nativeGesture
    if (
      (event.type === 'touchend' || event.type === 'touchcancel')
      && event.touches.length === 0
    ) nativeGesture = false
    return owned
  }
}
