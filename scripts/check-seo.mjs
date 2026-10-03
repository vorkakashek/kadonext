import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve('.output/public')
const site = 'https://kadonext.com'
const projects = JSON.parse(readFileSync('app/data/homeCases.json', 'utf8'))
const basePaths = ['/', '/projects', ...projects.map(project => `/projects/${project.id}`), '/privacy', '/consent']
const locales = ['ru', 'en']
const paths = locales.flatMap(locale => basePaths.map(path => `/${locale}${path}`))
const basePathFor = path => path.replace(/^\/(?:ru|en)(?=\/|$)/, '').replace(/\/+$/, '') || '/'
const localeFor = path => path.split('/')[1]
const robots = readFileSync(resolve(root, 'robots.txt'), 'utf8')
const indexable = /^Sitemap: /m.test(robots)
assert.ok(/^Allow: \/$/m.test(robots), 'Crawlers must be able to read HTML indexation directives')
assert.ok(!/^Disallow: \/$/m.test(robots), 'Do not hide noindex directives behind a crawl prohibition')
const sitemap = readFileSync(resolve(root, 'sitemap.xml'), 'utf8')
const xmlLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
assert.deepEqual(xmlLocations, indexable ? paths.map(path => site + path) : [], 'Sitemap must contain exactly the localized content pages')
if (indexable) {
  assert.ok(robots.includes(`Sitemap: ${site}/sitemap.xml`), 'robots.txt must advertise the sitemap')
  const xmlDefaults = [...sitemap.matchAll(/<xhtml:link\b[^>]*hreflang="x-default"[^>]*href="([^"]+)"\/>/g)].map(match => match[1])
  assert.deepEqual(xmlDefaults, paths.map(path => site + `/en${basePathFor(path)}`), 'Sitemap x-default must resolve to English canonicals')
}

