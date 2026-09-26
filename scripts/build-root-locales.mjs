import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const publicRoot = resolve('.output/public')
const outputDirectory = join(publicRoot, '.locale-root')
const nuxtDataPattern = /(<script type="application\/json" data-nuxt-data[^>]*>)([\s\S]*?)(<\/script>)/

await mkdir(outputDirectory, { recursive: true })

for (const locale of ['ru', 'en']) {
  const source = await readFile(join(publicRoot, locale, 'index.html'), 'utf8')
  let replaced = false
  const rootHtml = source.replace(nuxtDataPattern, (_match, open, json, close) => {
    const data = JSON.parse(json)
    const pathIndex = data[0]?.path
    if (!Number.isInteger(pathIndex) || data[pathIndex] !== `/${locale}/`) {
      throw new Error(`Unexpected Nuxt payload path for /${locale}/`)
    }
    data[pathIndex] = '/'
    replaced = true
    return `${open}${JSON.stringify(data)}${close}`
  })
  if (!replaced) throw new Error(`Missing Nuxt payload in /${locale}/`)

  // The negotiated root is its own x-default URL. The copied localized page
  // must not keep /ru/ or /en/ as canonical once served at /.
  const localizedCanonical = `<link rel="canonical" href="https://kadonext.com/${locale}/"`
  if (!rootHtml.includes(localizedCanonical)) {
    throw new Error(`Missing localized canonical in /${locale}/ root source`)
  }
  const rootCanonicalHtml = rootHtml.replace(
    localizedCanonical,
    '<link rel="canonical" href="https://kadonext.com/"',
  )

  const target = join(outputDirectory, `${locale}.html`)
  const bytes = Buffer.from(rootCanonicalHtml)
  await Promise.all([
    writeFile(target, bytes),
    writeFile(`${target}.gz`, gzipSync(bytes, { level: 9 })),
    writeFile(`${target}.br`, brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    })),
  ])
}

console.log('Generated locale-selected root HTML for ru and en.')
