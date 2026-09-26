import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const outputRoot = resolve(process.cwd(), '.output/public')
const modulePreloadPattern = /<link\s+rel="modulepreload"[^>]*>\s*/g
const asyncPrefetchPattern = /<link\s+rel="prefetch"\s+as="(?:script|style)"[^>]*>\s*/g
// The initial page already contains Nuxt's inline payload. Keeping its
// fetch-preload makes Chromium report an unused preload; route navigation can
// still request the payload on demand.
const payloadPreloadPattern = /<link\s+rel="preload"\s+as="fetch"[^>]*href="[^"]*\/_payload\.json[^\"]*"[^>]*>\s*/g
const criticalStylesheetPattern = /<link\s+rel="stylesheet"\s+href="([^"]*\/_nuxt\/(?:entry|navWaveHover|SiteIcon|LanguageSwitch|useFooterPhotoRubberBand)\.[^"/]+\.css)"[^>]*>\s*/g
const cssUrlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
let optimized = 0
let removed = 0
let removedPrefetches = 0
let removedPayloadPreloads = 0
let inlined = 0

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
    if (/^(?:[a-z]+:|\/\/|#)/i.test(url)) return match
    const resolved = new URL(url, stylesheetUrl)
    const resolvedUrl = stylesheetUrl.hostname === 'kadonext.invalid'
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : resolved.href
    return `url(${quote}${resolvedUrl}${quote})`
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
    const prefetchMatches = source.match(asyncPrefetchPattern)
    const payloadPreloadMatches = source.match(payloadPreloadPattern)
    let result = source
      .replace(modulePreloadPattern, '')
      .replace(asyncPrefetchPattern, '')
      .replace(payloadPreloadPattern, '')
    // Nuxt's static fallbacks are not content pages and must never enter search.
    if (directory === outputRoot && ['200.html', '404.html'].includes(entry.name)) {
      result = result.replace(/<meta\b(?=[^>]*\bname="robots")[^>]*>\s*/g, '')
        .replace('</head>', '<meta name="robots" content="noindex, follow"></head>')
    }
    const stylesheetMatches = [...result.matchAll(criticalStylesheetPattern)]
    for (const match of stylesheetMatches) {
      const stylesheetPath = new URL(match[1], 'https://kadonext.invalid').pathname
      const css = rootRelativeCssUrls(
        await readFile(join(outputRoot, stylesheetPath.slice(1)), 'utf8'),
        match[1],
      )
      result = result.replace(match[0], `<style data-critical-css>${css}</style>`)
      inlined += 1
    }
    if (result === source) return
    const bytes = Buffer.from(result)
    await writeCompressed(path, bytes)
    optimized += 1
    removed += matches?.length ?? 0
    removedPrefetches += prefetchMatches?.length ?? 0
    removedPayloadPreloads += payloadPreloadMatches?.length ?? 0
  }))
}

await visit(outputRoot)
console.log(`Optimized ${optimized} prerendered HTML files; removed ${removed} modulepreloads, ${removedPrefetches} async prefetches and ${removedPayloadPreloads} payload preloads; inlined ${inlined} critical stylesheets.`)
