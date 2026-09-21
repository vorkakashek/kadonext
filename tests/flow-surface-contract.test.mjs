import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mixSurfaceVisualSnapshot,
  planSurfaceRoute,
} from '../app/utils/flowSurfaceContract.ts'

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
    morph: 0.2,
    horizontalMorph: 0.4,
    tone: 'green',
    aboutOpacity: 0,
    contactProgress: 0,
  }
  const to = {
    box: { top: 100, left: 50, width: 500, height: 400 },
    morph: 1,
    horizontalMorph: 1,
    tone: 'stone',
    aboutOpacity: 1,
    contactProgress: 0.5,
  }
  const mixed = mixSurfaceVisualSnapshot(from, to, 0.5)
  assert.deepEqual(mixed.box, { top: 60, left: 30, width: 300, height: 240 })
  assert.ok(Math.abs(mixed.morph - 0.6) < 0.000001)
  assert.equal(mixed.horizontalMorph, 0.7)
  assert.equal(mixed.aboutOpacity, 0.5)
  assert.equal(mixed.contactProgress, 0.25)
  assert.match(mixed.tone, /^color-mix\(in srgb/)
})

test('missing destination geometry never discards the visible source box', () => {
  const from = {
    box: { top: 20, left: 10, width: 100, height: 80 },
    morph: 0,
    horizontalMorph: 0,
    tone: 'green',
    aboutOpacity: 0,
    contactProgress: 0,
  }
  const mixed = mixSurfaceVisualSnapshot(from, { ...from, box: null }, 1)
  assert.deepEqual(mixed.box, from.box)
})
