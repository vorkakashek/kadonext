import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('full-site CDN mode keeps public assets same-origin', () => {
  const source = read('nuxt.config.ts')

  assert.match(source, /const fullSiteCdn = process\.env\.KADO_FULL_SITE_CDN === 'true'/)
  assert.match(source, /const publicAssetCdnUrl = fullSiteCdn\s*\? ''/)
  assert.match(source, /const appAssetCdnUrl = fullSiteCdn \? ''/)
  assert.match(source, /assetCdnUrl: publicAssetCdnUrl/)
})

test('root build output is a tiny cache-safe language selector', () => {
  const source = read('scripts/build-root-locales.mjs')

  assert.match(source, /data-kado-locale-selector/)
  assert.match(source, /location\.replace\('\/' \+ locale \+ '\/'/)
  assert.match(source, /writeFile\(join\(publicRoot, 'index\.html'\)/)
  assert.doesNotMatch(source, /\.locale-root/)
})

test('nginx does not vary the root cache by locale negotiation', () => {
  const source = read('ops/nginx/kadonext.conf')

  assert.match(source, /location = \/ \{[\s\S]*?try_files \$uri \/index\.html;/)
  assert.match(source, /location = \/ \{[\s\S]*?s-maxage=300/)
  assert.doesNotMatch(source, /location = \/ \{[\s\S]*?Vary.*Accept-Language/)
  assert.match(source, /location = \/api\/contact \{[\s\S]*?proxy_pass/)
})

test('production deploy validates localized pages separately from the root selector', () => {
  const source = read('scripts/deploy-production.ps1')

  assert.match(source, /data-kado-locale-selector/)
  assert.match(source, /https:\/\/kadonext\.com\/ru\//)
  assert.match(source, /https:\/\/kadonext\.com\/en\//)
  assert.doesNotMatch(source, /\.locale-root\\ru\.html/)
})
