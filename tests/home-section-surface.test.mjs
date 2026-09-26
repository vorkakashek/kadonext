import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'
import { lerpBox } from '../app/utils/flowSurfaceMorph.ts'
import {
  mixSurfaceVisualSnapshot,
  planSurfaceRoute,
} from '../app/utils/flowSurfaceContract.ts'
import { HOME_SECTION_DESTINATIONS, isHomeMotionSection } from '../app/utils/homeSectionMotion.ts'

function harness() {
  // Run the host's actual ownership/handoff functions with a controllable corridor.
  const source = readFileSync(new URL('../app/components/FlowSurfaceHost.vue', import.meta.url), 'utf8')
    .split('<script setup lang="ts">')[1].split('</script>')[0]
  const tree = ts.createSourceFile('host.ts', source, ts.ScriptTarget.Latest, true)
  const names = new Set([
    'currentSurfaceTone',
    'publishSurfaceTone',
    'publishHeroHorizontalMorph',
    'stageRestBox',
    'syncStageRest',
    'captureCurrentSurfaceSnapshot',
    'paintAnchorDestination',
    'beginAnchorSurfaceTrip',
    'paintAnchorSurfaceHandoff',
    'tick',
    'ensureTick',
    'onAnchorVisibilityChange',
    'onAppliedSurfaceFrame',
  ])
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text))
    .map(node => node.getText(tree)).join('\n')
  const paints = []
  const style = new Map()
  const noop = () => {}
  let now = 0
  const context = createContext({
    frame: { value: { style: { getPropertyValue: key => style.get(key) ?? '', setProperty: (key, value) => style.set(key, value) } } },
    liveBox: { top: 20, left: 10, width: 100, height: 100 },
    destination: { top: 100, left: 50, width: 500, height: 400 },
    serviceDestination: { top: 100, left: 50, width: 500, height: 400 },
    homeDestination: { top: 150, left: 10, width: 1000, height: 700 },
    destinationS: 5, desktopLiveS: 0,
    stageRest: { top: 20, left: 10, w: 100, h: 100 },
    anchorMotion: null, anchorSample: null, raf: 0, lastTs: 0,
    keepAliveActive: true, morphBooting: false, mobileActive: false, pinTo: { value: null },
    flowSurfaceMask: { morph: 0, heroHorizontalMorph: 0, heroReturning: false }, proxyParked: { value: false },
    contactStageProgress: { value: 0 }, lastAboutTitleOpacity: '', lastCaseToneCss: '',
    stMod: null, ANCHOR_SURFACE_DURATION_MS: 720,
    HOME_SECTION_DESTINATIONS, isHomeMotionSection,
    props: { formatsSurfaceEl: {} },
    window: { scrollY: 4000 }, document: { hidden: false }, performance: { now: () => now },
    proxyPose: () => null,
    stableViewportHeight: () => 900,
    suspendDetachedSurfaceHost: () => false,
    desktopReturnOwnsPaint: () => false,
    returningHomeFromCaseDetail: () => false,
    surfacePaintOwner: { value: 'scroll' },
    returnDockScrollY: null,
    requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    capturePoses: noop, killHopTween: noop, killCaseSettleTween: noop,
    killFormatsSettleTween: noop, killAboutSettleTween: noop,
    clearCaseMediaReveal: noop, endMobileCaseTransformPaint: noop, unpinFrame: noop,
    setSurfaceDocked: noop, setSurfaceReady: noop, setCaseMediaVisible: noop, clearCaseMediaFlight: noop,
    releaseHomeReturnSnapshot: noop,
    paintAboutTitleContrast: noop, lerpBox, mixSurfaceVisualSnapshot, planSurfaceRoute,
    clearAboutTitleContrast: noop,
    parkMobileAboutWaypoint: noop, pinMobileHeroRevealFrame: noop,
    clampUnit: value => Math.max(0, Math.min(1, value)),
    smoothUnit: value => value * value * (3 - 2 * value),
  })
  context.computeDesktopTarget = () => context.destinationS
  context.readBox = () => context.serviceDestination
  context.formatsSurfacePose = () => context.serviceDestination
  context.projectFormatSurfacePose = () => context.destination
  context.mobileFormatsSettledBox = () => context.serviceDestination
  context.heroLivePose = () => context.homeDestination
  context.aboutSurfacePose = () => context.destination
  context.paintAboutSurfaceTone = () => style.set('--flow-surface-tone', 'var(--palette-stone)')
  context.setContactStageProgress = progress => { context.contactStageProgress.value = progress }
  context.paintBox = (box, morph) => {
    if (context.anchorSample) { Object.assign(context.anchorSample, { box, morph }); return }
    paints.push({ ...box, morph, stageTop: context.stageRest.top })
    context.liveBox = { ...box }
    context.flowSurfaceMask.morph = morph
  }
  context.paintDesktop = () => {
    if (context.anchorMotion && !context.anchorSample) return
    context.syncStageRest(context.destination)
    context.paintBox(context.destination, 1)
    style.set('--flow-surface-tone', 'var(--palette-stone)')
    context.setContactStageProgress(1)
  }
  context.paintAboutToContactSegment = context.paintDesktop
  context.paintFormatsToAboutSegment = context.paintDesktop
  context.paintMobileScrollCorridor = context.paintDesktop
  runInContext(ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { context, paints, advance(ms) { now += ms; context.tick(now) }, setNow(value) { now = value } }
}

