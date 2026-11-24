import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repair = readFileSync(new URL('../ops/repair-production-tls.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'

function run({ renew = 0, origin = 0, assets = 0 } = {}) {
  // Exercise the real remote script with no SSH, network or system changes.
  const mocks = `
certbot() { printf 'CALL renewal\\n'; return ${renew}; }
nginx() { printf 'CALL nginx %s\\n' "$*"; }
systemctl() { printf 'CALL systemctl %s\\n' "$*"; }
openssl() { printf 'CALL certificate\\n'; }
curl() {
  case "$*" in
    */fonts/fixel/FixelCritical.woff2*) printf 'CALL assets\\n'; return ${assets} ;;
    *) printf 'CALL origin\\n'; return ${origin} ;;
  esac
}
`
  const result = spawnSync(bash, ['-c', mocks + repair], { encoding: 'utf8', timeout: 10000 })
  if (result.error) throw result.error
  return { status: result.status, output: result.stdout + result.stderr }
}

test('TLS repair renews before reload and checks VPS HTML and assets', () => {
  const { status, output } = run()
  assert.equal(status, 0, output)
  assert.ok(output.indexOf('CALL renewal') < output.indexOf('CALL systemctl reload nginx'))
  assert.ok(output.indexOf('CALL systemctl reload nginx') < output.indexOf('CALL origin'))
  assert.ok(output.indexOf('CALL origin') < output.indexOf('CALL assets'))
  assert.match(output, /Origin HTTPS: OK/)
  assert.match(output, /VPS assets HTTPS: OK/)
})

test('failed certificate renewal stops before nginx reload', () => {
  const { status, output } = run({ renew: 17 })
  assert.equal(status, 17)
  assert.doesNotMatch(output, /CALL systemctl|CALL origin|CALL assets/)
})

test('failed origin validation stops before the VPS asset check', () => {
  const { status, output } = run({ origin: 60 })
  assert.equal(status, 60)
  assert.doesNotMatch(output, /Origin HTTPS: OK|CALL assets/)
})

test('failed VPS font delivery fails the deployment gate', () => {
  const { status, output } = run({ assets: 22 })
  assert.equal(status, 22)
  assert.match(output, /Origin HTTPS: OK/)
  assert.doesNotMatch(output, /VPS assets HTTPS: OK/)
})
