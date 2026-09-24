import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'
import * as anchorContract from '../app/utils/homeAnchorMotion.ts'
import { baseRoutePath } from '../app/utils/localeRouting.ts'

// Exercise the actual Nuxt scroll driver with native scrolling, without a browser.
function harness({ thumb = true } = {}) {
  const calls = []
  const listeners = new Map()
  const timers = new Map()
  let timerId = 0
  const root = { classList: { contains: () => false } }
  const window = {
    scrollY: 800,
    innerHeight: 900,
    matchMedia: () => ({ matches: false }),
    scrollTo(options) {
      calls.push(['scroll', options.top, options.behavior])
      if (options.behavior !== 'smooth') this.scrollY = options.top
    },
    addEventListener(type, callback) {
      const set = listeners.get(type) ?? new Set()
      set.add(callback)
      listeners.set(type, set)
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback) },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id },
    clearTimeout(id) { timers.delete(id) },
  }
  const modules = {
    '~/utils/appliedScrollFrame': {},
    '~/utils/touchScrollOwnership': { createTouchScrollOwnership: () => () => false },
    '~/utils/formSwipeGuard': { createFormSwipeGuard: () => ({}) },
    '~/utils/homeSectionScroll': { homeSectionScrollTop: target => target === root ? 0 : target.top },
    '~/utils/mobileViewport': { isThumbNav: () => thumb },
    '~/utils/wheelScroll': {},
    '~/utils/caseRailTouch': { createCaseRailTouchAxis: () => () => ({}) },
    '~/utils/homeAnchorMotion': { ...anchorContract, beginHomeAnchorMotion() {
      calls.push(['freeze'])
      return {
        approach: top => calls.push(['approach', top]),
        settle: () => calls.push(['settle', window.scrollY]),
        cancel: () => calls.push(['cancel', window.scrollY]),
      }
    } },
  }
  const source = readFileSync(new URL('../app/plugins/lenis.client.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.hot', 'false')
  const context = createContext({
    exports: {}, require: name => modules[name], defineNuxtPlugin: fn => fn,
    useState: (_key, init) => ({ value: init() }),
    window, document: { documentElement: root, hidden: false },
    navigator: { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 1 },
    performance: { now: () => 0 },
  })
  runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  const { provide } = context.exports.default({ hook() {} })
  return {
    calls, window, root, timers,
    scroll: provide.scrollToSection,
    emit(type) { for (const callback of [...listeners.get(type) ?? []]) callback() },
    fireDelay(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay) continue
        timers.delete(id)
        timer.callback()
      }
    },
    listenerCount() { return [...listeners.values()].reduce((count, set) => count + set.size, 0) },
  }
}

test('anchor freezes before scrolling and settles only after final-position repair', () => {
  const h = harness()
  const contact = { id: 'contact', isConnected: true, top: 4000 }
  h.scroll(contact)
  assert.deepEqual(h.calls, [['freeze'], ['scroll', 4000, 'smooth']])
  contact.top = 4020 // Layout/browser chrome changes during the trip.
  h.window.scrollY = 4000
  h.emit('scrollend')
  assert.deepEqual(h.calls.slice(2), [['scroll', 4020, 'instant'], ['settle', 4020]])
  assert.equal(h.listenerCount(), 0)
  assert.equal(h.timers.size, 0)
  h.emit('scrollend')
  assert.equal(h.calls.length, 4)
})

test('wheel, touch and keyboard interruption stop the trip and release at the actual position', () => {
  for (const input of ['wheel', 'touchstart', 'keydown']) {
    const h = harness()
    h.scroll({ id: 'services', isConnected: true, top: 2500 })
    h.window.scrollY = 1200
    h.emit(input)
    assert.deepEqual(h.calls.slice(2), [['scroll', 1200, 'instant'], ['cancel', 1200]])
    assert.equal(h.listenerCount(), 0)
    h.emit('scrollend')
    assert.equal(h.calls.length, 4)
  }
})

test('a repeated anchor cancels its predecessor and starts a fresh freeze', () => {
  const h = harness()
  h.scroll({ id: 'services', isConnected: true, top: 2500 })
  h.window.scrollY = 1600
  h.scroll({ id: 'contact', isConnected: true, top: 4000 })
  assert.deepEqual(h.calls.slice(2), [
    ['scroll', 1600, 'instant'], ['cancel', 1600], ['freeze'], ['scroll', 4000, 'smooth'],
  ])
  h.emit('scrollend')
  assert.deepEqual(h.calls.at(-1), ['settle', 4000])
  assert.equal(h.listenerCount(), 0)
})

