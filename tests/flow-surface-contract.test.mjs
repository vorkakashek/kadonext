import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  INITIAL_SURFACE_HANDOFF_STATE,
  mixSurfaceVisualSnapshot,
  planSurfaceRoute,
  transitionSurfaceHandoff,
} from '../app/utils/flowSurfaceContract.ts'
import {
  appliedScrollInputRevision,
  markAppliedScrollInput,
  publishAppliedScrollFrame,
  subscribeAppliedScrollFrame,
} from '../app/utils/appliedScrollFrame.ts'

test('applied scroll frames distinguish user input from programmatic movement', () => {
  const frames = []
  const remove = subscribeAppliedScrollFrame(frame => frames.push(frame))
  const before = appliedScrollInputRevision()
  publishAppliedScrollFrame(120, 'native', 100)
  assert.equal(frames.at(-1).inputRevision, before)
  markAppliedScrollInput('wheel')
  publishAppliedScrollFrame(180, 'native', 116)
  assert.equal(frames.at(-1).inputRevision, before + 1)
  remove()
})

test('detail return has one explicit paint owner through proxy, dock, and scroll', () => {
  let state = transitionSurfaceHandoff(
    INITIAL_SURFACE_HANDOFF_STATE,
    { type: 'detail-open-started' },
  )
  assert.deepEqual(state, { phase: 'detail-opening', owner: 'detail-proxy' })
  state = transitionSurfaceHandoff(state, { type: 'detail-open-completed' })
  state = transitionSurfaceHandoff(state, { type: 'detail-return-started' })
  assert.deepEqual(state, {
    phase: 'return-flight',
    owner: 'detail-proxy',
    surfacePrepared: false,
    mediaDocked: false,
  })
  state = transitionSurfaceHandoff(state, { type: 'return-surface-prepared' })
  state = transitionSurfaceHandoff(state, { type: 'return-media-docked' })
  state = transitionSurfaceHandoff(state, { type: 'detail-return-completed' })
  assert.deepEqual(state, { phase: 'return-dock', owner: 'return-dock' })
  state = transitionSurfaceHandoff(state, { type: 'scroll-acquired' })
  assert.deepEqual(state, INITIAL_SURFACE_HANDOFF_STATE)
})

test('late return callbacks cannot steal ownership from scroll', () => {
  const latePrepared = transitionSurfaceHandoff(
    INITIAL_SURFACE_HANDOFF_STATE,
    { type: 'return-surface-prepared' },
  )
  const lateDock = transitionSurfaceHandoff(
    INITIAL_SURFACE_HANDOFF_STATE,
    { type: 'return-media-docked' },
  )
  assert.deepEqual(latePrepared, INITIAL_SURFACE_HANDOFF_STATE)
  assert.deepEqual(lateDock, INITIAL_SURFACE_HANDOFF_STATE)
})

test('an incomplete return falls back to scroll ownership', () => {
  let state = transitionSurfaceHandoff(
    { phase: 'detail', owner: 'detail-proxy' },
    { type: 'detail-return-started' },
  )
  state = transitionSurfaceHandoff(state, { type: 'detail-return-completed' })
  assert.deepEqual(state, INITIAL_SURFACE_HANDOFF_STATE)
})

