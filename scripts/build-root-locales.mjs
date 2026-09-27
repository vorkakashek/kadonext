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
    const payloadRootIndex = Array.isArray(data[0])
      && data[0][0] === 'ShallowReactive'
      && Number.isInteger(data[0][1])
      ? data[0][1]
      : 0
    const pathIndex = data[payloadRootIndex]?.path
    if (!Number.isInteger(pathIndex)) {
      throw new Error(`Unexpected Nuxt payload path for /${locale}/`)
    }
    const payloadPath = data[pathIndex]
    if (payloadPath === `/${locale}/`) data[pathIndex] = '/'
    else if (payloadPath !== '/') {
      throw new Error(`Unexpected Nuxt payload path for /${locale}/`)
    }
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

  // The root response is the negotiated x-default page. Keep its social
  // metadata and structured data aligned with the canonical link above;
  // localized /ru/ and /en/ pages must retain their own URLs.
  const localizedRootUrl = `https://kadonext.com/${locale}/`
  const rootUrl = 'https://kadonext.com/'
  const rootSeoHtml = rootCanonicalHtml
    .replace(
      `<meta property="og:url" content="${localizedRootUrl}">`,
      `<meta property="og:url" content="${rootUrl}">`,
    )
    .replace(
      /(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g,
      (_match, open, json, close) => `${open}${json.replaceAll(localizedRootUrl, rootUrl)}${close}`,
    )

  if (!rootSeoHtml.includes(`<meta property="og:url" content="${rootUrl}">`)) {
    throw new Error(`Missing root og:url for /${locale}/ root source`)
  }

  const target = join(outputDirectory, `${locale}.html`)
  const bytes = Buffer.from(rootSeoHtml)
  await Promise.all([
    writeFile(target, bytes),
    writeFile(`${target}.gz`, gzipSync(bytes, { level: 9 })),
    writeFile(`${target}.br`, brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    })),
  ])
}

console.log('Generated locale-selected root HTML for ru and en.')
