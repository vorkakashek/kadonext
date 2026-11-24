import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'

// Exercise delegation and entry geometry without browser/visual QA.
function harness({ fine = true } = {}) {
  class Element {
    constructor({ tag = 'button', parent, rect, attrs = {}, focused = false, disabled = false } = {}) {
      Object.assign(this, { tag, parent, focused, disabled })
      this.rect = rect ?? { left: 100, top: 200, width: 200, height: 50 }
      this.attrs = new Map(Object.entries(attrs))
      this.children = []
      parent?.children.push(this)
      this.properties = new Map()
      this.style = { setProperty: (key, value) => this.properties.set(key, value) }
      this.reads = 0
    }
    getBoundingClientRect() { this.reads++; return this.rect }
    toggleAttribute(key, enabled) { if (enabled) this.attrs.set(key, ''); else this.attrs.delete(key) }
    contains(node) { return node === this || this.children.some(child => child.contains(node)) }
    matches(selector) {
      if (selector === ':focus-visible') return this.focused
      return this.disabled || this.attrs.get('aria-disabled') === 'true'
    }
    closest(selector) {
      const blocked = selector.startsWith('[inert]')
      const hit = blocked
        ? this.attrs.has('inert') || this.attrs.get('data-button-hover') === 'off'
        : this.tag === 'button' || this.attrs.get('role') === 'button' || this.attrs.has('data-button-hover') || this.attrs.has('chip')
      return hit ? this : this.parent?.closest(selector) ?? null
    }
    querySelector() {
      for (const child of this.children) {
        if (child.attrs.has('data-button-hover-surface')) return child
        const nested = child.querySelector()
        if (nested) return nested
      }
      return null
    }
  }
  const listeners = new Map()
  const root = {
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type),
  }
  const context = createContext({ exports: {}, Element, Node: Element })
  const source = readFileSync(new URL('../app/utils/buttonHover.ts', import.meta.url), 'utf8')
  runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  const cleanup = context.exports.installButtonHover(root, { matchMedia: () => ({ matches: fine }) })
  const emit = (type, target, rest = {}) => listeners.get(type)?.({ target, pointerType: 'mouse', ...rest })
  return { Element, emit, cleanup, listeners, api: context.exports }
}

test('new buttons and button links get an entry origin; child movement never retargets it', () => {
  const { Element, emit, cleanup } = harness()
  const button = new Element()
  const icon = new Element({ tag: 'svg', parent: button })
  emit('pointerover', button, { clientX: 110, clientY: 225 })
  assert.equal(button.properties.get('--button-hover-x'), '5%')
  assert.equal(button.properties.get('--button-hover-y'), '50%')
  assert(button.attrs.has('data-button-hover-active'))
  emit('pointerout', button, { relatedTarget: icon })
  emit('pointerover', icon, { clientX: 290, clientY: 240 })
  assert.equal(button.reads, 1)
  emit('pointerout', button, { clientX: 300, clientY: 240, relatedTarget: null })
  assert(!button.attrs.has('data-button-hover-active'))
  assert.equal(button.properties.get('--button-hover-x'), '5%')
  const link = new Element({ tag: 'a', attrs: { 'data-button-hover': '' } })
  emit('pointerover', link, { clientX: 300, clientY: 200 })
  assert(link.attrs.has('data-button-hover-active'))
  assert.equal(link.properties.get('--button-hover-x'), '100%')
  cleanup()
})

test('touch and coarse pointers do not trigger a hover or geometry reads', () => {
  for (const fine of [true, false]) {
    const { Element, emit, cleanup } = harness({ fine })
    const button = new Element()
    emit('pointerover', button, { pointerType: 'touch', clientX: 110, clientY: 210 })
    if (!fine) emit('pointerover', button, { clientX: 110, clientY: 210 })
    assert.equal(button.reads, 0)
    assert(!button.attrs.has('data-button-hover-active'))
    cleanup()
  }
})

test('keyboard focus starts at the center and remains after pointer exit', () => {
  const { Element, emit, cleanup } = harness()
  const button = new Element({ focused: true })
  emit('focusin', button)
  assert.equal(button.properties.get('--button-hover-x'), '50%')
  emit('pointerover', button, { clientX: 100, clientY: 200 })
  emit('pointerout', button)
  assert(button.attrs.has('data-button-hover-active'))
  emit('focusout', button)
  assert(!button.attrs.has('data-button-hover-active'))
  cleanup()
})

test('disabled, inert and opted-out controls do not hide the cursor or fill', () => {
  const { Element, emit, cleanup, api } = harness()
  const inert = new Element({ tag: 'div', attrs: { inert: '' } })
  const buttons = [
    new Element({ disabled: true }),
    new Element({ attrs: { 'aria-disabled': 'true' } }),
    new Element({ attrs: { 'data-button-hover': 'off' } }),
    new Element({ parent: inert }),
  ]
  for (const button of buttons) {
    emit('pointerover', button, { clientX: 110, clientY: 210 })
    assert.equal(button.reads, 0)
    assert.equal(api.findButtonHoverHost(button), null)
  }
  cleanup()
})

test('composite controls fill their button surface and clamp out-of-bounds coordinates', () => {
  const { Element, emit, cleanup } = harness()
  const host = new Element({ tag: 'div', attrs: { role: 'button', 'data-button-hover-proxy': '' } })
  const pill = new Element({ tag: 'span', parent: host, attrs: { 'data-button-hover-surface': '' } })
  emit('pointerover', host, { clientX: 400, clientY: 100 })
  assert(!host.attrs.has('data-button-hover-active'))
  assert(pill.attrs.has('data-button-hover-active'))
  assert.equal(pill.properties.get('--button-hover-x'), '100%')
  assert.equal(pill.properties.get('--button-hover-y'), '0%')
  cleanup()
  assert(!pill.attrs.has('data-button-hover-active'))
})

test('cleanup removes delegated handlers and leaves no live hover state', () => {
  const { Element, emit, cleanup, listeners } = harness()
  const button = new Element()
  emit('pointerover', button, { clientX: 150, clientY: 225 })
  cleanup()
  assert.equal(listeners.size, 0)
  assert(!button.attrs.has('data-button-hover-active'))
})
