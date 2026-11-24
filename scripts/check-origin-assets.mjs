import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const root = resolve(process.argv[2] || '.output/public')
let checked = 0
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await inspect(path)
    else if (entry.isFile() && ['.html', '.js', '.css', '.json'].includes(extname(path))) {
      const text = await readFile(path, 'utf8')
      assert.doesNotMatch(text, /(?:https?:)?\/\/(?:[^/\s"'\\]+\.)?twcstorage\.ru\b/i, `Timeweb URL remains in ${path}`)
      const assetUrls = text.matchAll(/(?:https?:)?\/\/([^/\s"'\\<>]+)\/(?:_nuxt|fonts|brand|env|home|images|og|previews|svg|textures)\//g)
      for (const [, host] of assetUrls) {
        assert.equal(host, 'kadonext.com', `External static asset host ${host} in ${path}`)
      }
      checked++
    }
  }
}
await inspect(root)
for (const locale of ['ru', 'en']) {
  const html = await readFile(join(root, locale, 'index.html'), 'utf8')
  assert.match(html, /<script\b[^>]*\bsrc=["'](?:https:\/\/kadonext\.com)?\/_nuxt\//, `${locale}: Nuxt entry must use kadonext.com`)
  assert.match(html, /\/fonts\/fixel\/FixelCritical\.woff2/, `${locale}: missing critical font`)
}
console.log(`Origin delivery passed: ${checked} runtime files checked, no Timeweb asset URLs, RU/EN entries use the site origin.`)
