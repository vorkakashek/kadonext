import type { HomeSectionId } from '~/utils/homeSections'

export type CaseDetailTransitionRequest = {
  direction: 'open' | 'close'
  /** A browser-history return keeps its original entry instead of pushing one. */
  historyBack?: boolean
  to: string
  src: string
  /** Exact already-painted browser candidate used only by the opening proxy. */
  proxySrc?: string
  webpSrcset?: string
  avifSrcset?: string
  mobileSrc?: string
  mobileWebpSrcset?: string
  mobileAvifSrcset?: string
  alt: string
  wash: string
  rect?: { top: number; left: number; width: number; height: number }
  /** Painted image box, including any live hover transform at click time. */
  imageRect?: { top: number; left: number; width: number; height: number }
  /** Computed source filter so a catalog hover cannot flash on proxy handoff. */
  imageFilter?: string
  targetSelector?: string
  /** In-page landing owned by the scroll driver, never serialized into the URL. */
  homeSection?: HomeSectionId
}

export type CaseDetailOrigin = 'home' | 'projects'

export function useCaseDetailTransition() {
  const localePath = useLocalePath()
  const request = useState<CaseDetailTransitionRequest | null>(
    'case-detail-transition-request',
    () => null,
  )
  const active = useState('case-detail-transition-active', () => false)
  // A cold detail entry (including reload) has no live source-page context.
  // Fall back to the project catalog; SPA opens still record their real origin.
  const origin = useState<CaseDetailOrigin>('case-detail-origin', () => 'projects')
  const home = useHomeExperience()
  const detail = useCaseDetailExperience()
  const { selectSection } = useHomeSectionNavigation()

  function openCaseDetail(next: Omit<CaseDetailTransitionRequest, 'direction'> & { origin: CaseDetailOrigin }) {
    if (active.value || request.value) return
    origin.value = next.origin
    const nextCaseId = next.to.split('/').at(-1) ?? 'audience'
    detail.beginTransitionEntry(nextCaseId)
    if (next.origin === 'home') {
      home.beginDetailOpen(nextCaseId)
    }
    request.value = { ...next, direction: 'open' }
  }

  function closeCaseDetail(next: Omit<CaseDetailTransitionRequest, 'direction' | 'to' | 'targetSelector'>) {
    if (active.value || request.value) return
    const returningHome = origin.value === 'home'
    detail.beginExit()
    if (returningHome) {
      selectSection('cases')
      home.beginDetailReturn()
    }
    request.value = {
      ...next,
      direction: 'close',
      to: localePath(returningHome ? '/' : '/projects'),
      homeSection: returningHome ? 'cases' : undefined,
      targetSelector: returningHome
        ? `[data-case-media="${next.src}"]`
        : `[data-case-cover="${next.src}"]`,
    }
  }

  return {
    request,
    active,
    origin,
    homeReturnPending: home.homeReturnPending,
    homeReturnMediaDocked: home.homeReturnMediaDocked,
    homeCaseId: home.activeCaseId,
    detailContentVisible: detail.contentVisible,
    revealDetailContent: detail.revealContent,
    completeCaseDetailEntry: detail.completeEntry,
    completeCaseDetailExit: detail.completeExit,
    completeDetailOpen: home.completeDetailOpen,
    consumeHomeReturnSurface: home.consumeHomeReturnSurface,
    markHomeReturnMediaDocked: home.markHomeReturnMediaDocked,
    completeDetailReturn: home.completeDetailReturn,
    openCaseDetail,
    closeCaseDetail,
  }
}
