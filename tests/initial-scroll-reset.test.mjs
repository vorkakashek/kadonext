import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isReloadNavigation,
  shouldResetInitialScroll,
} from '../app/utils/initialScrollReset.ts'

const timing = type => ({ getEntriesByType: () => [{ type }] })

test('reload detection prefers Navigation Timing L2 and supports legacy Safari', () => {
  assert.equal(isReloadNavigation(timing('reload')), true)
  assert.equal(isReloadNavigation(timing('navigate')), false)
  assert.equal(isReloadNavigation({ navigation: { type: 1 } }), true)
  assert.equal(isReloadNavigation({ navigation: { type: 2 } }), false)
})

test('only a reloaded localized or canonical home resets to the Hero', () => {
  for (const path of ['/', '/ru/', '/en']) {
    assert.equal(shouldResetInitialScroll(path, timing('reload')), true)
  }

  assert.equal(shouldResetInitialScroll('/projects', timing('reload')), false)
  assert.equal(shouldResetInitialScroll('/ru/projects/kado', timing('reload')), false)
  assert.equal(shouldResetInitialScroll('/', timing('back_forward')), false)
  assert.equal(shouldResetInitialScroll('/', timing('navigate')), false)
})
