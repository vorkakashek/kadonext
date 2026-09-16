import assert from 'node:assert/strict'
import {
  MOBILE_HERO_COPY_DESCENT_RATE,
  MOBILE_HERO_COPY_TRAVEL_VH,
  MOBILE_HERO_COPY_FADE_TRAVEL_VH,
  MOBILE_HERO_COPY_EXIT_SCALE,
  mobileHeroSurfaceMorphStartScrollY,
  mobileHeroCopyMotionStartY,
  mobileHeroCopyOpacity,
  mobileHeroCopyScale,
  mobileHeroCopyTranslation,
  readMobileHeroCopyLayout,
} from '../app/utils/mobileHeroCopyMotion.ts'

const near = (actual, expected) => assert.ok(
  Math.abs(actual - expected) < 1e-8,
  `Expected ${expected}, got ${actual}`,
)
const originalWindow = globalThis.window
let scrollY = 0
const sectionTop = 80
const section = {
  getBoundingClientRect: () => ({ top: sectionTop - scrollY }),
  querySelector: () => title,
}
const copy = { offsetTop: 0, offsetParent: section }
const title = {
  offsetTop: 96,
  offsetHeight: 180,
  offsetParent: copy,
  // Regression: a transformed rect is not an input to layout capture.
  getBoundingClientRect: () => { throw new Error('Read animated title geometry') },
}
const sceneGrid = { offsetTop: 420, offsetParent: section }
const surface = { offsetTop: 0, offsetParent: sceneGrid }

try {
  globalThis.window = { get scrollY() { return scrollY } }
  const baseline = readMobileHeroCopyLayout(section, surface, 800)
  assert.ok(baseline)
  const morphStartY = mobileHeroSurfaceMorphStartScrollY(baseline)
  const motionStartY = mobileHeroCopyMotionStartY(baseline)
  near(motionStartY, 0)
  // The existing scene runway does not change when copy pacing changes.
  near(morphStartY, sectionTop + 420 - 96 + 2)

  // Refresh on a scrolled page, reverse scroll and repeated refresh all retain
  // the same geometry/range. No previous paint state is part of the model.
  for (const y of [0, 120, 320, 640, 1600, 640, 320, 120, 0]) {
    scrollY = y
    const recaptured = readMobileHeroCopyLayout(section, surface, 800)
    assert.deepEqual(recaptured, baseline)
    near(mobileHeroSurfaceMorphStartScrollY(recaptured), morphStartY)
    near(mobileHeroCopyMotionStartY(recaptured), motionStartY)
    near(mobileHeroCopyTranslation(y, recaptured), mobileHeroCopyTranslation(y, baseline))
  }

  // No transform before or exactly at page top; continuous onset afterwards.
  for (const y of [-100, 0, motionStartY - 1, motionStartY]) {
    near(mobileHeroCopyTranslation(y, baseline), 0)
  }
  near(mobileHeroCopyTranslation(motionStartY + 0.001, baseline), 0.001 * (1 + MOBILE_HERO_COPY_DESCENT_RATE))

  // After the trigger, the final viewport position moves down slowly.
  const before = motionStartY + 20
  const after = motionStartY + 180
  near(
    mobileHeroCopyTranslation(after, baseline)
      - mobileHeroCopyTranslation(before, baseline) - (after - before),
    (after - before) * MOBILE_HERO_COPY_DESCENT_RATE,
  )
  near(mobileHeroCopyTranslation(-100, baseline), 0)
  near(
    mobileHeroCopyTranslation(10000, baseline),
    baseline.viewportHeight * MOBILE_HERO_COPY_TRAVEL_VH
      * (1 + MOBILE_HERO_COPY_DESCENT_RATE),
  )

  // Changing text geometry must not move the absolute page-top trigger.
  const tallerCopy = { ...baseline, titleHeight: baseline.titleHeight + 100 }
  near(mobileHeroCopyMotionStartY(tallerCopy), motionStartY)
  // Reverse scroll returns to the original position without a retained pin.
  for (const y of [motionStartY + 300, motionStartY + 100, motionStartY, 0]) {
    near(mobileHeroCopyTranslation(y, baseline), Math.max(0, y - motionStartY) * (1 + MOBILE_HERO_COPY_DESCENT_RATE))
  }

  const fadeTravel = baseline.viewportHeight * MOBILE_HERO_COPY_FADE_TRAVEL_VH
  near(mobileHeroCopyOpacity(motionStartY - 100, baseline), 1)
  near(mobileHeroCopyOpacity(motionStartY, baseline), 1)
  near(mobileHeroCopyOpacity(motionStartY + fadeTravel, baseline), 0)
  near(mobileHeroCopyOpacity(motionStartY + fadeTravel * 0.5, baseline), 0.5)
  near(mobileHeroCopyOpacity(motionStartY + fadeTravel * 2, baseline), 0)
  near(mobileHeroCopyScale(motionStartY - 100, baseline), 1)
  near(mobileHeroCopyScale(motionStartY, baseline), 1)
  near(mobileHeroCopyScale(motionStartY + fadeTravel * 0.5, baseline), (1 + MOBILE_HERO_COPY_EXIT_SCALE) * 0.5)
  near(mobileHeroCopyScale(motionStartY + fadeTravel, baseline), MOBILE_HERO_COPY_EXIT_SCALE)
  near(mobileHeroCopyScale(motionStartY + fadeTravel * 2, baseline), MOBILE_HERO_COPY_EXIT_SCALE)
  // Both movement and opacity begin after the same threshold, independent of morph.
  assert.ok(mobileHeroCopyTranslation(motionStartY + 1, baseline) > 0)
  assert.ok(mobileHeroCopyOpacity(motionStartY + 1, baseline) < 1)
  const progress = Array.from({ length: 101 }, (_, index) => index / 100)
  const opacityAt = p => mobileHeroCopyOpacity(motionStartY + p * fadeTravel, baseline)
  const forward = progress.map(opacityAt)
  const reverse = [...progress].reverse().map(opacityAt).reverse()
  assert.deepEqual(forward, reverse)
  for (let index = 1; index < forward.length; index++) {
    assert.ok(forward[index] <= forward[index - 1])
  }
  const scaleAt = p => mobileHeroCopyScale(motionStartY + p * fadeTravel, baseline)
  const scales = progress.map(scaleAt)
  assert.deepEqual(scales, [...progress].reverse().map(scaleAt).reverse())
  for (let index = 1; index < scales.length; index++) {
    assert.ok(scales[index] <= scales[index - 1])
  }
  console.log('Mobile Hero copy motion: static recapture, page-top start, pacing and reversibility passed.')
} finally {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
}
