import { isThumbNav } from '~/utils/mobileViewport'

/** Resolve home anchors in the layout Cases will have after its mobile exit. */
export function homeSectionScrollTop(target: HTMLElement) {
  const footerAnchor = target.id === 'contact' && !isThumbNav()
    ? document.querySelector<HTMLElement>('[data-contact-photo-boundary]')
    : null
  const anchor = footerAnchor ?? target
  const anchorOffset = footerAnchor
    ? window.innerHeight
    : Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0
  const pageOffset = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
  const tail = document.querySelector<HTMLElement>('.home-cases--mobile .cases-stage__mobile-tail')
  const pendingCollapse = tail && (tail.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING)
    ? tail.getBoundingClientRect().height
    : 0
  return Math.max(0, window.scrollY + anchor.getBoundingClientRect().top
    - anchorOffset - pageOffset - pendingCollapse)
}
