import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const publicRoot = resolve('.output/public')
const nuxtDataPattern = /(<script type="application\/json" data-nuxt-data[^>]*>)([\s\S]*?)(<\/script>)/

const source = await readFile(join(publicRoot, 'en', 'index.html'), 'utf8')
if (!nuxtDataPattern.test(source)) {
  throw new Error('Missing localized Nuxt output before generating the root selector')
}

const head = source.match(/<head>([\s\S]*?)<\/head>/i)?.[1]
if (!head) throw new Error('Missing English document head before generating the root selector')

const attributes = tag => Object.fromEntries(
  [...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(match => [match[1], match[2]]),
)
const headTags = [...head.matchAll(/<(?:meta|link)\b[^>]*>/gi)].map(match => match[0])
const metaKeys = [
  'description',
  'og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description', 'og:url',
  'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt',
  'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt',
]
const socialTags = metaKeys.map((key) => {
  const tag = headTags.find((candidate) => {
    const attrs = attributes(candidate)
    return attrs.name === key || attrs.property === key
  })
  if (!tag) throw new Error(`Missing ${key} in the English document head`)
  return tag
})
const canonical = headTags.find((tag) => attributes(tag).rel === 'canonical')
if (!canonical) throw new Error('Missing canonical link in the English document head')
const title = head.match(/<title>[\s\S]*?<\/title>/i)?.[0]
if (!title) throw new Error('Missing title in the English document head')

// `/` must be cacheable without varying on cookies or Accept-Language. Keep
// the language choice in a tiny static document, but mirror the English home
// metadata so social crawlers receive a complete card without running JS.
// The inline redirect runs before any render; the links remain a no-JS fallback.
const selector = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, follow">
  <meta name="theme-color" content="#ece7dd">
  ${title}
  ${socialTags.join('\n  ')}
  ${canonical}
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <script>
    (function () {
      try {
        var cookie = document.cookie.match(/(?:^|; )kadonext-locale=(ru|en)(?:;|$)/)
        var stored = localStorage.getItem('kadonext-locale')
        var browser = (navigator.languages && navigator.languages[0]) || navigator.language || ''
        var locale = cookie ? cookie[1] : (stored === 'ru' || stored === 'en' ? stored : (/^ru(?:-|$)/i.test(browser) ? 'ru' : 'en'))
        document.cookie = 'kadonext-locale=' + locale + '; Path=/; Max-Age=31536000; SameSite=Lax'
        document.cookie = 'kadonext-root-locale=' + locale + '; Path=/; Max-Age=31536000; SameSite=Lax'
        localStorage.setItem('kadonext-locale', locale)
        location.replace('/' + locale + '/' + location.search + location.hash)
      } catch (error) {}
    }())
  </script>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; background: #ece7dd; color: #181818; }
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; }
    main { display: grid; gap: 1.5rem; padding: 2rem; text-align: center; }
    nav { display: flex; gap: 1rem; justify-content: center; }
    a { color: inherit; text-underline-offset: .2em; }
  </style>
</head>
<body data-kado-locale-selector>
  <main>
    <h1>KADO</h1>
    <nav aria-label="Language"><a href="/ru/">Русский</a><a href="/en/">English</a></nav>
  </main>
</body>
</html>
`
const bytes = Buffer.from(selector)
await Promise.all([
  writeFile(join(publicRoot, 'index.html'), bytes),
  writeFile(join(publicRoot, 'index.html.gz'), gzipSync(bytes, { level: 9 })),
  writeFile(join(publicRoot, 'index.html.br'), brotliCompressSync(bytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  })),
])

console.log(`Generated cacheable root locale selector (${bytes.byteLength} bytes).`)
