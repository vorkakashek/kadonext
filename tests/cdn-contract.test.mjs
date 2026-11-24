import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('all production asset classes use the VPS origin', () => {
  const source = read('nuxt.config.ts')
  const envExample = read('.env.example')
  assert.match(source, /cdnURL: ''/)
  assert.match(source, /assetCdnUrl: ''/)
  assert.match(source, /ogCdnUrl: ''/)
  assert.match(source, /fontAssetUrl\('FixelCritical\.woff2'\)/)
  assert.match(source, /innerHTML: fontFacesCss/)
  assert.doesNotMatch(source, /twcstorage|fullSiteCdn|assetOnlyCdn|assetPreconnectUrls/)
  assert.doesNotMatch(envExample, /^\w*CDN\w*=/m)
})

test('root build output is a cache-safe English social card and language selector', () => {
  const source = read('scripts/build-root-locales.mjs')

  assert.match(source, /data-kado-locale-selector/)
  assert.match(source, /location\.replace\('\/' \+ locale \+ '\/'/)
  assert.match(source, /join\(publicRoot, 'en', 'index\.html'\)/)
  assert.match(source, /'og:image'/)
  assert.match(source, /'twitter:card'/)
  assert.doesNotMatch(source, /KADO вЂ” select language/)
  assert.match(source, /writeFile\(join\(publicRoot, 'index\.html'\)/)
  assert.doesNotMatch(source, /\.locale-root/)
})

test('nginx does not vary the root cache by locale negotiation', () => {
  const source = read('ops/nginx/kadonext.conf')

  assert.match(source, /location = \/ \{[\s\S]*?try_files \/index\.html =404;/)
  assert.match(source, /location = \/ \{[\s\S]*?s-maxage=300/)
  assert.doesNotMatch(source, /location = \/ \{[\s\S]*?Vary.*Accept-Language/)
  assert.match(source, /location = \/api\/contact \{[\s\S]*?proxy_pass/)
})

test('nginx revalidates VPS-served HTML directly from the VPS', () => {
  const source = read('ops/nginx/kadonext.conf')
  const catchAll = source.match(/location \/ \{([\s\S]*?)\n    \}/)?.[1] ?? ''

  assert.match(catchAll, /try_files \$uri \$uri\/ \$uri\.html =404;/)
  assert.match(catchAll, /expires -1;/)
  assert.doesNotMatch(catchAll, /s-maxage|stale-while-revalidate/)
})

test('nginx retains hashed Nuxt assets but bounds unhashed media caching', () => {
  const nginx = read('ops/nginx/kadonext.conf')
  const deploy = read('scripts/deploy-production.ps1')

  assert.match(nginx, /location \^~ \/_nuxt\/ \{[\s\S]*?root \/var\/www\/kadonext\/shared-assets;/)
  assert.match(nginx, /location ~\* \^\/\(brand\|env\|home[\s\S]*?s-maxage=86400/)
  assert.doesNotMatch(nginx, /location ~\* \^\/\(brand\|env\|home[\s\S]*?s-maxage=31536000/)
  assert.match(nginx, /location \^~ \/og\/ \{[\s\S]*?max_ranges 0;/)
  assert.match(deploy, /shared_nuxt='\/var\/www\/kadonext\/shared-assets\/_nuxt'/)
  assert.match(deploy, /cp -a "\$old_release\/_nuxt\/\." "\$shared_nuxt\/"/)
  assert.match(deploy, /cp -a "\$release\/_nuxt\/\." "\$shared_nuxt\/"/)
})

test('production deploy validates localized pages separately from the root selector', () => {
  const source = read('scripts/deploy-production.ps1')

  assert.match(source, /data-kado-locale-selector/)
  assert.match(source, /property="og:image"/)
  assert.match(source, /select language/)
  assert.match(source, /curl -fsS --retry 10 --retry-delay 1 --retry-all-errors/)
  assert.match(source, /https:\/\/kadonext\.com\/ru\//)
  assert.match(source, /https:\/\/kadonext\.com\/en\//)
  assert.match(source, /og\/v2\/ru\/home\.jpg/)
  assert.match(source, /node scripts\/check-origin-assets\.mjs/)
  assert.match(source, /for asset_path in "\$app_path" \/fonts\/fixel\/FixelCritical\.woff2/)
  assert.doesNotMatch(source, /check_cdn_cors_asset|Access-Control-Allow-Origin/)
  assert.doesNotMatch(source, /\.locale-root\\ru\.html/)
})