test('scroll holds the source; settlement interpolates directly to the final pose', () => {
  const h = harness()
  const motion = h.context.beginAnchorSurfaceTrip('contact', 4000)
  assert.equal(h.context.anchorMotion.route.mode, 'coalesce')
  for (let i = 0; i < 10; i++) h.advance(16)
  assert.equal(h.paints.length, 1)
  motion.settle()
  for (let i = 0; i < 24; i++) h.advance(15)
  assert.equal(h.paints.at(-1).width, 300)
  assert.equal(h.paints.at(-1).morph, 0.5)
  for (let i = 0; i < 24; i++) h.advance(15)
  assert.equal(h.context.anchorMotion, null)
  assert.equal(h.context.desktopLiveS, 8)
  assert.equal(h.paints.at(-1).width, 500)
})

test('cancel samples the actual corridor and tracks layout changes during its handoff', () => {
  const h = harness()
  const motion = h.context.beginAnchorSurfaceTrip('contact', 4000)
  h.context.destinationS = 3
  h.context.destination.width = 200
  motion.cancel()
  for (let i = 0; i < 24; i++) h.advance(15)
  assert.equal(h.paints.at(-1).width, 150)
  assert.equal(h.paints.at(-1).stageTop, 60)
  h.context.destination.width = 220
  for (let i = 0; i < 24; i++) h.advance(15)
  assert.equal(h.paints.at(-1).width, 220)
  assert.equal(h.paints.at(-1).stageTop, 100)
  assert.equal(h.context.desktopLiveS, 3)
})

test('a stale trip cannot settle a newer freeze', () => {
  const h = harness()
  const previous = h.context.beginAnchorSurfaceTrip('contact', 4000)
  h.context.beginAnchorSurfaceTrip('contact', 4000)
  previous.settle()
  assert.equal(h.context.anchorMotion.phase, 'scroll')
})

test('hidden tabs pause the handoff clock and resume without a jump', () => {
  const h = harness()
  h.context.beginAnchorSurfaceTrip('contact', 4000).settle()
  h.advance(16)
  const before = h.paints.at(-1).width
  h.context.document.hidden = true
  h.advance(10000)
  assert.equal(h.paints.at(-1).width, before)
  h.context.document.hidden = false
  h.context.onAnchorVisibilityChange()
  h.advance(16)
  assert.ok(h.paints.at(-1).width < 110)
  assert.ok(h.context.anchorMotion)
})

test('a forward desktop contact hop starts above the viewport, even when Hero was below', () => {
  const h = harness()
  h.context.window.scrollY = 0
  h.context.liveBox.top = 1000
  const motion = h.context.beginAnchorSurfaceTrip('contact', 4000)
  h.context.onAppliedSurfaceFrame({ y: 3800 })
  assert.ok(h.paints.at(-1).top < 0)
  motion.approach(4000)
  assert.ok(
    h.context.anchorMotion.from.box.top + h.context.anchorMotion.from.box.height < 0,
  )
})

test('mobile Contact stays aligned with its actual slot through the scroll tail', () => {
  const h = harness()
  h.context.mobileActive = true
  h.context.window.scrollY = 3850
  h.context.destination.top = 150
  h.context.destinationS = 4.8 // The scroll corridor has not reached Contact yet.
  const motion = h.context.beginAnchorSurfaceTrip('contact', 4000)
  motion.approach(4000)
  for (let i = 0; i < 48; i++) h.advance(15)
  assert.equal(h.paints.at(-1).top, 150)
  assert.ok(h.context.anchorMotion)
  h.context.window.scrollY = 3990
  h.context.destination.top = 10
  h.advance(15)
  assert.equal(h.paints.at(-1).top, 10)
  h.context.window.scrollY = 4000
  h.context.destination.top = 0
  motion.settle(4000)
  h.advance(15)
  assert.equal(h.context.anchorMotion, null)
  assert.equal(h.paints.at(-1).top, 0)
})

