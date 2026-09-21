import {
  INITIAL_SURFACE_HANDOFF_STATE,
  transitionSurfaceHandoff,
  type SurfaceHandoffState,
} from '~/utils/flowSurfaceContract'

export type HomeFlowPhase =
  | 'hero'
  | 'corridor'
  | 'cases-entering'
  | 'cases-docked'
  | 'cases-returning'

export type HomeCasePhase = 'idle' | 'switching'
export type HomeRoutePhase = 'idle' | 'opening-detail' | 'detail' | 'returning-home'

export type HomeExperiencePhase =
  | HomeFlowPhase
  | 'case-switching'
  | 'detail-opening'
  | 'detail-open'
  | 'detail-returning'

type HomeExperienceState = {
  activeCaseId: string
  caseInverse: boolean
  flowPhase: HomeFlowPhase
  casePhase: HomeCasePhase
  handoff: SurfaceHandoffState
  surfaceDocked: boolean
  surfaceReturning: boolean
  surfaceReady: boolean
  caseMediaVisible: boolean
}

/**
 * The single coordination boundary for the home experience.
 *
 * Components still own their rendering and timelines, but they no longer
 * communicate by mutating a loose collection of global booleans and nonce
 * refs. Every cross-feature transition is named here, so invalid ownership
 * combinations can be removed without changing the visual implementation.
 */
