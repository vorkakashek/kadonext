import assert from 'node:assert/strict'
import { createTouchScrollOwnership } from '../app/utils/touchScrollOwnership.ts'

const event = (type, cancelable = true, fingers = type === 'touchend' ? 0 : 1) => ({
  type,
  cancelable,
  touches: { length: fingers },
  defaultPrevented: false,
  preventDefault() {
    assert.ok(this.cancelable)
    this.defaultPrevented = true
  },
})

// No minimum delta/velocity: even the first tiny or horizontal-only move
// must be cancelled before Lenis's own zero-vertical-delta early return.
const owns = createTouchScrollOwnership()
const tap = event('touchstart')
assert.equal(owns(tap), true)
assert.equal(tap.defaultPrevented, false)
for (let i = 0; i < 20; i++) {
  const move = event('touchmove')
  assert.equal(owns(move), true)
  assert.equal(move.defaultPrevented, true)
}
assert.equal(owns(event('touchend')), true)

// A runtime loaded during a native gesture must never add JS scrolling or
// release inertia, even if a later move becomes cancelable again.
owns(event('touchstart'))
assert.equal(owns(event('touchmove', false)), false)
const resumed = event('touchmove')
assert.equal(owns(resumed), false)
assert.equal(resumed.defaultPrevented, false)
assert.equal(owns(event('touchend')), false)
assert.equal(owns(event('touchstart')), true)
assert.equal(owns(event('touchmove')), true)
owns(event('touchend'))

// Nested rails retain ownership across direction changes and release.
owns(event('touchstart'))
assert.equal(owns(event('touchmove'), true), false)
assert.equal(owns(event('touchmove'), false), false)
assert.equal(owns(event('touchend')), false)

// Pinch zoom stays native until all fingers are released, including a
// third finger arriving after one of the original two was lifted.
owns(event('touchstart'))
assert.equal(owns(event('touchstart', true, 2)), false)
assert.equal(owns(event('touchend', true, 1)), false)
assert.equal(owns(event('touchstart', true, 2)), false)
assert.equal(owns(event('touchmove', true, 1)), false)
assert.equal(owns(event('touchend')), false)
assert.equal(owns(event('touchstart')), true)
assert.equal(owns(event('touchcancel', false, 0)), true)
assert.equal(owns(event('touchstart')), true)

console.log('Touch scroll ownership regression checks passed.')
