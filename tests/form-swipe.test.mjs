import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFormSwipeGuard } from '../app/utils/formSwipeGuard.ts'
import { createTouchScrollOwnership } from '../app/utils/touchScrollOwnership.ts'

test('a page-owned swipe on a field cancels native scroll and its focus click', () => {
  const guard = createFormSwipeGuard()
  const owns = createTouchScrollOwnership()
  const field = {}
  let cancelled = false
  const event = type => ({ type, touches: { length: type === 'touchend' ? 0 : 1 }, cancelable: true, preventDefault() { cancelled = true } })
  guard.start(field, 100, 200)
  assert.equal(owns(event('touchstart')), true)
  assert.equal(cancelled, false)
  assert.equal(owns(event('touchmove')), true)
  assert.equal(cancelled, true)
  guard.move(100, 170)
  guard.move(100, 200) // Returning to the origin still counts as a swipe.
  guard.end(300)
  assert.equal(guard.suppressClick(field, 310), true)
  assert.equal(guard.suppressClick(field, 320), false)
})

test('taps and a fresh gesture after a swipe can focus the field', () => {
  const guard = createFormSwipeGuard()
  const field = {}
  guard.start(field, 100, 200)
  guard.move(103, 202)
  guard.end(100)
  assert.equal(guard.suppressClick(field, 110), false)
  guard.start(field, 100, 200)
  guard.move(100, 160)
  guard.end(200)
  guard.start(field, 100, 200)
  guard.end(250)
  assert.equal(guard.suppressClick(field, 260), false)
})

test('swipe suppression expires, stays local, and resets for native gestures', () => {
  const guard = createFormSwipeGuard()
  const field = {}
  const swipe = () => { guard.start(field, 0, 0); guard.move(0, 40); guard.end(100) }
  swipe()
  assert.equal(guard.suppressClick({}, 110), false)
  swipe()
  assert.equal(guard.suppressClick(field, 801), false)
  swipe()
  guard.reset()
  assert.equal(guard.suppressClick(field, 110), false)
  const owns = createTouchScrollOwnership()
  const event = type => ({ type, touches: { length: 1 }, cancelable: true, preventDefault() { assert.fail('native control must not be cancelled') } })
  assert.equal(owns(event('touchstart'), true), false)
  assert.equal(owns(event('touchmove')), false)
})
