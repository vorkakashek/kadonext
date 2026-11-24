import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import test from 'node:test'

test('release migration preserves module imports, namespaces bundles and replaces compressed siblings', t => {
  const root = mkdtempSync(join(tmpdir(), 'kado-migration-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, '_nuxt'))
  const cdn = 'https://nfb4tt2jyb.cdn.twcstorage.ru'
  writeFileSync(join(root, 'index.html'), `<h1>Existing content</h1><script src="${cdn}/_nuxt/entry.js"></script>`)
  writeFileSync(join(root, 'index.html.br'), 'stale')
  writeFileSync(join(root, '_nuxt', 'entry.js'), `import './lazy.js';const cdn="${cdn}";const dir="/_nuxt/"`)
  writeFileSync(join(root, '_nuxt', 'lazy.js'), 'export default 42')
  const result = spawnSync(process.execPath, ['scripts/migrate-static-origin.mjs', root, 'vps-test'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const html = readFileSync(join(root, 'index.html'), 'utf8')
  assert.equal(html, '<h1>Existing content</h1><script src="/_nuxt/vps-test/entry.js"></script>')
  assert.equal(brotliDecompressSync(readFileSync(join(root, 'index.html.br'))).toString(), html)
  assert.equal(gunzipSync(readFileSync(join(root, 'index.html.gz'))).toString(), html)
  assert.equal(readFileSync(join(root, '_nuxt/vps-test/entry.js'), 'utf8'), 'import \'./lazy.js\';const cdn="";const dir="/_nuxt/vps-test/"')
  assert.equal(readFileSync(join(root, '_nuxt/vps-test/lazy.js'), 'utf8'), 'export default 42')
})
