const numberFormat = new Intl.NumberFormat('ru-RU')
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const fullDateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const regionNames = typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['ru'], { type: 'region' })
  : null

const labels = {
  browsers: { chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox', edge: 'Edge', opera: 'Opera', other: 'Другой', unknown: 'Не определён' },
  sources: { direct: 'Прямой переход', internal: 'Внутренний переход', yandex: 'Яндекс', google: 'Google', bing: 'Bing', vk: 'VK', telegram: 'Telegram', instagram: 'Instagram', facebook: 'Facebook', x: 'X / Twitter', behance: 'Behance', dribbble: 'Dribbble', other: 'Другой сайт', unknown: 'Не определён' },
}

const state = { days: 30, loading: false }
const byId = id => document.getElementById(id)
const svg = name => document.createElementNS('http://www.w3.org/2000/svg', name)

function parseDay(day) {
  return new Date(`${day}T00:00:00Z`)
}

function topEntry(record = {}) {
  return Object.entries(record)[0] ?? null
}

function countryLabel(code) {
  if (code === 'ZZ' || code === 'unknown') return 'Не определена'
  try { return regionNames?.of(code) ?? code }
  catch { return code }
}

function formatPath(path) {
  if (path === '/ru/' || path === '/en/' || path === '/') return 'Главная'
  return path
}

function fillDays(report) {
  const result = []
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  for (let offset = report.period.days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - offset)
    const key = date.toISOString().slice(0, 10)
    result.push({ date, value: Number(report.byDay?.[key] ?? 0) })
  }
  return result
}

function renderChart(report) {
  const host = byId('chart')
  host.replaceChildren()
  const points = fillDays(report)
  const width = 1000
  const height = 290
  const margins = { top: 18, right: 14, bottom: 34, left: 38 }
  const plotWidth = width - margins.left - margins.right
  const plotHeight = height - margins.top - margins.bottom
  const maxValue = Math.max(1, ...points.map(point => point.value))
  const root = svg('svg')
  root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  root.setAttribute('aria-hidden', 'true')

  const defs = svg('defs')
  const gradient = svg('linearGradient')
  gradient.id = 'area-fill'
  gradient.setAttribute('x1', '0')
  gradient.setAttribute('x2', '0')
  gradient.setAttribute('y1', '0')
  gradient.setAttribute('y2', '1')
  const start = svg('stop')
  start.setAttribute('offset', '0%')
  start.setAttribute('stop-color', '#536d48')
  start.setAttribute('stop-opacity', '.28')
  const end = svg('stop')
  end.setAttribute('offset', '100%')
  end.setAttribute('stop-color', '#536d48')
  end.setAttribute('stop-opacity', '0')
  gradient.append(start, end)
  defs.append(gradient)
  root.append(defs)

  for (let line = 0; line <= 3; line += 1) {
    const y = margins.top + (plotHeight * line / 3)
    const grid = svg('line')
    grid.setAttribute('class', 'chart-grid')
    grid.setAttribute('x1', margins.left)
    grid.setAttribute('x2', width - margins.right)
    grid.setAttribute('y1', y)
    grid.setAttribute('y2', y)
    root.append(grid)
  }

  const coords = points.map((point, index) => ({
    ...point,
    x: margins.left + (points.length === 1 ? 0 : plotWidth * index / (points.length - 1)),
    y: margins.top + plotHeight - (point.value / maxValue * plotHeight),
  }))
  const lineData = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const area = svg('path')
  area.setAttribute('class', 'chart-area')
  area.setAttribute('d', `${lineData} L ${coords.at(-1).x} ${margins.top + plotHeight} L ${coords[0].x} ${margins.top + plotHeight} Z`)
  const line = svg('path')
  line.setAttribute('class', 'chart-line')
  line.setAttribute('d', lineData)
  root.append(area, line)

  if (points.length <= 31) {
    coords.forEach(point => {
      const dot = svg('circle')
      dot.setAttribute('class', 'chart-dot')
      dot.setAttribute('cx', point.x)
      dot.setAttribute('cy', point.y)
      dot.setAttribute('r', '3')
      const title = svg('title')
      title.textContent = `${fullDateFormat.format(point.date)}: ${numberFormat.format(point.value)}`
      dot.append(title)
      root.append(dot)
    })
  }

  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
  labelIndexes.forEach(index => {
    const point = coords[index]
    const label = svg('text')
    label.setAttribute('class', 'chart-label')
    label.setAttribute('x', point.x)
    label.setAttribute('y', height - 8)
    label.setAttribute('text-anchor', index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle')
    label.textContent = dateFormat.format(point.date)
    root.append(label)
  })
  host.append(root)
}

function renderRanking(id, record, labeler) {
  const host = byId(id)
  host.replaceChildren()
  const entries = Object.entries(record ?? {}).slice(0, 8)
  if (!entries.length) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = 'Пока нет данных за этот период.'
    host.append(empty)
    return
  }
  const max = Math.max(...entries.map(([, value]) => Number(value)))
  entries.forEach(([key, rawValue]) => {
    const value = Number(rawValue)
    const row = document.createElement('div')
    row.className = 'rank-row'
    const label = document.createElement('span')
    label.className = 'rank-label'
    label.title = labeler(key)
    label.textContent = labeler(key)
    const count = document.createElement('span')
    count.className = 'rank-value'
    count.textContent = numberFormat.format(value)
    const track = document.createElement('div')
    track.className = 'rank-track'
    const fill = document.createElement('div')
    fill.className = 'rank-fill'
    fill.style.width = `${max ? value / max * 100 : 0}%`
    track.append(fill)
    row.append(label, count, track)
    host.append(row)
  })
}

function render(report) {
  const views = Number(report.pageviews ?? 0)
  const path = topEntry(report.byPath)
  const country = topEntry(report.byCountry)
  byId('pageviews').textContent = numberFormat.format(views)
  byId('average').textContent = (views / report.period.days).toLocaleString('ru-RU', { maximumFractionDigits: 1 })
  byId('top-path').textContent = path ? formatPath(path[0]) : '—'
  byId('top-path').title = path ? path[0] : ''
  byId('top-country').textContent = country ? countryLabel(country[0]) : '—'
  const from = parseDay(report.period.from)
  const to = new Date()
  byId('period-caption').textContent = `${dateFormat.format(from)} — ${dateFormat.format(to)}`
  renderChart(report)
  renderRanking('paths', report.byPath, formatPath)
  renderRanking('countries', report.byCountry, countryLabel)
  renderRanking('browsers', report.byBrowser, key => labels.browsers[key] ?? key)
  renderRanking('sources', report.bySource, key => labels.sources[key] ?? key)
}

async function load() {
  if (state.loading) return
  state.loading = true
  byId('refresh').disabled = true
  byId('status').textContent = 'Обновляю данные…'
  try {
    const response = await fetch(`/analytics/report-${state.days}.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const report = await response.json()
    render(report)
    byId('status').textContent = `Обновлено ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`
  } catch (error) {
    byId('status').textContent = 'Не удалось загрузить данные'
    console.error(error)
  } finally {
    state.loading = false
    byId('refresh').disabled = false
  }
}

document.querySelectorAll('[data-days]').forEach(button => {
  button.addEventListener('click', () => {
    state.days = Number(button.dataset.days)
    document.querySelectorAll('[data-days]').forEach(item => item.classList.toggle('is-active', item === button))
    load()
  })
})
byId('refresh').addEventListener('click', load)
load()
setInterval(load, 5 * 60 * 1000)
