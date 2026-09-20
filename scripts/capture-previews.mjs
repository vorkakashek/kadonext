/**
 * Capture color + baked grayscale viewport shots for Page Canvas tiles.
 *
 * Usage (dev server already running):
 *   node scripts/capture-previews.mjs
 *   node scripts/capture-previews.mjs --bw-only   (bake *-bw.jpg from existing color shots)
 *   node scripts/capture-previews.mjs --mobile    (phone shots only)
 *   node scripts/capture-previews.mjs --desktop   (desktop shots only)
 *   node scripts/capture-previews.mjs --pages=about,contact (selected sections only)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'previews')
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')))
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const bwOnly = flags.has('--bw-only')
const wantDesktop = !flags.has('--mobile')
const wantMobile = !flags.has('--desktop')
const base = (args[0] || 'http://localhost:3000').replace(/\/+$/, '')

const allPages = [
  { id: 'home', path: '/', selector: '.hero-swarm canvas' },
  { id: 'projects', path: '/projects', selector: '.projects-catalog__title' },
  { id: 'services', path: '/#services', selector: '#services' },
  { id: 'about', path: '/#about', selector: '#about' },
  { id: 'contact', path: '/#contact', selector: '#contact' },
]

const pageFilter = [...flags].find((flag) => flag.startsWith('--pages='))
const selectedIds = pageFilter?.slice('--pages='.length).split(',').filter(Boolean)
if (selectedIds && (!selectedIds.length || selectedIds.some((id) => !allPages.some((page) => page.id === id)))) {
  throw new Error(`--pages must contain IDs from: ${allPages.map((page) => page.id).join(', ')}`)
}
const pages = selectedIds ? allPages.filter((page) => selectedIds.includes(page.id)) : allPages

const DESK = { width: 1440, height: 900, suffix: '', mobile: false }
const PHONE = { width: 390, height: 844, suffix: '-m', mobile: true }

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const { chromium } = await import('playwright-core')

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
})

await mkdir(outDir, { recursive: true })

async function writeBwFromColor(page, id, colorBuf, viewport, suffix) {
  const b64 = Buffer.from(colorBuf).toString('base64')
  const { width: w, height: h } = viewport
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<!doctype html>
<html><head><style>
  html,body{margin:0;width:${w}px;height:${h}px;background:#111;overflow:hidden}
  img{width:${w}px;height:${h}px;object-fit:cover;filter:grayscale(1)}
</style></head>
<body><img src="data:image/jpeg;base64,${b64}" alt=""></body></html>`)
  await page.waitForTimeout(80)
  const bwBuf = await page.screenshot({ type: 'jpeg', quality: 84, fullPage: false })
  const bwFile = path.join(outDir, `${id}${suffix}-bw.jpg`)
  await writeFile(bwFile, bwBuf)
  console.log(`  wrote ${path.relative(root, bwFile)} (${bwBuf.length} bytes)`)
}

function colorName(id, suffix) {
  return `${id}${suffix}.jpg`
}

if (bwOnly) {
  const page = await (await browser.newContext()).newPage()
  const jobs = []
  if (wantDesktop) jobs.push(DESK)
  if (wantMobile) jobs.push(PHONE)
  for (const spec of jobs) {
    for (const item of pages) {
      const colorFile = path.join(outDir, colorName(item.id, spec.suffix))
      console.log(`bw from ${colorName(item.id, spec.suffix)}`)
      const buf = await readFile(colorFile)
      await writeBwFromColor(page, item.id, buf, spec, spec.suffix)
    }
  }
  await browser.close()
  console.log('done')
  process.exit(0)
}

async function capturePass(spec) {
  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    deviceScaleFactor: 1,
    isMobile: spec.mobile,
    hasTouch: spec.mobile,
    userAgent: spec.mobile ? IPHONE_UA : undefined,
  })
  await context.addInitScript(() => {
    localStorage.setItem('kadonext-preload-seen', '1')
  })

  for (const item of pages) {
    // Grayscale baking replaces the document. Start each route in a new tab
    // so another home hash cannot navigate within that temporary image page.
    const page = await context.newPage()
    const url = `${base}${item.path}`
    console.log(`capturing ${item.id}${spec.suffix} ← ${url} (${spec.width}×${spec.height})`)
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await page.addStyleTag({
      content: `
        .fps-meter { display: none !important; }
        .brand-preload { display: none !important; visibility: hidden !important; }
        html.preload-lock,
        html.preload-lock body { overflow: auto !important; }
      `,
    })
    await page
      .waitForFunction(
        () => !document.documentElement.classList.contains('preload-lock'),
        null,
        { timeout: 20_000 },
      )
    await page.waitForSelector(item.selector, { timeout: 20_000 })
    await page.evaluate(() => document.fonts.ready)
    // Let route alignment, Surface boot and entrance motion finish naturally.
    await page.waitForTimeout(4500)
    if (item.path.includes('#')) {
      // Initial hash alignment can run before the home layout has settled.
      // Use the same anchor positioning contract as navigation, including the
      // desktop contact offset and mobile Cases tail collapse.
      await page.evaluate((selector) => {
        const target = document.querySelector(selector)
        const nuxt = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
        if (!target) throw new Error(`Missing preview section: ${selector}`)
        if (nuxt?.$scrollToSection) nuxt.$scrollToSection(target, true)
        else target.scrollIntoView({ behavior: 'instant', block: 'start' })
      }, item.selector)
      await page.waitForTimeout(4500)
      await page.waitForFunction((selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect()
        return rect && rect.top < window.innerHeight && rect.bottom > 0
      }, item.selector, { timeout: 20_000 })
    }
    await page.waitForFunction(() => [...document.images].every((image) => {
      const rect = image.getBoundingClientRect()
      const visible = !!image.currentSrc
        && image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        && rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.top < window.innerHeight
      return !visible || (image.complete && image.naturalWidth > 0)
    }), null, { timeout: 20_000 })
    const buf = await page.screenshot({ type: 'jpeg', quality: 84, fullPage: false })
    const colorFile = path.join(outDir, colorName(item.id, spec.suffix))
    await writeFile(colorFile, buf)
    console.log(`  wrote ${path.relative(root, colorFile)} (${buf.length} bytes)`)
    await writeBwFromColor(page, item.id, buf, spec, spec.suffix)
    await page.close()
  }

  await context.close()
}

if (wantDesktop) await capturePass(DESK)
if (wantMobile) await capturePass(PHONE)

await browser.close()
console.log('done')
