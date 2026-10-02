import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('private dashboard is gated by a VPS-only IP allowlist', () => {
  const nginx = read('ops/nginx/kadonext.conf')
  const location = nginx.match(/location \^~ \/analytics\/ \{[\s\S]+?\n    \}/)?.[0] ?? ''

  assert.match(location, /include \/etc\/nginx\/snippets\/kado-analytics-access\.conf;/)
  assert.match(location, /root \/var\/lib\/kado-analytics\/www;/)
  assert.match(location, /Cache-Control "private, no-store"/)
  assert.match(location, /X-Robots-Tag "noindex, nofollow, noarchive"/)
  assert.match(location, /Content-Security-Policy/)
  assert.match(location, /access_log off;/)
  assert.doesNotMatch(nginx, /94\.45\.210\.180/)
})

test('dashboard updater publishes only the supported aggregate periods', () => {
  const updater = read('ops/analytics/update-dashboard-data.sh')
  const app = read('ops/analytics/dashboard/app.js')

  assert.match(updater, /for days in 7 30 90/)
  assert.match(updater, /report-\$\{days\}\.json/)
  assert.match(app, /report-\$\{state\.days\}\.json/)
  assert.doesNotMatch(app, /cookie|localStorage|sessionStorage/i)
})