test('startup positioning bypasses the surface freeze', () => {
  const target = { id: 'contact', isConnected: true, top: 4000 }
  const startup = harness()
  startup.scroll(target, true)
  assert.deepEqual(startup.calls, [['scroll', 4000, 'instant']])
  assert.equal(startup.listenerCount(), 0)
})

test('home-top uses smooth scrolling; a detached anchor releases its hold', () => {
  const h = harness()
  h.scroll(h.root)
  assert.deepEqual(h.calls, [['freeze'], ['scroll', 0, 'smooth']])
  h.emit('scrollend')
  h.scroll({ id: 'contact', isConnected: false, top: 4000 })
  h.window.scrollY = 4000
  h.emit('scrollend')
  assert.deepEqual(h.calls.at(-1), ['cancel', 4000])
  assert.equal(h.listenerCount(), 0)
})

test('the surface starts on approach once, before the scroll finishes', () => {
  const h = harness()
  h.scroll({ id: 'contact', isConnected: true, top: 4000 })
  h.window.scrollY = 3600
  h.emit('scroll')
  assert.equal(h.calls.some(call => call[0] === 'approach'), false)
  h.window.scrollY = 3850
  h.emit('scroll')
  assert.deepEqual(h.calls.at(-1), ['approach', 4000])
  h.window.scrollY = 3950
  h.emit('scroll')
  assert.equal(h.calls.filter(call => call[0] === 'approach').length, 1)
  assert.equal(h.calls.some(call => call[0] === 'settle'), false)
  h.window.scrollY = 4000
  h.emit('scrollend')
  assert.deepEqual(h.calls.at(-1), ['settle', 4000])
})

test('desktop starts after 350 ms while far from the anchor; mobile keeps its distance lead', () => {
  for (const thumb of [true, false]) {
    const h = harness({ thumb })
    h.scroll({ id: 'contact', isConnected: true, top: 4000 })
    h.window.scrollY = 2000
    h.emit('scroll')
    assert.equal(h.calls.some(call => call[0] === 'approach'), false)
    h.fireDelay(350)
    assert.equal(h.calls.some(call => call[0] === 'approach'), !thumb)
  }
})

test('cancellation clears the early desktop kickoff; every named section uses the contract', () => {
  for (const id of ['services', 'about', 'contact']) {
    const h = harness({ thumb: false })
    h.scroll({ id, isConnected: true, top: 4000 })
    assert.equal(h.calls[0][0], 'freeze')
    h.emit('wheel')
    h.fireDelay(350)
    assert.equal(h.calls.some(call => call[0] === 'approach'), false)
    assert.equal(h.timers.size, 0)
  }
})

test('localized home hash removal keeps the logo return on the smooth-scroll driver', async () => {
  let mounted
  const calls = []
  const root = { id: 'home', classList: { contains: () => false } }
  const router = {
    currentRoute: { value: { fullPath: '/ru/', path: '/ru/', hash: '' } },
    options: { scrollBehavior: () => ({ top: 0, behavior: 'auto' }) },
  }
  const modules = {
    '~/utils/mobileViewport': { isThumbNav: () => false },
    '~/utils/homeSectionScroll': { homeSectionScrollTop: () => 0 },
    '~/utils/homeAnchorMotion': { isHomeAnchorTarget: anchorContract.isHomeAnchorTarget },
    '~/utils/localeRouting': { baseRoutePath },
  }
  const source = readFileSync(new URL('../app/plugins/home-section-scroll.client.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.hot?.dispose', '(() => {})')
  const context = createContext({
    exports: {}, require: name => modules[name], defineNuxtPlugin: fn => fn,
    useRouter: () => router, nextTick: () => Promise.resolve(),
    window: {
      location: { pathname: '/ru/', hash: '' },
      addEventListener() {}, removeEventListener() {},
    },
    document: {
      documentElement: root,
      getElementById: () => null,
    },
    performance: { getEntriesByType: () => [] },
  })
  runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  context.exports.default({
    hook(name, callback) { if (name === 'app:mounted') mounted = callback },
    $scrollToSection(target) { calls.push(target) },
  })
  mounted()

  const result = await router.options.scrollBehavior(
    { path: '/ru/', fullPath: '/ru/', hash: '' },
    { path: '/ru/', fullPath: '/ru/#cases', hash: '#cases' },
    null,
  )

  assert.equal(result, false)
  assert.deepEqual(calls, [root])
})
