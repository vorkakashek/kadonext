import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('the moving KADO waypoint has no independent scrub tail', () => {
  const source = readFileSync(
    new URL('../app/components/HomeKado.vue', import.meta.url),
    'utf8',
  )
  const stoneTween = source.match(
    /gsap\.fromTo\(\s*stoneColumn,[\s\S]*?const termTimeline/,
  )?.[0]

  assert.ok(stoneTween, 'the KADO stone-column tween must remain present')
  assert.match(stoneTween, /scrub:\s*true/)
  assert.doesNotMatch(stoneTween, /scrub:\s*[0-9.]+/)
})
