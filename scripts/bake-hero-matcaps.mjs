/**
 * Bake the mobile swarm's view-space lighting from the full-resolution studio
 * HDR and physical desktop finishes. The source HDR stays local; only small
 * WebP matcaps ship with the site.
 *
 * Run: node scripts/bake-hero-matcaps.mjs
 */
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'assets/source-media/env/studio_small_09_2k.hdr')
const output = resolve(root, 'public/textures')
const bakeCode = `
import {
  ACESFilmicToneMapping, Color, DirectionalLight, FloatType,
  HemisphereLight, Mesh, MeshPhysicalMaterial, OrthographicCamera,
  PMREMGenerator, Scene, SphereGeometry, SRGBColorSpace, WebGLRenderer,
} from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setSize(512, 512)
renderer.setPixelRatio(1)
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = 0.92
renderer.setClearColor(0x000000, 0)
document.body.appendChild(renderer.domElement)

const source = await new HDRLoader().setDataType(FloatType).loadAsync('/source.hdr')
const pixels = source.image.data
for (let i = 0; i < pixels.length; i += 4) {
  const energy = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
  const t = Math.min(1, Math.max(0, (energy - 0.65) / 2.6))
  const preserve = t * t * (3 - 2 * t)
  const exposure = 0.16 + 0.84 * preserve
  pixels[i] *= exposure
  pixels[i + 1] *= exposure
  pixels[i + 2] *= exposure
}
source.needsUpdate = true
const pmrem = new PMREMGenerator(renderer)
const environment = pmrem.fromEquirectangular(source).texture
source.dispose()
pmrem.dispose()

const scene = new Scene()
scene.environment = environment
const hemi = new HemisphereLight(0xd9d8d2, 0x171717, 0.12)
const key = new DirectionalLight(0xffffff, 0.55)
key.position.set(3.8, 5.2, 4.5)
const fill = new DirectionalLight(0xa7aaa5, 0.12)
fill.position.set(-4.5, 1.2, 2.8)
scene.add(hemi, key, fill)
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
camera.position.set(0, 0, 4)
camera.lookAt(0, 0, 0)
const mesh = new Mesh(new SphereGeometry(1, 128, 96))
scene.add(mesh)

const white = new Color('#f8f7f2')
const black = new Color('#171815')
const finishes = {
  'white-matte': new MeshPhysicalMaterial({
    color: white, roughness: 0.8, metalness: 0.02,
    clearcoat: 0.18, clearcoatRoughness: 0.55,
    sheen: 0.32, sheenRoughness: 0.72, sheenColor: new Color('#e3e0d8'),
    envMapIntensity: 0.9, specularIntensity: 0.55,
  }),
  'white-soft': new MeshPhysicalMaterial({
    color: white, roughness: 0.39, metalness: 0,
    clearcoat: 0.42, clearcoatRoughness: 0.3,
    sheen: 0.22, sheenRoughness: 0.58, sheenColor: new Color('#e9e5dc'),
    envMapIntensity: 1.05, specularIntensity: 0.7,
  }),
  'white-frosted': new MeshPhysicalMaterial({
    color: white, roughness: 0.38, metalness: 0,
    transmission: 0.84, thickness: 1.6, ior: 1.42,
    attenuationColor: new Color('#e3e0d8'), attenuationDistance: 1.6,
    clearcoat: 0.5, clearcoatRoughness: 0.27,
    envMapIntensity: 1.2,
  }),
  'black-gloss': new MeshPhysicalMaterial({
    color: black, roughness: 0.14, metalness: 0.08,
    clearcoat: 0.68, clearcoatRoughness: 0.1,
    envMapIntensity: 1.16, specularIntensity: 0.86, ior: 1.45,
  }),
  'black-matte': new MeshPhysicalMaterial({
    color: black, roughness: 0.8, metalness: 0.02,
    clearcoat: 0.14, clearcoatRoughness: 0.6,
    sheen: 0.32, sheenRoughness: 0.7, sheenColor: new Color('#51534d'),
    envMapIntensity: 0.86, specularIntensity: 0.55,
  }),
}
window.bakedMatcaps = {}
for (const [name, material] of Object.entries(finishes)) {
  scene.background = name === 'white-frosted' ? new Color('#363e2f') : null
  mesh.material = material
  renderer.render(scene, camera)
  window.bakedMatcaps[name] = renderer.domElement.toDataURL('image/png')
  material.dispose()
}
mesh.geometry.dispose()
environment.dispose()
renderer.dispose()
window.bakeFinished = true
`

const bundle = await build({
  stdin: { contents: bakeCode, resolveDir: root, sourcefile: 'bake-hero-matcaps.client.js' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  logLevel: 'silent',
})
const hdr = await readFile(source)
const server = createServer((request, response) => {
  if (request.url === '/source.hdr') {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end(hdr)
  }
  else if (request.url === '/bake.js') {
    response.writeHead(200, { 'content-type': 'text/javascript' })
    response.end(bundle.outputFiles[0].contents)
  }
  else {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<!doctype html><script type="module" src="/bake.js"></script>')
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

let browser
try {
  browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=default'],
  })
  const page = await browser.newPage()
  page.on('pageerror', error => console.error(error))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.bakeFinished, null, { timeout: 30000 })
  const matcaps = await page.evaluate(() => window.bakedMatcaps)
  for (const [name, dataUrl] of Object.entries(matcaps)) {
    const png = Buffer.from(dataUrl.split(',')[1], 'base64')
    const webp = await sharp(png).resize(256, 256).webp({ quality: 88, effort: 6 }).toBuffer()
    const path = resolve(output, `hero-matcap-${name}.webp`)
    await writeFile(path, webp)
    console.log(`${name}: ${webp.length} bytes`)
  }
}
finally {
  await browser?.close()
  server.close()
}
