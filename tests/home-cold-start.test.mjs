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

test('the cold surface corridor never boots inside the first desktop wheel input', () => {
  const source = readComponent('FlowSurfaceHost')
  const scheduleStart = source.indexOf('function scheduleColdMotionBoot()')
  const scheduleEnd = source.indexOf('/** Mobile corridor state */', scheduleStart)
  const schedule = source.slice(scheduleStart, scheduleEnd)

  assert.match(schedule, /motionBootTimer = window\.setTimeout/)
  assert.match(schedule, /void bootMotionEngine\(\)[\s\S]*?, 160\)/)
  assert.doesNotMatch(schedule, /(?:window\.)?requestIdleCallback\s*\(/)
  assert.doesNotMatch(schedule, /addEventListener\(['"]wheel['"]/)
})

test('the mobile cold scene moves WebGL startup off the main thread', () => {
  const stage = readComponent('HomeHeroStage')
  const workerHost = readComponent('HeroSwarmWorkerCanvas')
  const worker = readFileSync(
    new URL('../app/workers/heroSwarm.worker.ts', import.meta.url),
    'utf8',
  )
  const support = readFileSync(
    new URL('../app/utils/heroWorkerSupport.ts', import.meta.url),
    'utf8',
  )

  assert.match(stage, /workerRendererReady\.value = mobileLite\.value && supportsHeroWorkerRenderer\(\)/)
  assert.match(stage, /if \(!workerRendererReady\.value\) void preloadThreeBundle\(\)/)
  assert.match(stage, /<LazyHeroSwarmWorkerCanvas[\s\S]*?v-if="swarmMount && workerRendererReady"/)
  assert.match(stage, /@failed="onWorkerRendererFailed"/)
  assert.match(workerHost, /transferControlToOffscreen\(\)/)
  assert.match(workerHost, /if \(event\.data\.type === 'error'\) fail\(\)/)
  assert.match(workerHost, /heroSwarm\.worker\.ts\?worker&url/)
  assert.match(workerHost, /new URL\(heroSwarmWorkerUrl, window\.location\.href\)/)
  assert.match(workerHost, /window\.location\.origin/)
  assert.match(workerHost, /new Worker\(sameOriginWorkerUrl, \{ type: 'module' \}\)/)
  assert.match(workerHost, /try \{\s*worker = new Worker[\s\S]*?\} catch \{\s*fail\(\)/)
  assert.doesNotMatch(workerHost, /new Worker\(new URL\('\.\.\/workers\/heroSwarm\.worker\.ts'/)
  assert.match(worker, /new Renderer\(\{[\s\S]*?canvas: message\.canvas/)
  assert.match(worker, /from 'ogl'/)
  assert.doesNotMatch(worker, /from 'three'/)
  assert.match(support, /typeof HTMLCanvasElement\.prototype\.transferControlToOffscreen === 'function'/)
})

test('critical app assets and public media share the configured CDN', () => {
  const source = readFileSync(
    new URL('../nuxt.config.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /assetCdnUrl: publicAssetCdnUrl/)
  assert.match(source, /cdnURL: appAssetCdnUrl/)
  assert.match(source, /process\.env\.KADO_APP_ASSET_CDN_URL \?\? publicAssetCdnUrl/)
  assert.match(source, /href: fontAssetUrl\('FixelCritical\.woff2'\)/)
})
