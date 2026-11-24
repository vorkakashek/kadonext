import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('private dashboard and its reports require a password', () => {
  const nginx = read('ops/nginx/kadonext.conf')
  const location = nginx.match(/location \^~ \/analytics\/ \{[\s\S]+?\n    \}/)?.[0] ?? ''

  assert.match(location, /auth_basic "KADO Analytics";/)
  assert.match(location, /auth_basic_user_file \/etc\/nginx\/kado-analytics\.htpasswd;/)
  assert.doesNotMatch(location, /\b(?:allow|deny|satisfy|include)\s/)
  assert.match(location, /root \/var\/lib\/kado-analytics\/www;/)
  assert.match(location, /Cache-Control "private, no-store"/)
  assert.match(location, /X-Robots-Tag "noindex, nofollow, noarchive"/)
  assert.match(location, /Content-Security-Policy/)
  assert.match(location, /access_log off;/)
})

test('dashboard updater publishes only the supported aggregate periods', () => {
  const updater = read('ops/analytics/update-dashboard-data.sh')
  const app = read('ops/analytics/dashboard/app.js')

  assert.match(updater, /for days in 7 30 90/)
  assert.match(updater, /report-\$\{days\}\.json/)
  assert.match(app, /report-\$\{state\.days\}\.json/)
  assert.doesNotMatch(app, /cookie|localStorage|sessionStorage/i)
})

test('password setup replaces the legacy gate and verifies access before committing', () => {
  const packageJson = JSON.parse(read('package.json'))
  const setup = read('scripts/set-analytics-password.ps1')
  const updater = read('ops/analytics/set-dashboard-password.sh')

  assert.match(packageJson.scripts['analytics:dashboard:password'], /set-analytics-password\.ps1/)
  assert.match(setup, /Read-Host [^\n]+ -AsSecureString/)
  assert.match(setup, /\[string\]\$Login = 'benier@bk\.ru'/)
  assert.match(setup, /IFS= read -r encoded_login/)
  assert.match(updater, /printf '%s:%s\\n' "\$login" "\$hash"/)
  assert.doesNotMatch(updater, /printf 'kado:/)
  assert.match(updater, /openssl passwd -6 -stdin/)
  assert.match(updater, /chmod 0640/)
  assert.match(updater, /trap cleanup EXIT/)
  assert.match(updater, /probe "\$\{base\}report-7\.json"\)" = 401/)
  assert.match(updater, /probe -H @- "\$\{base\}report-7\.json"\)" = 200/)
  assert.match(updater, /nginx -t/)
  assert.match(updater, /systemctl reload nginx/)
})
