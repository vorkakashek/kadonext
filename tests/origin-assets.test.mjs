import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

function check(t, { entry = '/_nuxt/entry.js', hiddenCdn = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kado-origin-check-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const locale of ['ru', 'en']) {
    mkdirSync(join(root, locale))
    writeFileSync(join(root, locale, 'index.html'), `<script src="${entry}"></script><style>@font-face{src:url('/fonts/fixel/FixelCritical.woff2')}</style>`)
  }
  if (hiddenCdn) {
    mkdirSync(join(root, '_nuxt'))
    writeFileSync(join(root, '_nuxt', 'lazy.js'), 'const image="https://nfb4tt2jyb.cdn.twcstorage.ru/home/image.webp"')
  }
  return spawnSync(process.execPath, ['scripts/check-origin-assets.mjs', root], { encoding: 'utf8' })
}

test('origin validation accepts local Nuxt entry points', t => {
  const result = check(t)
  assert.equal(result.status, 0, result.stderr)
})

test('origin validation rejects a CDN reference hidden in a lazy chunk', t => {
  const result = check(t, { hiddenCdn: true })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Timeweb URL remains/)
})

test('origin validation rejects an entry point on another host', t => {
  const result = check(t, { entry: 'https://another.example/_nuxt/entry.js' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /External static asset host/)
})
