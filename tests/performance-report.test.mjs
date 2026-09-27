import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const script = fileURLToPath(new URL('../scripts/report-performance.mjs', import.meta.url))
const budgets = readFileSync(new URL('../performance-budgets.json', import.meta.url))

function fixture(t, homeHtml) {
  const dir = mkdtempSync(join(tmpdir(), 'kado-perf-report-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const output = join(dir, '.output/public')
  mkdirSync(join(output, 'ru'), { recursive: true })
  mkdirSync(join(output, '_nuxt'), { recursive: true })
  writeFileSync(join(dir, 'performance-budgets.json'), budgets)
  writeFileSync(join(output, 'index.html'), '<html data-kado-locale-selector>Choose a language</html>')
  if (homeHtml !== undefined) writeFileSync(join(output, 'ru/index.html'), homeHtml)
  writeFileSync(join(output, '_nuxt/entry.js'), 'import "./shared.js"; console.log("home")')
  writeFileSync(join(output, '_nuxt/shared.js'), 'console.log("shared")')
  return {
    output,
    report: () => spawnSync(process.execPath, [script, '--check'], { cwd: dir, encoding: 'utf8' }),
  }
}

test('performance checks measure the localized app before and after root selector generation', t => {
  const { output, report } = fixture(t, '<script type="module" src="/_nuxt/entry.js"></script>')
  const afterSelector = report()
  assert.equal(afterSelector.status, 0, afterSelector.stderr)
  assert.match(afterSelector.stdout, /Initial synchronous JS requests: 2/)
  assert.match(afterSelector.stdout, /Measured page: \/ru\//)
  writeFileSync(join(output, 'index.html'), '<script type="module" src="/_nuxt/not-the-home.js"></script>')
  const beforeSelector = report()
  assert.equal(beforeSelector.status, 0, beforeSelector.stderr)
  assert.equal(beforeSelector.stdout, afterSelector.stdout)
})

test('a locale selector alone cannot pass the app performance check', t => {
  const { report } = fixture(t)
  const result = report()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Prerendered \/ru\/ is missing/)
})

test('missing app entrypoints cannot silently pass the performance budgets', t => {
  const { report } = fixture(t, '<html>Broken app without scripts</html>')
  const result = report()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /No initial JavaScript found/)
})