test('return paint ownership never prevents the full corridor from being built', () => {
  const source = readFileSync(
    new URL('../app/components/FlowSurfaceHost.vue', import.meta.url),
    'utf8',
  )
  const buildMorph = source.slice(
    source.indexOf('function buildMorph()'),
    source.indexOf('function mobileViewportHeightOnlyChange()'),
  )
  assert.ok(buildMorph.length > 0, 'buildMorph must remain present')
  assert.doesNotMatch(
    buildMorph,
    /desktopReturnOwnsPaint\(\)[^\n]*return/,
    'a return dock may suppress paint, but must not suppress trigger topology',
  )
  assert.match(
    source,
    /if \(!trigger\) \{\s*buildMorph\(\)\s*return\s*\}/,
    'scroll acquisition must recover a corridor missed during remount',
  )
  assert.match(
    source,
    /scrollFrame\.inputRevision <= returnDockInputRevision/,
    'programmatic scroll frames must not acquire paint from the return dock',
  )
  assert.match(
    source,
    /maskGeometryChanged = !boxesNear\(next, committedMaskBox\(\)\)/,
    'frame dedupe must include the committed SVG mask geometry',
  )
  assert.match(
    source,
    /!frameGeometryChanged && !maskGeometryChanged && !morphChanged/,
    'paint may be skipped only when frame, mask, and morph all agree',
  )
  assert.match(
    source,
    /onActivated\(\(\) => \{[\s\S]*?claimSurfaceDomOwnership\(\)/,
    'an activated host must reclaim the shared SVG path element',
  )
})

test('shared surface DOM registrations use identity-safe cleanup', () => {
  const source = readFileSync(
    new URL('../app/composables/useFlowSurfaceMask.ts', import.meta.url),
    'utf8',
  )
  assert.match(source, /if \(clipPathEl === el\) clipPathEl = null/)
  assert.match(source, /if \(liveBoxNudge === fn\) liveBoxNudge = null/)
  assert.doesNotMatch(source, /pathFlush/)
  assert.match(source, /flowSurfaceMask\.pathRequestRevision \+= 1/)
})

test('nearby scroll goals retain the normal bounded follow contract', () => {
  const route = planSurfaceRoute(1, 1.8)
  assert.equal(route.mode, 'follow')
  assert.equal(route.direction, 'forward')
  assert.equal(route.skippedWaypoints, 0)
  assert.equal(route.maxVelocity, 1.55)
})

test('a stale multi-waypoint backlog is coalesced and accelerated', () => {
  const route = planSurfaceRoute(1, 4)
  assert.equal(route.mode, 'coalesce')
  assert.equal(route.direction, 'forward')
  assert.equal(route.skippedWaypoints, 2)
  assert.ok(route.maxVelocity > 1.55)
  assert.ok(route.maxVelocity <= 3.1)
})

test('reverse routes use the same coalescing rule', () => {
  const route = planSurfaceRoute(5, 1)
  assert.equal(route.mode, 'coalesce')
  assert.equal(route.direction, 'reverse')
  assert.equal(route.skippedWaypoints, 3)
  assert.equal(route.maxVelocity, 3.1)
})

test('snapshot interpolation continues from the actually painted frame', () => {
  const from = {
    box: { top: 20, left: 10, width: 100, height: 80 },
    stage: { top: 30, left: 20, width: 120, height: 90 },
    morph: 0.2,
    horizontalMorph: 0.4,
    tone: 'green',
    aboutOpacity: 0,
    contactProgress: 0,
  }
  const to = {
    box: { top: 100, left: 50, width: 500, height: 400 },
    stage: { top: 70, left: 40, width: 320, height: 210 },
    morph: 1,
    horizontalMorph: 1,
    tone: 'stone',
    aboutOpacity: 1,
    contactProgress: 0.5,
  }
  const mixed = mixSurfaceVisualSnapshot(from, to, 0.5)
  assert.deepEqual(mixed.box, { top: 60, left: 30, width: 300, height: 240 })
  assert.deepEqual(mixed.stage, { top: 50, left: 30, width: 220, height: 150 })
  assert.ok(Math.abs(mixed.morph - 0.6) < 0.000001)
  assert.equal(mixed.horizontalMorph, 0.7)
  assert.equal(mixed.aboutOpacity, 0.5)
  assert.equal(mixed.contactProgress, 0.25)
  assert.match(mixed.tone, /^color-mix\(in srgb/)
})

test('missing destination geometry never discards the visible source box', () => {
  const from = {
    box: { top: 20, left: 10, width: 100, height: 80 },
    stage: { top: 30, left: 20, width: 120, height: 90 },
    morph: 0,
    horizontalMorph: 0,
    tone: 'green',
    aboutOpacity: 0,
    contactProgress: 0,
  }
  const mixed = mixSurfaceVisualSnapshot(from, { ...from, box: null }, 1)
  assert.deepEqual(mixed.box, from.box)
})
