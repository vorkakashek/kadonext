// Share the wheel response between Lenis and the footer's resisted photo pull.
// Initial speed matches lerp: 0.1 (6 / second), with a finite settling time.
export const WHEEL_DURATION = 0.5
export const wheelEasing = (t: number) => 1 - (1 - t) ** 3
