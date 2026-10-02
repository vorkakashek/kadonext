import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('nginx traffic counter records only the day and canonical content path', () => {
  const source = read('ops/nginx/kadonext.conf')
  const format = source.match(/log_format kado_pageview[^;]+;/)?.[0] ?? ''

  assert.match(source, /map \$request_uri \$kado_page_path/)
  assert.match(source, /map \$kado_page_path \$kado_content_route/)
  assert.match(source, /GET:1:\(\?:200\|304\)/)
  assert.match(source, /access_log \/var\/log\/nginx\/kadonext-pageviews\.log kado_pageview if=\$kado_count_pageview;/)
  assert.match(format, /"day"/)
  assert.match(format, /"path"/)
  assert.match(format, /"browser"/)
  assert.match(format, /"source"/)
  assert.match(format, /"country"/)
  assert.doesNotMatch(format, /remote_addr|http_user_agent|http_referer|cookie|request_uri|msec/)
})

test('analytics report totals anonymous page-load rows and rejects malformed input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kado-analytics-test-'))
  const today = new Date().toISOString().slice(0, 10)
  try {
    await writeFile(join(directory, 'kadonext-pageviews.log'), [
      JSON.stringify({ day: today, path: '/ru/', browser: 'safari', source: 'direct', country: 'RU' }),
      JSON.stringify({ day: today, path: '/ru/projects', browser: 'chrome', source: 'yandex', country: 'DE' }),
      'partial line',
      JSON.stringify({ day: '2000-01-01', path: '/ru/' }),
      '',
    ].join('\n'))

    const { stdout } = await run(process.execPath, [
      fileURLToPath(new URL('../scripts/report-analytics.mjs', import.meta.url)),
      '--dir', directory,
      '--days', '7',
      '--json',
    ])
    const report = JSON.parse(stdout)
    assert.equal(report.pageviews, 2)
    assert.equal(report.byDay[today], 2)
    assert.equal(report.byPath['/ru/'], 1)
    assert.equal(report.byPath['/ru/projects'], 1)
    assert.equal(report.byBrowser.safari, 1)
    assert.equal(report.byBrowser.chrome, 1)
    assert.equal(report.bySource.direct, 1)
    assert.equal(report.bySource.yandex, 1)
    assert.equal(report.byCountry.RU, 1)
    assert.equal(report.byCountry.DE, 1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
