/** A cancelled form swipe can still produce a click that focuses the field. */
export function createFormSwipeGuard<T>() {
  let control: T | null = null
  let startX = 0
  let startY = 0
  let swiped = false
  let expiresAt = 0

  return {
    reset() {
      control = null
      swiped = false
      expiresAt = 0
    },
    start(target: T | null, x: number, y: number) {
      control = target
      startX = x
      startY = y
      swiped = false
      expiresAt = 0
    },
    move(x: number, y: number) {
      if (control && Math.hypot(x - startX, y - startY) > 8) swiped = true
    },
    end(time: number) {
      if (control && swiped) expiresAt = time + 700
      else control = null
    },
    suppressClick(target: T | null, time: number) {
      const suppress = target !== null && target === control && swiped && time <= expiresAt
      control = null
      return suppress
    },
  }
}
