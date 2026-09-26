import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const outputRoot = resolve(root, '.output/public')
const htmlPath = resolve(outputRoot, 'index.html')
const budgetsPath = resolve(root, 'performance-budgets.json')
const checking = process.argv.includes('--check')

if (!existsSync(htmlPath)) {
  console.error('Production output is missing. Run npm run build first.')
  process.exit(1)
}

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).byteLength
}

function localAssetPath(url) {
  const pathname = /^https?:\/\//i.test(url) ? new URL(url).pathname : url
  return resolve(outputRoot, pathname.replace(/^\//, '').split('?', 1)[0])
}

function normalizeAssetUrl(url, parentUrl = '/') {
  const base = /^https?:\/\//i.test(parentUrl)
    ? parentUrl
    : new URL(parentUrl, 'https://kadonext.local').href
  const resolvedUrl = new URL(url, base)
  return `${resolvedUrl.pathname}${resolvedUrl.search}`
}

function staticModuleImports(source) {
  const imports = []
  const pattern = /\bfrom\s*["']([^"']+)["']|(?:^|[;\n}])\s*import\s*["']([^"']+)["']/g
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1] ?? match[2]
    if (specifier?.startsWith('.') || specifier?.startsWith('/')) imports.push(specifier)
  }
  return imports
}

function collectStaticModuleGraph(entryUrls) {
  const graph = new Set(entryUrls.map(url => normalizeAssetUrl(url)))
  const queue = [...graph]

  while (queue.length) {
    const url = queue.shift()
    const path = localAssetPath(url)
    if (!existsSync(path) || !path.endsWith('.js')) continue

    const source = readFileSync(path, 'utf8')
    for (const specifier of staticModuleImports(source)) {
      const dependencyUrl = normalizeAssetUrl(specifier, url)
      if (!dependencyUrl.endsWith('.js') || graph.has(dependencyUrl)) continue
      graph.add(dependencyUrl)
      queue.push(dependencyUrl)
    }
  }

  return [...graph]
}

const html = readFileSync(htmlPath, 'utf8')
const entryUrls = [...new Set([
  ...Array.from(
    html.matchAll(/<link\s+rel="modulepreload"[^>]+href="([^"]+)"/g),
    (match) => match[1],
  ),
  ...Array.from(
    html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g),
    (match) => match[1],
  ),
  ...Array.from(
    html.matchAll(/const start=\(\)=>import\("([^"]+)"\)/g),
    (match) => match[1],
  ),
  ...Array.from(
    html.matchAll(/const src="([^"]+)";const mobile=/g),
    (match) => match[1],
  ),
])]
const urls = collectStaticModuleGraph(entryUrls)

const rows = []
for (const url of urls) {
  const path = localAssetPath(url)
  const bytes = readFileSync(path).byteLength
  rows.push({
    file: url,
    bytes,
    gzipBytes: gzipSize(path),
  })
}

const totals = rows.reduce(
  (acc, row) => ({
    bytes: acc.bytes + row.bytes,
    gzipBytes: acc.gzipBytes + row.gzipBytes,
  }),
  { bytes: 0, gzipBytes: 0 },
)
const largest = rows.reduce(
  (current, row) => (row.bytes > (current?.bytes ?? -1) ? row : current),
  null,
)
const clientAssetRoot = resolve(outputRoot, '_nuxt')
const clientJsRows = readdirSync(clientAssetRoot)
  .filter(file => file.endsWith('.js'))
  .map((file) => {
    const path = resolve(clientAssetRoot, file)
    return {
      file: `/_nuxt/${file}`,
      bytes: readFileSync(path).byteLength,
      gzipBytes: gzipSize(path),
    }
  })
const largestClientChunk = clientJsRows.reduce(
  (current, row) => (row.bytes > (current?.bytes ?? -1) ? row : current),
  null,
)

