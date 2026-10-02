import { createGunzip } from 'node:zlib'
import { createReadStream, existsSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const logDirectory = resolve(option('--dir', '/var/log/nginx'))
const days = Math.min(Math.max(Number(option('--days', '30')) || 30, 1), 366)
const json = process.argv.includes('--json')
const cutoff = new Date()
cutoff.setUTCDate(cutoff.getUTCDate() - days + 1)
const cutoffDay = cutoff.toISOString().slice(0, 10)

if (!existsSync(logDirectory)) {
  console.error(`Analytics log directory does not exist: ${logDirectory}`)
  process.exit(1)
}

const files = readdirSync(logDirectory)
  .filter(file => /^kadonext-pageviews\.log(?:\.\d+)?(?:\.gz)?$/.test(file))
  .sort()

if (!files.length) {
  console.error(`No kadonext-pageviews.log files found in ${logDirectory}`)
  process.exit(1)
}

const byDay = new Map()
const byPath = new Map()
const byBrowser = new Map()
const bySource = new Map()
const byCountry = new Map()
let total = 0

for (const file of files) {
  const source = createReadStream(resolve(logDirectory, file))
  const input = file.endsWith('.gz') ? source.pipe(createGunzip()) : source
  const lines = createInterface({ input, crlfDelay: Infinity })

  for await (const line of lines) {
    try {
      const event = JSON.parse(line)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(event.day) || event.day < cutoffDay) continue
      if (typeof event.path !== 'string' || !event.path.startsWith('/')) continue
      total += 1
      byDay.set(event.day, (byDay.get(event.day) ?? 0) + 1)
      byPath.set(event.path, (byPath.get(event.path) ?? 0) + 1)
      const browser = typeof event.browser === 'string' ? event.browser : 'unknown'
      const source = typeof event.source === 'string' ? event.source : 'unknown'
      const country = typeof event.country === 'string' ? event.country : 'unknown'
      byBrowser.set(browser, (byBrowser.get(browser) ?? 0) + 1)
      bySource.set(source, (bySource.get(source) ?? 0) + 1)
      byCountry.set(country, (byCountry.get(country) ?? 0) + 1)
    } catch {
      // Ignore a partial line left by a concurrent nginx write or log rotation.
    }
  }
}

const result = {
  period: { from: cutoffDay, days },
  pageviews: total,
  byDay: Object.fromEntries([...byDay].sort(([left], [right]) => left.localeCompare(right))),
  byPath: Object.fromEntries([...byPath].sort((left, right) => right[1] - left[1])),
  byBrowser: Object.fromEntries([...byBrowser].sort((left, right) => right[1] - left[1])),
  bySource: Object.fromEntries([...bySource].sort((left, right) => right[1] - left[1])),
  byCountry: Object.fromEntries([...byCountry].sort((left, right) => right[1] - left[1])),
}

if (json) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`KADO page loads: ${total} since ${cutoffDay}`)
  console.log('\nBy day')
  console.table([...byDay].sort(([left], [right]) => left.localeCompare(right)).map(([day, pageviews]) => ({ day, pageviews })))
  console.log('\nBy page')
  console.table([...byPath].sort((left, right) => right[1] - left[1]).map(([path, pageviews]) => ({ path, pageviews })))
  console.log('\nBy browser family')
  console.table([...byBrowser].sort((left, right) => right[1] - left[1]).map(([browser, pageviews]) => ({ browser, pageviews })))
  console.log('\nBy source')
  console.table([...bySource].sort((left, right) => right[1] - left[1]).map(([source, pageviews]) => ({ source, pageviews })))
  console.log('\nBy country')
  console.table([...byCountry].sort((left, right) => right[1] - left[1]).map(([country, pageviews]) => ({ country, pageviews })))
}
