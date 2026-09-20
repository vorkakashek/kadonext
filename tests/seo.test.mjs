import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { computed, reactive, ref } from 'vue'

const json = path => JSON.parse(readFileSync(resolve(path), 'utf8'))
const structure = json('app/data/homeCases.json')
const details = json('app/data/projectCaseDetails.json')
const messages = json('content/locales/ru.json')
const projects = structure.map((project, index) => ({ ...project, ...messages.projects.items[index], media: { ...project.media, ...messages.projects.items[index].media } }))

// Execute the actual composable with Vue reactivity and isolated Nuxt head sinks.
// No browser or animation scene is needed to verify head ownership across routes.
function loadTs(path, globals = {}, imports = {}) {
  const source = readFileSync(resolve(path), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const exports = {}
  runInNewContext(output, {
    exports, ...globals,
    require(name) {
      assert.ok(name in imports, `Unexpected import in ${path}: ${name}`)
      return imports[name]
    },
  }, { filename: path })
  return exports
}
const seo = loadTs('app/utils/siteSeo.ts', {}, { './homeCases': { homeCaseIds: structure.map(project => project.id) } })
const plain = value => JSON.parse(JSON.stringify(value))
const lookup = key => key.split('.').reduce((value, part) => value?.[part], messages)
function setup(initialPath = '/', indexable = true) {
  const route = reactive({ path: initialPath })
  const config = reactive({ public: { siteIndexable: indexable } })
  let meta
  let head
  let calls = 0
  const { useSiteSeo } = loadTs('app/composables/useSiteSeo.ts', {
    computed, useRoute: () => route, useRuntimeConfig: () => config,
    useHomeCases: () => ref(projects),
    useI18n: () => ({ locale: ref('ru'), tm: lookup, t: lookup }),
    useSeoMeta: value => { meta = value; calls += 1 },
    useHead: value => { head = value },
  }, { '~/utils/siteSeo': seo })
  useSiteSeo()
  return {
    route, config,
    meta: key => typeof meta[key] === 'function' ? meta[key]() : meta[key],
    head: () => plain(head()),
    graph: () => JSON.parse(head().script[0].innerHTML)['@graph'],
    calls: () => calls,
  }
}

test('canonical URLs strip query, fragment and trailing slash', () => {
  for (const input of ['/projects/audience/', '/projects/audience?utm_source=test', '/projects/audience/#media']) {
    assert.equal(seo.canonicalPath(input), '/projects/audience')
  }
  assert.equal(seo.canonicalPath('/#contact'), '/')
  assert.equal(seo.siteUrl('/projects/audience'), 'https://kadonext.com/projects/audience')
})

test('one head owner updates every page and restores home after kept-alive navigation', () => {
  const app = setup()
  const sequence = ['/', '/projects', '/projects/audience', '/projects/keys-store', '/projects/baltika', '/projects/schmidt', '/privacy', '/consent', '/projects/audience/', '/#contact', '/']
  for (const path of sequence) {
    app.route.path = path
    const cleanPath = seo.canonicalPath(path)
    const project = projects.find(item => `/projects/${item.id}` === cleanPath)
    const key = project ? `seo.cases.${project.id}` : ({ '/': 'seo.home', '/projects': 'seo.projects', '/privacy': 'seo.privacy', '/consent': 'seo.consent' })[cleanPath]
    const expected = lookup(key)
    assert.equal(app.meta('title'), expected.title)
    assert.equal(app.meta('description'), expected.description)
    assert.equal(app.meta('ogTitle'), expected.title)
    assert.equal(app.meta('twitterDescription'), expected.description)
    assert.equal(app.meta('ogUrl'), seo.siteUrl(cleanPath))
    assert.equal(app.head().link[0].href, seo.siteUrl(cleanPath))
    assert.match(app.meta('robots'), /^index, follow/)
    const graph = app.graph()
    assert.equal(graph.find(node => node['@id'] === `${seo.siteUrl(cleanPath)}#webpage`).name, expected.title)
    if (project) {
      assert.equal(app.meta('ogImage'), seo.siteUrl(`/og/${project.id}.jpg`))
      assert.equal(graph.find(node => node['@type'] === 'CreativeWork').name, project.title)
      assert.equal(graph.find(node => node['@type'] === 'BreadcrumbList').itemListElement.at(-1).item, seo.siteUrl(cleanPath))
    } else if (cleanPath === '/') {
      assert.equal(app.meta('ogImage'), seo.siteUrl('/og/home.jpg'))
      assert.equal(graph.filter(node => node['@type'] === 'Service').length, 4)
      assert.ok(!graph.some(node => node['@type'] === 'BreadcrumbList'))
    }
  }
  assert.equal(app.calls(), 1, 'Route changes must update the existing head owner')
})

test('unknown routes remove canonical and structured data; returning restores them', () => {
  const app = setup('/projects/audience')
  for (const path of ['/missing', '/projects/missing', '/200.html', '/404.html']) {
    app.route.path = path
    assert.equal(app.meta('robots'), 'noindex, follow')
    assert.deepEqual(app.head().link, [])
    assert.deepEqual(app.head().script, [])
  }
  app.route.path = '/'
  assert.equal(app.head().link[0].href, seo.siteUrl('/'))
  assert.match(app.meta('robots'), /^index,/)
})

test('boolean and string configuration are consistent in HTML, robots and sitemap', () => {
  for (const value of [true, 'true', false, 'false', undefined, '']) {
    const indexable = value === true || value === 'true'
    const app = setup('/', value)
    // setup's default applies only to an omitted value; explicitly set unknown config.
    app.config.public.siteIndexable = value
    assert.equal(app.meta('robots').includes('noindex'), !indexable)
    const globals = {
      defineEventHandler: handler => handler,
      setHeader: () => {},
      useRuntimeConfig: () => ({ public: { siteIndexable: value } }),
    }
    const robots = loadTs('server/routes/robots.txt.ts', globals, { '../../app/utils/siteSeo': seo }).default({})
    const sitemap = loadTs('server/routes/sitemap.xml.ts', globals, {
      '../../app/utils/siteSeo': seo,
      '../../app/data/homeCases.json': structure,
      '../../app/data/projectCaseDetails.json': details,
    }).default({})
    assert.match(robots, /^Allow: \/$/m)
    assert.doesNotMatch(robots, /^Disallow: \/$/m)
    assert.equal(robots.includes('Sitemap:'), indexable)
    assert.equal([...sitemap.matchAll(/<loc>/g)].length, indexable ? 8 : 0)
    if (indexable) {
      assert.ok(sitemap.includes('<image:loc>https://kadonext.com/home/me-1024.webp</image:loc>'))
      assert.doesNotMatch(sitemap, /<lastmod>|#contact|\/200.html|\/404.html/)
    }
  }
})

test('JSON-LD cannot terminate its script element', () => {
  const value = { name: '</script><script>alert(1)</script>', description: 'A & B' }
  const serialized = seo.serializeJsonLd(value)
  assert.ok(!serialized.includes('<'))
  assert.deepEqual(JSON.parse(serialized), value)
})
