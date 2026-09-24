import type { Ref } from 'vue'

export type ViewportFocusOptions = {
  /** Blur amount while out of view (px). Default 14 */
  blur?: number
  /** Delay before sharpening after enter (s). Default 0.12 */
  delay?: number
  /** Sharpen duration (s). Default 0.7 */
  duration?: number
  /** Soften duration when leaving (s). Default 0.45 */
  leaveDuration?: number
  /** ScrollTrigger start. Default 'top 88%' */
  start?: string
  /** ScrollTrigger end. Default 'bottom 12%' */
  end?: string
  /** Stagger between targets when several share one call (s). Default 0.08 */
  stagger?: number
  /** Always start blurred, then sharpen in view (soft entrance). Default false */
  fromBlur?: boolean
  /** Sharpen once; do not re-blur on leave. Default false */
  once?: boolean
}

/**
 * Depth-of-field reveal: off-screen content stays blurred;
 * when it enters the viewport it sharpens after a short delay.
 * Re-blurs on leave so only the active band stays crisp.
 */
export function useViewportFocus(
  getTargets: () => Array<HTMLElement | null | undefined>,
  options: ViewportFocusOptions = {},
) {
  const {
    blur = 14,
    delay = 0.12,
    duration = 0.7,
    leaveDuration = 0.45,
    start = 'top 88%',
    end = 'bottom 12%',
    stagger = 0.08,
    fromBlur = false,
    once = false,
  } = options

  let ctx: { revert: () => void } | null = null

  onMounted(async () => {
    const targets = getTargets().filter((el): el is HTMLElement => !!el)
    if (!targets.length) return

    const gsap = (await import('gsap')).default
    const { ScrollTrigger } = await import('gsap/ScrollTrigger')
    gsap.registerPlugin(ScrollTrigger)

    // Mobile: filter:blur is a GPU tax — fade only while we A/B perf.
    const { isNarrowViewport } = await import('~/utils/mobileViewport')
    const useBlur = blur > 0 && !isNarrowViewport()
    const blurOn = useBlur ? `blur(${blur}px)` : 'blur(0px)'
    const blurOff = 'blur(0px)'

    ctx = gsap.context(() => {
      targets.forEach((el, i) => {
        const enterDelay = delay + i * stagger
        const rect = el.getBoundingClientRect()
        const inView =
          rect.top < window.innerHeight * 0.88 && rect.bottom > window.innerHeight * 0.12

        const startBlurred = fromBlur || !inView
        gsap.set(el, {
          filter: startBlurred ? blurOn : blurOff,
          opacity: startBlurred ? 0.72 : 1,
          force3D: true,
        })

        const sharpen = () => {
          gsap.to(el, {
            filter: blurOff,
            opacity: 1,
            duration,
            delay: enterDelay,
            ease: 'power2.out',
            overwrite: 'auto',
          })
        }

        const soften = () => {
          if (once) return
          gsap.to(el, {
            filter: blurOn,
            opacity: 0.72,
            duration: leaveDuration,
            delay: 0,
            ease: 'power1.in',
            overwrite: 'auto',
          })
        }

        ScrollTrigger.create({
          trigger: el,
          start,
          end,
          onEnter: sharpen,
          onEnterBack: once ? undefined : sharpen,
          onLeave: soften,
          onLeaveBack: soften,
        })

        if (inView) sharpen()
      })
    })
  })

  onUnmounted(() => {
    ctx?.revert()
  })
}

/** Convenience: bind focus reveal to a list of template refs. */
export function useViewportFocusRefs(
  refs: Array<Ref<HTMLElement | null>>,
  options?: ViewportFocusOptions,
) {
  useViewportFocus(() => refs.map((r) => r.value), options)
}
