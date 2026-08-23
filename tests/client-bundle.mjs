import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

async function loadBundle(navigator = {}, overrides = {}) {
  const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let handoff
  const listeners = []
  const react = new Proxy({}, { get: (_target, key) => {
    if (key === 'createElement') return (...args) => ({ args })
    return () => undefined
  } })
  const context = {
    window: {
      __ModuleLoader__: {
        load(record) { handoff = record },
      },
      ...overrides.window,
    },
    navigator,
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        setAttribute() {},
        style: {},
        dataset: {},
        select() {},
        remove() {},
      }),
      head: { appendChild() {} },
      body: { appendChild() {} },
      addEventListener(type, listener, options) { listeners.push({ type, listener, options }) },
      removeEventListener(type, listener, options) {
        const index = listeners.findIndex(item => item.type === type && item.listener === listener && item.options === options)
        if (index !== -1) listeners.splice(index, 1)
      },
      ...overrides.document,
    },
    Event,
    console,
    setTimeout,
    clearTimeout,
  }
  vm.runInNewContext(code, context, { filename: 'dsh-session-tools/client.js' })
  assert.ok(handoff)
  const exports = handoff.factory((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') {
      return { jsx: (...args) => ({ args }), jsxs: (...args) => ({ args }), Fragment: Symbol('Fragment') }
    }
    throw new Error(`unexpected browser external: ${id}`)
  })
  return { handoff, exports, listeners }
}

function fakeElement() {
  return {
    className: '',
    classList: { add() {} },
    dataset: {},
    style: {},
    setAttribute() {},
    appendChild() {},
    append() {},
    addEventListener() {},
    replaceChildren() {},
  }
}

test('browser bundle contributes one localized session-header copy-ID utility', async () => {
  const { handoff, exports } = await loadBundle()
  const registrations = []
  const locales = []
  const ctx = {
    effect(start) { return start() },
    locale: {
      bind() { return key => key },
      register(namespace, dictionaries) { locales.push({ namespace, dictionaries }); return () => {} },
    },
    slots: {
      inject(name, mount) { assert.equal(name, 'conversation.session.header.utilities'); return mount() },
      register(options, component) { registrations.push({ options, component }); return () => {} },
    },
  }

  exports.apply(ctx)

  assert.equal(handoff.id, 'dsh-session-tools')
  assert.deepEqual(Array.from(exports.inject), ['slots', 'locale'])
  assert.equal(locales[0].namespace, 'dsh-session-tools')
  assert.equal(registrations[0].options.id, 'copy-session-id')
  assert.equal(registrations[0].options.name, 'conversation.session.header.utilities')
  assert.equal(typeof registrations[0].component, 'function')
})

test('clipboard helper reports success only after the exact session id is accepted', async () => {
  const writes = []
  const { exports } = await loadBundle({ clipboard: { async writeText(text) { writes.push(text) } } })
  assert.equal(await exports.writeClipboard('session-other'), true)
  assert.deepEqual(writes, ['session-other'])

  const denied = await loadBundle({ clipboard: { async writeText() { throw new Error('denied') } } })
  assert.equal(await denied.exports.writeClipboard('session-other'), false)
})

test('browser bundle watches session-row action buttons and resolves their exact React-owned id', async () => {
  const { exports, listeners } = await loadBundle()
  const ctx = {
    effect(start) { return start() },
    locale: {
      bind() { return key => key },
      register() { return () => {} },
    },
    slots: {
      inject(_name, mount) { return mount() },
      register() { return () => {} },
    },
  }

  exports.apply(ctx)
  const click = listeners.find(item => item.type === 'click')
  assert.equal(typeof click?.listener, 'function')
  assert.equal(click?.options, true)

  const element = {}
  Object.defineProperty(element, '__reactFiber$test', {
    enumerable: true,
    value: {
      memoizedProps: {},
      return: {
        memoizedProps: { node: { id: 'session-from-row' } },
        return: null,
      },
    },
  })
  assert.equal(exports.sessionIdFromElement(element), 'session-from-row')
})

test('session-row copy item refreshes host placement after increasing the menu height', async () => {
  const events = []
  let inserted = false
  const template = { ...fakeElement(), cloneNode: () => fakeElement() }
  const menu = {
    getBoundingClientRect: () => ({ left: 10, top: 10, width: 218, height: 128 }),
    querySelector(selector) {
      if (selector === '[data-dsh-session-tools-copy]') return null
      if (selector === '[role="menuitem"]') return template
      return null
    },
    insertBefore() { inserted = true },
  }
  const { exports, listeners } = await loadBundle({}, {
    window: { dispatchEvent(event) { events.push(event.type); return true } },
    document: {
      querySelectorAll: () => [menu],
      createElement: () => fakeElement(),
      createElementNS: () => fakeElement(),
    },
  })
  const ctx = {
    effect(start) { return start() },
    locale: { bind() { return key => key }, register() { return () => {} } },
    slots: { inject(_name, mount) { return mount() }, register() { return () => {} } },
  }
  exports.apply(ctx)

  const button = {
    getBoundingClientRect: () => ({ left: 10, top: 150, right: 30, bottom: 170 }),
    closest(selector) {
      if (selector === 'button') return this
      if (selector === '[role="treeitem"]') return {}
      return null
    },
  }
  Object.defineProperty(button, '__reactFiber$test', {
    value: { memoizedProps: { node: { id: 'session-near-bottom' } }, return: null },
  })
  listeners.find(item => item.type === 'click').listener({ target: button })
  await new Promise(resolve => setTimeout(resolve, 10))

  assert.equal(inserted, true)
  assert.deepEqual(events, ['resize'])
})
