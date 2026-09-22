import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const outputRoot = resolve(process.cwd(), '.output/public')
const modulePreloadPattern = /<link\s+rel="modulepreload"[^>]*>\s*/g
const criticalStylesheetPattern = /<link\s+rel="stylesheet"\s+href="(\/_nuxt\/(?:entry\.[^"]+|navWaveHover\.[^"]+)\.css)"[^>]*>\s*/g
const grainPreloadPattern = /<link\s+rel="preload"\s+as="image"\s+href="\/textures\/grain-tile-v2-256\.avif"[^>]*>\s*/g
const grainUrlPattern = /url\((['"]?)(?:\/|\.\.\/)textures\/grain-tile-v2-256\.avif\1\)/g
const cssUrlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
const grainBytes = await readFile(join(outputRoot, 'textures/grain-tile-v2-256.avif'))
const grainDataUrl = `data:image/avif;base64,${grainBytes.toString('base64')}`
let optimized = 0
let removed = 0
let inlined = 0
let embeddedGrainStyles = 0

async function writeCompressed(path, bytes) {
  await Promise.all([
    writeFile(path, bytes),
    writeFile(`${path}.gz`, gzipSync(bytes, { level: 9 })),
    writeFile(
      `${path}.br`,
      brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }),
    ),
  ])
}

function rootRelativeCssUrls(css, stylesheetHref) {
  const stylesheetUrl = new URL(stylesheetHref, 'https://kadonext.invalid')
  return css.replace(cssUrlPattern, (match, quote, value) => {
    const url = value.trim()
    if (/^(?:[a-z]+:|\/\/|\/|#)/i.test(url)) return match
    const resolved = new URL(url, stylesheetUrl)
    return `url(${quote}${resolved.pathname}${resolved.search}${resolved.hash}${quote})`
  })
}

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return visit(path)
    if (extname(entry.name) !== '.html') return

    const source = await readFile(path, 'utf8')
    const matches = source.match(modulePreloadPattern)
    let result = source.replace(modulePreloadPattern, '')
    // Nuxt's static fallbacks are not content pages and must never enter search.
    if (directory === outputRoot && ['200.html', '404.html'].includes(entry.name)) {
      result = result.replace(/<meta\b(?=[^>]*\bname="robots")[^>]*>\s*/g, '')
        .replace('</head>', '<meta name="robots" content="noindex, follow"></head>')
    }
    const stylesheetMatches = [...result.matchAll(criticalStylesheetPattern)]
    for (const match of stylesheetMatches) {
      const css = rootRelativeCssUrls(
        await readFile(join(outputRoot, match[1].slice(1)), 'utf8'),
        match[1],
      )
      result = result.replace(match[0], `<style data-critical-css>${css}</style>`)
      inlined += 1
    }
    result = result
      .replace(grainPreloadPattern, '')
      .replace(grainUrlPattern, `url(${grainDataUrl})`)
    if (result === source) return
    const bytes = Buffer.from(result)
    await writeCompressed(path, bytes)
    optimized += 1
    removed += matches?.length ?? 0
  }))
}

const assetEntries = await readdir(join(outputRoot, '_nuxt'), { withFileTypes: true })
await Promise.all(assetEntries.map(async (entry) => {
  if (!entry.isFile() || extname(entry.name) !== '.css') return
  const path = join(outputRoot, '_nuxt', entry.name)
  const source = await readFile(path, 'utf8')
  const result = source.replace(grainUrlPattern, `url(${grainDataUrl})`)
  if (result === source) return
  await writeCompressed(path, Buffer.from(result))
  embeddedGrainStyles += 1
}))

await visit(outputRoot)
console.log(`Optimized ${optimized} prerendered HTML files; removed ${removed} modulepreloads; inlined ${inlined} critical stylesheets; embedded grain in ${embeddedGrainStyles} CSS assets.`)
