/** All native buttons inherit the interaction. Button-shaped links opt in. */
export const BUTTON_HOVER_SELECTOR = 'button, [role="button"], [data-button-hover], .chip-scale-host'

type HoverPoint = { clientX: number; clientY: number }
type HoverBox = { left: number; top: number; width: number; height: number }

export function buttonHoverOrigin(box: HoverBox, point?: HoverPoint) {
  const clamp = (value: number) => Math.min(100, Math.max(0, value))
  return point ? {
    x: clamp((point.clientX - box.left) / Math.max(box.width, 1) * 100),
    y: clamp((point.clientY - box.top) / Math.max(box.height, 1) * 100),
  } : { x: 50, y: 50 }
}

export function setButtonHoverOrigin(el: HTMLElement, event?: PointerEvent | FocusEvent) {
  // One geometry read at entry/focus; never track the pointer during the fill.
  const origin = buttonHoverOrigin(el.getBoundingClientRect(), event && 'clientX' in event ? event : undefined)
  el.style.setProperty('--button-hover-x', `${origin.x}%`)
  el.style.setProperty('--button-hover-y', `${origin.y}%`)
  // The header and Page Canvas retain their existing authored layers.
  el.style.setProperty('--chip-bg-x', `${origin.x}%`)
  el.style.setProperty('--chip-bg-y', `${origin.y}%`)
}

export function findButtonHoverHost(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const host = target.closest<HTMLElement>(BUTTON_HOVER_SELECTOR)
  if (!host || host.matches(':disabled, [aria-disabled="true"]') || host.closest('[inert], [data-button-hover="off"]')) return null
  return host
}

function surfaceFor(host: HTMLElement) {
  return host.querySelector<HTMLElement>('[data-button-hover-surface]') ?? host
}

/** Delegation also covers lazy components, Teleports and buttons added later. */
export function installButtonHover(root: Document, environment: Pick<Window, 'matchMedia'>) {
  const finePointer = environment.matchMedia('(hover: hover) and (pointer: fine)')
  let hovered: HTMLElement | null = null
  let focused: HTMLElement | null = null

  const update = (host: HTMLElement | null) => {
    if (!host) return
    surfaceFor(host).toggleAttribute('data-button-hover-active', host === hovered || host === focused)
  }

  function enter(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || !finePointer.matches) return
    const host = findButtonHoverHost(event.target)
    if (host === hovered) return
    const previous = hovered
    hovered = host
    update(previous)
    if (!host) return
    setButtonHoverOrigin(surfaceFor(host), event)
    update(host)
  }

  function leave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    const host = hovered
    if (!host || (event.relatedTarget instanceof Node && host.contains(event.relatedTarget))) return
    hovered = null
    // Keep the entry origin on exit, including when the pointer leaves via another edge.
    update(host)
  }

  function focus(event: FocusEvent) {
    const host = findButtonHoverHost(event.target)
    if (!host?.matches(':focus-visible')) return
    const previous = focused
    focused = host
    update(previous)
    if (host !== hovered) setButtonHoverOrigin(surfaceFor(host))
    update(host)
  }

  function blur(event: FocusEvent) {
    const host = focused
    if (!host || (event.relatedTarget instanceof Node && host.contains(event.relatedTarget))) return
    focused = null
    update(host)
  }

  function reset() {
    const previousHovered = hovered
    const previousFocused = focused
    hovered = focused = null
    update(previousHovered)
    update(previousFocused)
  }

  function cancel(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    const previous = hovered
    hovered = null
    update(previous)
  }

  // No mutation observer or animation ticker is needed.
  root.addEventListener('pointerover', enter, true)
  root.addEventListener('pointerout', leave, true)
  root.addEventListener('focusin', focus, true)
  root.addEventListener('focusout', blur, true)
  root.addEventListener('pointercancel', cancel, true)
  return () => {
    reset()
    root.removeEventListener('pointerover', enter, true)
    root.removeEventListener('pointerout', leave, true)
    root.removeEventListener('focusin', focus, true)
    root.removeEventListener('focusout', blur, true)
    root.removeEventListener('pointercancel', cancel, true)
  }
}