const assetUrls = Array.from(
  html.matchAll(/<link\s+rel="(?:stylesheet|preload)"[^>]+href="([^"]+)"/g),
  (match) => match[1],
).filter((url) => !url.startsWith('http'))
assetUrls.push(...Array.from(
  html.matchAll(/url\((?:["']?)([^)"']*\/fonts\/fixel\/FixelCritical\.woff2)(?:["']?)\)/g),
  (match) => match[1],
))
const criticalAssets = []
for (const url of new Set(assetUrls)) {
  const cleanUrl = url.split('?')[0]
  const path = localAssetPath(cleanUrl)
  if (!existsSync(path)) continue
  criticalAssets.push({ url, gzipBytes: gzipSize(path) })
}
const fontRoot = resolve(outputRoot, '_fonts')
const fontBytes = existsSync(fontRoot)
  ? readdirSync(fontRoot).reduce(
      (total, file) => total + readFileSync(resolve(fontRoot, file)).byteLength,
      0,
    )
  : 0
const htmlGzipBytes = gzipSync(Buffer.from(html), { level: 9 }).byteLength
const criticalTransferBytes =
  htmlGzipBytes
  + totals.gzipBytes
  + criticalAssets.reduce((total, asset) => total + asset.gzipBytes, 0)
  + fontBytes

console.table(
  rows.map((row) => ({
    file: row.file,
    minifiedKB: (row.bytes / 1024).toFixed(1),
    gzipKB: (row.gzipBytes / 1024).toFixed(1),
  })),
)
console.log(`Initial JS entries: ${entryUrls.length}`)
console.log(`Initial synchronous JS requests: ${rows.length}`)
console.log(`Initial synchronous JS: ${(totals.bytes / 1024).toFixed(1)} KB minified / ${(totals.gzipBytes / 1024).toFixed(1)} KB gzip`)
console.log(`Largest initial chunk: ${largest ? `${largest.file} (${(largest.bytes / 1024).toFixed(1)} KB)` : 'none'}`)
console.log(`Largest client chunk: ${largestClientChunk ? `${largestClientChunk.file} (${(largestClientChunk.bytes / 1024).toFixed(1)} KB minified / ${(largestClientChunk.gzipBytes / 1024).toFixed(1)} KB gzip)` : 'none'}`)
console.log(`Prerendered HTML: ${(readFileSync(htmlPath).byteLength / 1024).toFixed(1)} KB`)
console.log(`Estimated critical transfer: ${(criticalTransferBytes / 1024).toFixed(1)} KB gzip/WOFF2`)

if (checking) {
  const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'))
  const failures = []
  if (rows.length > budgets.initialJsRequests) {
    failures.push(`initial JS requests ${rows.length} exceeds ${budgets.initialJsRequests}`)
  }
  if (totals.gzipBytes > budgets.criticalJsGzipBytes) {
    failures.push(`initial JS gzip ${totals.gzipBytes} B exceeds ${budgets.criticalJsGzipBytes} B`)
  }
  if (largest && largest.bytes > budgets.largestInitialChunkBytes) {
    failures.push(`largest initial chunk ${largest.bytes} B exceeds ${budgets.largestInitialChunkBytes} B`)
  }
  if (largestClientChunk && largestClientChunk.bytes > budgets.largestClientChunkBytes) {
    failures.push(`largest client chunk ${largestClientChunk.bytes} B exceeds ${budgets.largestClientChunkBytes} B`)
  }
  if (criticalTransferBytes > budgets.criticalTransferBytes) {
    failures.push(
      `estimated critical transfer ${criticalTransferBytes} B exceeds ${budgets.criticalTransferBytes} B`,
    )
  }
  if (
    totals.gzipBytes
    > budgets.baselineCriticalJsGzipBytes + budgets.criticalJsGrowthBytes
  ) {
    failures.push(
      `initial JS grew more than ${budgets.criticalJsGrowthBytes} B over the accepted baseline`,
    )
  }
  if (failures.length) {
    for (const failure of failures) console.error(`Performance budget failed: ${failure}`)
    process.exit(1)
  }
  console.log('Performance budgets passed.')
}
