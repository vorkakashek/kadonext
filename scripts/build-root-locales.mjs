import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const publicRoot = resolve('.output/public')
const nuxtDataPattern = /(<script type="application\/json" data-nuxt-data[^>]*>)([\s\S]*?)(<\/script>)/

const source = await readFile(join(publicRoot, 'ru', 'index.html'), 'utf8')
if (!nuxtDataPattern.test(source)) {
  throw new Error('Missing localized Nuxt output before generating the root selector')
}

// `/` must be cacheable without varying on cookies or Accept-Language. Keep
// the language choice in a tiny static document and let the real localized
// pages carry all SEO/content payload. The inline redirect runs before any
// render; the links remain a useful no-JS fallback.
const selector = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, follow">
  <meta name="theme-color" content="#ece7dd">
  <title>KADO — select language</title>
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
    <strong>KADO</strong>
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
