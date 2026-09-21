/**
 * Wavy underline hover — kept for in-text / contextual links (`TextLinkWave`).
 * Header nav chips use the menu pill fill instead.
 */

export const NAV_DRAW_S = 0.44
export const NAV_FLAT_S = 0.224
export const NAV_LEAVE_AMP_S = 0.144
export const NAV_LEAVE_WIPE_S = 0.24
export const NAV_LEAVE_WIPE_DELAY = 0.048
export const NAV_WAVE_AMP = 3.4
export const NAV_WAVE_VB_W = 64

let gsapMod: typeof import('gsap').default | null = null
const navWaveTls = new WeakMap<Element, { kill: () => void }>()
const navWaveAmp = new WeakMap<Element, number>()

async function gsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  return gsapMod
}

export function wavePathD(amp: number) {
  const a = Math.max(0, amp)
  return `M1 4 Q 12 ${4 - a} 23 4 Q 34 ${4 + a} 45 4 Q 54 ${4 - a * 0.65} 63 4`
}

function applyWaveAmp(root: Element, path: SVGPathElement, amp: number) {
  navWaveAmp.set(root, amp)
  path.setAttribute('d', wavePathD(amp))
}

export function navWaveParts(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return null
  const path = el.querySelector('.text-link-wave__path') as SVGPathElement | null
  const reveal = el.querySelector('.text-link-wave__reveal') as SVGRectElement | null
  if (!path || !reveal) return null
  return { path, reveal, root: el }
}

type NavWaveEvent = Pick<Event, 'currentTarget'>

export async function onNavWaveEnter(e: NavWaveEvent) {
  const parts = navWaveParts(e.currentTarget)
  if (!parts) return
  const { path, reveal, root } = parts
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyWaveAmp(root, path, 0)
    reveal.setAttribute('x', '0')
    reveal.setAttribute('width', String(NAV_WAVE_VB_W))
    return
  }
  const g = await gsap()
  navWaveTls.get(root)?.kill()

  const morph = { amp: NAV_WAVE_AMP }
  applyWaveAmp(root, path, NAV_WAVE_AMP)
  g.set(reveal, { attr: { x: 0, width: 0 } })

  const tl = g.timeline()
  navWaveTls.set(root, tl)

  tl.to(reveal, {
    attr: { width: NAV_WAVE_VB_W },
    duration: NAV_DRAW_S,
    ease: 'none',
  })
  tl.to(morph, {
    amp: 0,
    duration: NAV_FLAT_S,
    ease: 'power2.out',
    onUpdate: () => {
      applyWaveAmp(root, path, morph.amp)
    },
  })
}

export async function onNavWaveLeave(e: NavWaveEvent) {
  const parts = navWaveParts(e.currentTarget)
  if (!parts) return
  const { path, reveal, root } = parts
  const g = await gsap()
  navWaveTls.get(root)?.kill()

  const fromAmp = navWaveAmp.get(root) ?? 0
  const morph = { amp: fromAmp }
  const ampNeed = Math.max(0, NAV_WAVE_AMP - fromAmp) / NAV_WAVE_AMP
  const ampDur = NAV_LEAVE_AMP_S * ampNeed
  const wipeAt = ampDur > 0 ? NAV_LEAVE_WIPE_DELAY : 0

  const tl = g.timeline()
  navWaveTls.set(root, tl)

  if (ampDur > 0) {
    tl.to(
      morph,
      {
        amp: NAV_WAVE_AMP,
        duration: ampDur,
        ease: 'power1.out',
        onUpdate: () => {
          applyWaveAmp(root, path, morph.amp)
        },
      },
      0,
    )
  } else {
    applyWaveAmp(root, path, NAV_WAVE_AMP)
  }
  tl.to(
    reveal,
    {
      attr: { x: NAV_WAVE_VB_W, width: 0 },
      duration: NAV_LEAVE_WIPE_S,
      ease: 'power1.in',
      onComplete: () => {
        applyWaveAmp(root, path, 0)
      },
    },
    wipeAt,
  )
}
