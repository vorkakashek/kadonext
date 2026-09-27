import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const readComponent = name => readFileSync(
  new URL(`../app/components/${name}.vue`, import.meta.url),
  'utf8',
)

test('mobile cold entry starts WebGL early without holding primary copy behind it', () => {
  const source = readComponent('HomeHeroStage')

  assert.match(
    source,
    /if \(plainColdHome && !constrained\) \{[\s\S]*?void preloadThreeBundle\(\)[\s\S]*?requestAnimationFrame\(mount\)/,
    'the cold scene should keep its eager progressive upgrade',
  )
  assert.match(
    source,
    /const waitForPlainScene = plainColdHome\s*&& !mobileLite\.value\s*&& !connection\?\.saveData/,
    'only desktop may hold the copy for a fully lit scene',
  )
  assert.match(source, /const plainSceneWaiting = waitForPlainScene && !sceneLit/)
})

test('the prerendered cookie notice never waits for a CDN font before painting', () => {
  const source = readComponent('CookieNotice')

  assert.doesNotMatch(source, /document\.fonts\.load/)
  assert.doesNotMatch(source, /cookie-notice--font-pending/)
  assert.match(source, /class="cookie-notice pointer-events-auto"/)
})

test('the swarm never renders a throwaway material state before final scene warmup', () => {
  const source = readComponent('HeroSwarmCanvas')
  const finalSetup = source.slice(source.indexOf('runFrame = tick'), source.indexOf('</script>'))

  assert.match(source, /if \(!sceneRenderReady \|\| !runFrame \|\| loopRunning \|\| !renderer\) return/)
  assert.match(source, /litEmitted = true\s*sceneRenderReady = true/)
  assert.match(source, /if \(sceneRenderReady && props\.active\) renderer\.render\(scene, camera\)/)
  assert.doesNotMatch(finalSetup, /(?:gl|renderer)\.render\(/)
})

test('the mobile swarm uses one narrow matcap shader and one covered warm frame', () => {
  const source = readComponent('HeroSwarmCanvas')

  assert.doesNotMatch(source, /new MeshMatcapMaterial/)
  assert.match(source, /new ShaderMaterial\(\{[\s\S]*?MOBILE_MATCAP_VERTEX_SHADER[\s\S]*?MOBILE_MATCAP_FRAGMENT_SHADER/)
  assert.match(source, /gl\.render\(scene, camera\)\s*await nextPaint\(\)\s*if \(!lite\) \{/)
  assert.match(source, /animationId = requestAnimationFrame\(\(now\) => \{/)
})

test('the cold scene evaluates Three before the async Vue scene mounts', () => {
  const source = readFileSync(
    new URL('../app/utils/preloadHomeMotion.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /threeWarm = import\('three'\)\.then\(\(\) => undefined\)/)
  assert.doesNotMatch(source, /threeWarm = import\('~\/components\/HeroSwarmCanvas\.vue'\)/)
})

test('critical app assets stay same-origin while public media keeps the CDN', () => {
  const source = readFileSync(
    new URL('../nuxt.config.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /assetCdnUrl: publicAssetCdnUrl/)
  assert.match(source, /cdnURL: appAssetCdnUrl/)
  assert.match(source, /href: `\$\{appAssetCdnUrl\}\/fonts\/fixel\/FixelCritical\.woff2`/)
})