test('a mobile surface cannot cross Contact and return while the document still moves', () => {
  const h = harness()
  h.context.mobileActive = true
  h.context.window.scrollY = 3850
  h.context.liveBox.top = 1200
  h.context.destination.top = 150
  const motion = h.context.beginAnchorSurfaceTrip('contact', 4000)
  motion.approach(4000)
  let previousGap = Infinity
  for (let i = 1; i <= 48; i++) {
    h.context.window.scrollY = 3850 + i * 2
    h.context.destination.top = 4000 - h.context.window.scrollY
    h.advance(15)
    const painted = h.paints.at(-1)
    const gap = painted.top - h.context.destination.top
    assert.ok(gap >= -0.001, `crossed Contact at frame ${i}`)
    assert.ok(gap <= previousGap + 0.001, `reversed at frame ${i}`)
    previousGap = gap
  }
  assert.equal(previousGap, 0)
  assert.equal(h.paints.at(-1).top, 54)
  assert.ok(h.context.anchorMotion)
})

test('interrupting an early handoff continues from its visible pose', () => {
  const h = harness()
  const motion = h.context.beginAnchorSurfaceTrip('contact', 4000)
  motion.approach(4000)
  for (let i = 0; i < 24; i++) h.advance(15)
  const before = h.paints.at(-1)
  motion.cancel()
  assert.equal(h.context.anchorMotion.from.box.width, before.width)
  assert.equal(h.context.anchorMotion.from.morph, before.morph)
  assert.equal(h.context.anchorMotion.elapsed, 0)
  assert.equal(h.context.anchorMotion.targetId, null)
})

test('Contact → Services uses the named Services pose in both directions of scroll', () => {
  const h = harness()
  h.context.window.scrollY = 6000
  h.context.flowSurfaceMask.morph = 1
  h.context.destination.width = 900 // Current corridor still points at Contact.
  h.context.destinationS = 5
  h.context.serviceDestination = { top: -2900, left: 50, width: 500, height: 400 }
  const motion = h.context.beginAnchorSurfaceTrip('services', 3000)
  motion.approach(3000)
  assert.equal(h.context.anchorMotion.from.box.top, 924)
  for (let i = 0; i < 48; i++) h.advance(15)
  assert.equal(h.paints.at(-1).width, 500)
  assert.equal(h.paints.at(-1).top, 100)
  h.context.window.scrollY = 3000
  h.context.serviceDestination.top = 100
  motion.settle(3000)
  h.advance(15)
  assert.equal(h.context.desktopLiveS, 3)
  assert.equal(h.paints.at(-1).width, 500)
})

test('logo return morphs directly to Hero without the scroll corridor taking over', () => {
  const h = harness()
  h.context.window.scrollY = 4000
  h.context.flowSurfaceMask.morph = 1
  h.context.destinationS = 5
  h.context.homeDestination.top = -3850
  const motion = h.context.beginAnchorSurfaceTrip('home', 0)
  motion.approach(0)
  for (let i = 0; i < 24; i++) h.advance(15)
  assert.equal(h.paints.at(-1).morph, 0.5)
  assert.equal(h.paints.at(-1).width, 550)
  assert.ok(h.context.anchorMotion)
  h.context.window.scrollY = 0
  h.context.homeDestination.top = 150
  h.context.destinationS = -0.42
  motion.settle(0)
  for (let i = 0; i < 24; i++) h.advance(15)
  assert.equal(h.paints.at(-1).morph, 0)
  assert.equal(h.context.desktopLiveS, -0.42)
})

test('About shares the named-pose handoff rather than sampling a previous segment', () => {
  const h = harness()
  h.context.destinationS = 3.2
  const motion = h.context.beginAnchorSurfaceTrip('about', 4000)
  motion.settle(4000)
  for (let i = 0; i < 48; i++) h.advance(15)
  assert.equal(h.context.desktopLiveS, 7)
  assert.equal(h.context.anchorMotion, null)
})

test('Pricing lands on the first project-format surface', () => {
  const h = harness()
  h.context.destination.width = 640
  const motion = h.context.beginAnchorSurfaceTrip('project-formats', 4000)
  motion.settle(4000)
  for (let i = 0; i < 48; i++) h.advance(15)
  assert.equal(h.context.desktopLiveS, 4)
  assert.equal(h.paints.at(-1).width, 640)
  assert.equal(h.context.anchorMotion, null)
})