export function useHomeExperience() {
  const state = useState<HomeExperienceState>('home-experience', () => ({
    activeCaseId: 'audience',
    caseInverse: false,
    flowPhase: 'hero',
    casePhase: 'idle',
    handoff: { ...INITIAL_SURFACE_HANDOFF_STATE },
    surfaceDocked: false,
    surfaceReturning: false,
    surfaceReady: false,
    caseMediaVisible: false,
  }))
  // Preserve the active dev session across HMR while the persisted useState
  // shape moves from independent return flags to the ownership state machine.
  if (!state.value.handoff) {
    const legacy = state.value as HomeExperienceState & {
      routePhase?: HomeRoutePhase
      homeReturnSurfacePending?: boolean
      homeReturnMediaDocked?: boolean
    }
    if (legacy.routePhase === 'opening-detail') {
      state.value.handoff = { phase: 'detail-opening', owner: 'detail-proxy' }
    } else if (legacy.routePhase === 'detail') {
      state.value.handoff = { phase: 'detail', owner: 'detail-proxy' }
    } else if (legacy.routePhase === 'returning-home') {
      state.value.handoff = {
        phase: 'return-flight',
        owner: 'detail-proxy',
        surfacePrepared: !legacy.homeReturnSurfacePending,
        mediaDocked: !!legacy.homeReturnMediaDocked,
      }
    } else {
      state.value.handoff = { ...INITIAL_SURFACE_HANDOFF_STATE }
    }
  }

  const activeCaseId = computed(() => state.value.activeCaseId)
  const caseInverse = computed(() => state.value.caseInverse)
  const flowPhase = computed(() => state.value.flowPhase)
  const casePhase = computed(() => state.value.casePhase)
  const routePhase = computed<HomeRoutePhase>(() => {
    if (state.value.handoff.phase === 'detail-opening') return 'opening-detail'
    if (state.value.handoff.phase === 'detail') return 'detail'
    if (state.value.handoff.phase === 'return-flight') return 'returning-home'
    return 'idle'
  })
  const surfacePaintOwner = computed(() => state.value.handoff.owner)
  const surfaceDocked = computed(() => state.value.surfaceDocked)
  const surfaceReturning = computed(() => state.value.surfaceReturning)
  const surfaceReady = computed(() => state.value.surfaceReady)
  const caseMediaVisible = computed(() => state.value.caseMediaVisible)
  const homeReturnPending = computed(() => (
    state.value.handoff.phase === 'return-flight'
    && !state.value.handoff.surfacePrepared
  ))
  const homeReturnMediaDocked = computed(() => (
    state.value.handoff.phase === 'return-flight'
    && state.value.handoff.mediaDocked
  ))
  const phase = computed<HomeExperiencePhase>(() => {
    if (routePhase.value === 'opening-detail') return 'detail-opening'
    if (routePhase.value === 'detail') return 'detail-open'
    if (routePhase.value === 'returning-home') return 'detail-returning'
    if (state.value.casePhase === 'switching') return 'case-switching'
    return state.value.flowPhase
  })

  function selectCase(id: string, inverse = state.value.caseInverse) {
    state.value.activeCaseId = id
    state.value.caseInverse = inverse
  }

  function setCaseInverse(inverse: boolean) {
    state.value.caseInverse = inverse
  }

  function beginCaseSwitch() {
    state.value.casePhase = 'switching'
  }

  function completeCaseSwitch() {
    state.value.casePhase = 'idle'
  }

  function beginCasesEntry() {
    if (!state.value.surfaceReturning && !state.value.surfaceDocked) {
      state.value.flowPhase = 'cases-entering'
    }
  }

  function setSurfaceDocked(docked: boolean) {
    state.value.surfaceDocked = docked
    if (docked) {
      if (!state.value.surfaceReturning) state.value.flowPhase = 'cases-docked'
      return
    }
    if (
      !state.value.surfaceReturning
      && state.value.flowPhase !== 'cases-entering'
    ) {
      state.value.flowPhase = 'corridor'
    }
    state.value.surfaceReady = false
  }

  function setSurfaceReady(ready: boolean) {
    state.value.surfaceReady = ready
  }

  function setCaseMediaVisible(visible: boolean) {
    state.value.caseMediaVisible = visible
  }

  function setSurfaceReturning(returning: boolean) {
    state.value.surfaceReturning = returning
    if (returning) {
      state.value.flowPhase = 'cases-returning'
      state.value.surfaceReady = false
      return
    }
    state.value.flowPhase = state.value.surfaceDocked
      ? 'cases-docked'
      : 'corridor'
  }

  function beginDetailOpen(caseId: string) {
    state.value.activeCaseId = caseId
    state.value.handoff = transitionSurfaceHandoff(
      state.value.handoff,
      { type: 'detail-open-started' },
    )
  }

  function completeDetailOpen() {
    state.value.handoff = transitionSurfaceHandoff(
      state.value.handoff,
      { type: 'detail-open-completed' },
    )
  }

  function beginDetailReturn() {
    state.value.handoff = transitionSurfaceHandoff(
      state.value.handoff,
      { type: 'detail-return-started' },
    )
  }

  function consumeHomeReturnSurface() {
    state.value.handoff = transitionSurfaceHandoff(
      state.value.handoff,
      { type: 'return-surface-prepared' },
    )
  }

  function markHomeReturnMediaDocked() {
    state.value.handoff = transitionSurfaceHandoff(
      state.value.handoff,
      { type: 'return-media-docked' },
    )
  }

  function completeDetailReturn() {
    const next = transitionSurfaceHandoff(
      state.value.handoff,
      { type: 'detail-return-completed' },
    )
    state.value.handoff = next
    if (next.phase === 'return-dock') {
      // The proxy has visibly completed the Cases waypoint. Commit the whole
      // ownership snapshot atomically instead of retaining the pre-return
      // scroll-derived Surface state. Desktop keeps its fixed frame parked
      // under the local raster; mobile may additionally pin that same frame.
      state.value.caseMediaVisible = true
      state.value.surfaceReturning = false
      state.value.surfaceDocked = true
      state.value.surfaceReady = true
      state.value.flowPhase = 'cases-docked'
    }
  }

  function releaseHomeReturnSnapshot() {
    state.value.handoff = transitionSurfaceHandoff(
      state.value.handoff,
      { type: 'scroll-acquired' },
    )
  }

  return {
    phase,
    flowPhase,
    casePhase,
    routePhase,
    surfacePaintOwner,
    activeCaseId,
    caseInverse,
    surfaceDocked,
    surfaceReturning,
    surfaceReady,
    caseMediaVisible,
    homeReturnPending,
    homeReturnMediaDocked,
    selectCase,
    setCaseInverse,
    beginCaseSwitch,
    completeCaseSwitch,
    beginCasesEntry,
    setSurfaceDocked,
    setSurfaceReady,
    setCaseMediaVisible,
    setSurfaceReturning,
    beginDetailOpen,
    completeDetailOpen,
    beginDetailReturn,
    consumeHomeReturnSurface,
    markHomeReturnMediaDocked,
    completeDetailReturn,
    releaseHomeReturnSnapshot,
  }
}
