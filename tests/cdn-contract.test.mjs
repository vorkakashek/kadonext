import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('asset CDN mode shares one origin across public and app assets', () => {
  const source = read('nuxt.config.ts')
  const envExample = read('.env.example')
  const css = read('app/assets/css/main.css')

  assert.match(source, /const fullSiteCdn = process\.env\.KADO_FULL_SITE_CDN === 'true'/)
  assert.match(source, /const assetOnlyCdn = !fullSiteCdn && process\.env\.NODE_ENV === 'production'/)
  assert.match(source, /const publicAssetCdnUrl = assetOnlyCdn\s*\? normalizeAssetCdnUrl/)
  assert.match(source, /const appAssetCdnUrl = assetOnlyCdn\s*\? normalizeAssetCdnUrl/)
  assert.match(source, /process\.env\.KADO_APP_ASSET_CDN_URL \?\? publicAssetCdnUrl/)
  assert.match(source, /cdnURL: appAssetCdnUrl/)
  assert.match(source, /assetCdnUrl: publicAssetCdnUrl/)
  assert.match(source, /fontAssetUrl\('FixelCritical\.woff2'\)/)
  assert.match(source, /innerHTML: fontFacesCss/)
  assert.match(envExample, /KADO_APP_ASSET_CDN_URL=https:\/\/nfb4tt2jyb\.cdn\.twcstorage\.ru/)
  assert.doesNotMatch(css, /url\(["']?\/fonts\//)
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

  assert.match(source, /location = \/ \{[\s\S]*?try_files \/index\.html =404;/)
  assert.match(source, /location = \/ \{[\s\S]*?s-maxage=300/)
  assert.doesNotMatch(source, /location = \/ \{[\s\S]*?Vary.*Accept-Language/)
  assert.match(source, /location = \/api\/contact \{[\s\S]*?proxy_pass/)
})

test('nginx revalidates VPS-served HTML in asset-CDN mode', () => {
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
  assert.match(deploy, /shared_nuxt='\/var\/www\/kadonext\/shared-assets\/_nuxt'/)
  assert.match(deploy, /cp -a "\$old_release\/_nuxt\/\." "\$shared_nuxt\/"/)
  assert.match(deploy, /cp -a "\$release\/_nuxt\/\." "\$shared_nuxt\/"/)
})

test('production deploy validates localized pages separately from the root selector', () => {
  const source = read('scripts/deploy-production.ps1')

  assert.match(source, /data-kado-locale-selector/)
  assert.match(source, /curl -fsS --retry 10 --retry-delay 1 --retry-all-errors/)
  assert.match(source, /https:\/\/kadonext\.com\/ru\//)
  assert.match(source, /https:\/\/kadonext\.com\/en\//)
  assert.match(source, /check_cdn_cors_asset/)
  assert.match(source, /Access-Control-Allow-Origin/)
  assert.match(source, /cdn_app_url=.*\/_nuxt\//)
  assert.match(source, /cdn_font_url=.*\/fonts\/fixel\/FixelCritical/)
  assert.doesNotMatch(source, /\.locale-root\\ru\.html/)
})