const decode = text => text.replace(/&(?:amp|quot|apos|lt|gt|#39|#x27|#\d+|#x[\da-f]+);/gi, entity => {
  const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#x27;': "'" }
  if (named[entity]) return named[entity]
  return String.fromCodePoint(entity.startsWith('&#x') ? Number.parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)))
})
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(match => [match[1], decode(match[2])]))
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(match => attributes(match[0]))
const htmlFor = path => readFileSync(resolve(root, path === '/' ? 'index.html' : `${path.slice(1)}/index.html`), 'utf8')
const fileFor = url => {
  const pathname = /^https?:\/\//i.test(url) ? new URL(url).pathname : url
  return resolve(root, decode(pathname).split(/[?#]/, 1)[0].replace(/^\//, ''))
}
const metaValue = (html, key, context) => {
  const entries = tags(html, 'meta').filter(tag => tag.name === key || tag.property === key)
  assert.equal(entries.length, 1, context + `exactly one ${key}`)
  assert.ok(entries[0].content?.trim(), context + `nonempty ${key}`)
  return entries[0].content
}
const titles = new Set()
const descriptions = new Set()
const cards = new Set()
let imageCount = 0

const rootHtml = htmlFor('/')
const englishHomeHtml = htmlFor('/en/')
const rootContext = '/: '
assert.match(rootHtml, /<html\b[^>]*\blang="en"/, rootContext + 'English document language')
assert.match(rootHtml, /<body\b[^>]*\bdata-kado-locale-selector\b/, rootContext + 'language selector hook')
assert.equal(tags(rootHtml, 'h1').length, 1, rootContext + 'one main heading')
const rootTitle = [...rootHtml.matchAll(/<title>([^<]*)<\/title>/g)]
assert.equal(rootTitle.length, 1, rootContext + 'one title')
assert.ok(rootTitle[0][1].trim(), rootContext + 'nonempty title')
assert.doesNotMatch(rootTitle[0][1], /select language/i, rootContext + 'public title is not implementation copy')
assert.match(metaValue(rootHtml, 'robots', rootContext), /noindex/, rootContext + 'selector remains out of the index')
assert.ok(metaValue(rootHtml, 'og:description', rootContext).length <= 125, rootContext + 'social description length')
for (const key of [
  'description',
  'og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description', 'og:url',
  'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt',
  'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt',
]) {
  assert.equal(metaValue(rootHtml, key, rootContext), metaValue(englishHomeHtml, key, '/en/: '), rootContext + `${key} mirrors English home`)
}
const rootCanonicals = tags(rootHtml, 'link').filter(tag => tag.rel === 'canonical')
assert.equal(rootCanonicals.length, 1, rootContext + 'one canonical')
assert.equal(rootCanonicals[0].href, `${site}/en/`, rootContext + 'English home canonical')
assert.equal(tags(rootHtml, 'link').filter(tag => tag.rel === 'alternate').length, 0, rootContext + 'no hreflang on the noncanonical selector')
const rootImage = new URL(metaValue(rootHtml, 'og:image', rootContext))
assert.equal(rootImage.pathname, '/og/home.jpg', rootContext + 'English home card')
if (process.env.KADO_FULL_SITE_CDN !== 'true') {
  assert.notEqual(rootImage.origin, site, rootContext + 'share card is served directly by the asset CDN')
}

for (const path of paths) {
  const locale = localeFor(path)
  const basePath = basePathFor(path)
  const html = htmlFor(path)
  const context = `${path}: `
  assert.match(html, new RegExp(`<html\\b[^>]*\\blang="${locale}"`), context + 'document language')
  assert.match(html, /<noscript\b[^>]*>[\s\S]*?\.home-hero__copy--intro-hidden[\s\S]*?<\/noscript>/, context + 'static content fallback')
  assert.equal(tags(html, 'h1').length, 1, context + 'one main heading')
  assert.equal(tags(html, 'main').length, 1, context + 'one main landmark')
  const titleMatches = [...html.matchAll(/<title>([^<]*)<\/title>/g)]
  assert.equal(titleMatches.length, 1, context + 'one title')
  const title = decode(titleMatches[0][1])
  assert.ok(title.trim() && !titles.has(title), context + 'unique title')
  titles.add(title)
  const getMeta = key => metaValue(html, key, context)
  const description = getMeta('description')
  if (basePath === '/') assert.ok(description.length <= 125, context + 'home description length')
  assert.ok(!descriptions.has(description), context + 'unique description')
  descriptions.add(description)
  assert.equal(getMeta('robots').includes('noindex'), !indexable, context + 'correct indexation policy')
  const canonicals = tags(html, 'link').filter(tag => tag.rel === 'canonical')
  const links = tags(html, 'link')
  const alternates = Object.fromEntries(links.filter(tag => tag.rel === 'alternate').map(tag => [tag.hreflang, tag.href]))
  assert.ok(links.some(tag => tag.rel === 'icon' && tag.href === '/favicon.ico' && tag.type === 'image/x-icon'), context + 'KADO search icon')
  assert.ok(links.some(tag => tag.rel === 'apple-touch-icon' && tag.href === '/apple-touch-icon.png'), context + 'mobile icon')
  assert.equal(canonicals.length, 1, context + 'one canonical')
  assert.equal(canonicals[0].href, site + path, context + 'absolute canonical without parameters or fragments')
  assert.deepEqual(alternates, {
    ru: site + `/ru${basePath}`,
    en: site + `/en${basePath}`,
    'x-default': site + `/en${basePath}`,
  }, context + 'complete reciprocal language cluster with English fallback')
  assert.equal(getMeta('og:title'), title, context + 'OG title')
  assert.equal(getMeta('twitter:title'), title, context + 'Twitter title')
  assert.equal(getMeta('og:description'), description, context + 'OG description')
  assert.equal(getMeta('twitter:description'), description, context + 'Twitter description')
  assert.equal(getMeta('og:url'), site + path, context + 'OG URL')
  assert.equal(getMeta('og:type'), 'website', context + 'OG type')
  assert.equal(getMeta('og:locale'), locale === 'ru' ? 'ru_RU' : 'en_US', context + 'OG locale')
  assert.equal(getMeta('og:site_name'), 'KADO', context + 'site name')
  assert.equal(getMeta('twitter:card'), 'summary_large_image', context + 'large image card')
  getMeta('og:image:alt')
  getMeta('twitter:image:alt')
  const image = getMeta('og:image')
  assert.equal(getMeta('twitter:image'), image, context + 'same share image')
  assert.equal(getMeta('og:image:type'), 'image/jpeg', context + 'image type')
  assert.equal(getMeta('og:image:width'), '1200', context + 'card width')
  assert.equal(getMeta('og:image:height'), '630', context + 'card height')
  const imageUrl = new URL(image)
  const expectedCard = item => `/og/${item}.jpg`
  assert.equal(
    imageUrl.pathname,
    expectedCard(basePath.startsWith('/projects/') ? basePath.split('/').at(-1) : basePath === '/projects' ? 'projects' : 'home'),
    context + 'share card path',
  )
  if (process.env.KADO_FULL_SITE_CDN !== 'true') {
    assert.notEqual(imageUrl.origin, site, context + 'share card is served directly by the asset CDN')
  }
  cards.add(fileFor(new URL(image).pathname))
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1, context + 'one structured-data graph')
  const schema = JSON.parse(scripts[0][1])
  assert.equal(schema['@context'], 'https://schema.org', context + 'schema context')
  const graph = schema['@graph']
  const page = graph.find(node => node['@id'] === site + path + '#webpage')
  assert.equal(page.url, site + path, context + 'schema URL')
  assert.equal(page.description, description, context + 'schema description matches page')
  assert.ok(graph.some(node => node['@type'] === 'Organization'), context + 'studio identity')
  assert.ok(graph.some(node => node['@type'] === 'WebSite'), context + 'website identity')
  if (basePath !== '/') {
    const breadcrumbs = graph.find(node => node['@type'] === 'BreadcrumbList').itemListElement
    assert.equal(breadcrumbs.at(-1).item, site + path, context + 'breadcrumb destination')
    assert.deepEqual(breadcrumbs.map(crumb => crumb.position), breadcrumbs.map((_, index) => index + 1), context + 'ordered breadcrumbs')
  }
  if (basePath.startsWith('/projects/')) assert.ok(graph.some(node => node['@type'] === 'CreativeWork'), context + 'case schema')
  if (basePath === '/projects') assert.equal(graph.find(node => node['@type'] === 'ItemList').numberOfItems, projects.length, context + 'catalog schema')

  for (const tag of tags(html, 'img')) {
    imageCount += 1
    assert.ok('alt' in tag, context + `missing alt: ${tag.src}`)
    assert.ok(tag.src && existsSync(fileFor(tag.src)), context + `missing image: ${tag.src}`)
    assert.ok(Number(tag.width) > 0 && Number(tag.height) > 0, context + `image dimensions: ${tag.src}`)
  }
  for (const tag of tags(html, 'source')) {
    if (tag.src?.startsWith('/')) assert.ok(existsSync(fileFor(tag.src)), context + `missing source: ${tag.src}`)
    for (const candidate of (tag.srcset ?? '').split(',')) {
      const src = candidate.trim().split(/\s+/)[0]
      if (src?.startsWith('/')) assert.ok(existsSync(fileFor(src)), context + `missing responsive image: ${src}`)
    }
  }
  for (const tag of tags(html, 'a')) {
    if (!tag.href?.startsWith('/') && !tag.href?.startsWith('#')) continue
    const url = new URL(tag.href, site + path)
    const target = url.pathname.replace(/\/+$/, '') || '/'
    assert.ok(paths.includes(target) || existsSync(fileFor(target)), context + `broken internal link: ${tag.href}`)
    if (url.hash && paths.includes(target)) {
      assert.ok(htmlFor(target).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), context + `missing anchor: ${tag.href}`)
    }
  }
}

for (const card of cards) {
  const metadata = await sharp(card).metadata()
  assert.equal(metadata.width, 1200, `Card width: ${card}`)
  assert.equal(metadata.height, 630, `Card height: ${card}`)
  assert.equal(metadata.format, 'jpeg', `Card format: ${card}`)
}
for (const [file, size] of [['favicon-96.png', 96], ['apple-touch-icon.png', 180], ['brand/kado-logo.png', 512]]) {
  const metadata = await sharp(resolve(root, file)).metadata()
  assert.equal(metadata.width, size, `Icon width: ${file}`)
  assert.equal(metadata.height, size, `Icon height: ${file}`)
}
const ico = readFileSync(resolve(root, 'favicon.ico'))
assert.equal(ico.readUInt16LE(2), 1, 'Valid ICO format')
assert.equal(ico.readUInt16LE(4), 4, 'Four ICO sizes')
for (let index = 0; index < 4; index += 1) {
  const offset = ico.readUInt32LE(6 + index * 16 + 12)
  const bytes = ico.readUInt32LE(6 + index * 16 + 8)
  const metadata = await sharp(ico.subarray(offset, offset + bytes)).metadata()
  assert.equal(metadata.width, [16, 32, 48, 96][index], 'ICO entry width')
  assert.equal(metadata.height, [16, 32, 48, 96][index], 'ICO entry height')
}
for (const match of sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)) {
  assert.ok(existsSync(fileFor(new URL(decode(match[1])).pathname)), `Missing sitemap image: ${match[1]}`)
}
for (const fallback of ['200.html', '404.html']) {
  const html = readFileSync(resolve(root, fallback), 'utf8')
  const entries = tags(html, 'meta').filter(tag => tag.name === 'robots')
  assert.equal(entries.length, 1, `${fallback}: one robots tag`)
  assert.match(entries[0].content, /noindex/, `${fallback}: never index fallbacks`)
}
for (const locale of locales) {
  const homeLinks = tags(htmlFor(`/${locale}/`), 'a').map(tag => tag.href)
  assert.ok(homeLinks.includes(`/${locale}/projects`), `${locale} home must link to its project catalog in initial HTML`)
  const catalogLinks = tags(htmlFor(`/${locale}/projects`), 'a').map(tag => tag.href)
  for (const project of projects) assert.ok(catalogLinks.includes(`/${locale}/projects/${project.id}`), `${locale} catalog must link to ${project.id} in initial HTML`)
}
console.log(`SEO passed: ${paths.length} pages, ${imageCount} images, ${cards.size} share cards, canonical URLs, metadata, JSON-LD, internal links, sitemap and fallbacks (${indexable ? 'production' : 'preview'}).`)
