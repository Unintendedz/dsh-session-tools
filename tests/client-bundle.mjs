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
    MutationObserver: overrides.MutationObserver,
    console: overrides.console ?? console,
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

function actionElement(tagName = 'span') {
  const attributes = new Map()
  const listeners = new Map()
  const classes = new Set()
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    parentElement: null,
    dataset: {},
    style: {},
    disabled: false,
    classList: {
      add(...names) { for (const name of names) classes.add(name) },
      contains(name) { return classes.has(name) },
    },
    setAttribute(name, value) { attributes.set(name, String(value)) },
    getAttribute(name) { return attributes.get(name) ?? null },
    hasAttribute(name) { return attributes.has(name) },
    appendChild(child) { child.parentElement = element; element.children.push(child); return child },
    append(...children) { for (const child of children) element.appendChild(child) },
    replaceChildren(...children) {
      for (const child of element.children) child.parentElement = null
      element.children = []
      element.append(...children)
    },
    insertBefore(child, before) {
      child.parentElement = element
      const index = before === null ? -1 : element.children.indexOf(before)
      if (index === -1) element.children.push(child)
      else element.children.splice(index, 0, child)
      return child
    },
    addEventListener(type, listener) { listeners.set(type, listener) },
    querySelector(selector) {
      const matches = (candidate) => {
        if (selector === 'button') return candidate.tagName === 'BUTTON'
        if (selector === '[data-dsh-session-tools-actions]') {
          return candidate.hasAttribute('data-dsh-session-tools-actions')
        }
        return false
      }
      const visit = (candidate) => {
        if (matches(candidate)) return candidate
        for (const child of candidate.children) {
          const found = visit(child)
          if (found !== null) return found
        }
        return null
      }
      for (const child of element.children) {
        const found = visit(child)
        if (found !== null) return found
      }
      return null
    },
    async dispatch(type) {
      const event = {
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true },
        stopPropagation() { this.propagationStopped = true },
      }
      await listeners.get(type)?.(event)
      return event
    },
  }
  Object.defineProperty(element, 'firstChild', { get: () => element.children[0] ?? null })
  Object.defineProperty(element, 'previousElementSibling', {
    get: () => {
      if (element.parentElement === null) return null
      const index = element.parentElement.children.indexOf(element)
      return index > 0 ? element.parentElement.children[index - 1] : null
    },
  })
  return element
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

test('pinned session order keeps pins first without disturbing the remaining sessions', async () => {
  const { exports } = await loadBundle()
  assert.equal(typeof exports.pinnedSessionOrder, 'function')
  assert.deepEqual(
    Array.from(exports.pinnedSessionOrder(
      ['session-a', 'session-b', 'session-c', 'session-d'],
      ['session-d', 'session-b', 'session-missing'],
    )),
    ['session-d', 'session-b', 'session-a', 'session-c'],
  )
})

test('session row context resolves native archive and ordering actions from its React owners', async () => {
  const { exports } = await loadBundle()
  assert.equal(typeof exports.sessionContextFromElement, 'function')

  const archived = []
  const reordered = []
  const archiveSession = async sessionId => { archived.push(sessionId) }
  const setSessionOrder = (accountKey, order) => { reordered.push({ accountKey, order }) }
  const element = {}
  Object.defineProperty(element, '__reactFiber$test', {
    value: {
      memoizedProps: {},
      return: {
        memoizedProps: {
          node: { id: 'session-row', title: 'Pinned row' },
          onArchive() {},
        },
        return: {
          memoizedProps: {
            sessionOrderByAccount: { 'workspace-1': ['session-other', 'session-row'] },
            setSessionOrder,
            workspaces: [{ workspaceId: 'workspace-1', sessionIds: ['session-other', 'session-row'] }],
          },
          return: {
            memoizedProps: { archiveSession },
            return: null,
          },
        },
      },
    },
  })

  const context = exports.sessionContextFromElement(element)
  assert.equal(context.sessionId, 'session-row')
  assert.equal(context.title, 'Pinned row')
  assert.equal(context.accountKey, 'workspace-1')
  await context.archiveSession(context.sessionId)
  context.setSessionOrder(context.accountKey, ['session-row', 'session-other'])
  assert.deepEqual(archived, ['session-row'])
  assert.deepEqual(reordered, [{
    accountKey: 'workspace-1',
    order: ['session-row', 'session-other'],
  }])

  const flatElement = {}
  Object.defineProperty(flatElement, '__reactFiber$test', {
    value: {
      memoizedProps: { node: { id: 'session-flat', title: 'Flat row' } },
      return: {
        memoizedProps: {
          sessionOrderByAccount: { '__flat_session_order__': ['session-flat'] },
          setSessionOrder,
        },
        return: { memoizedProps: { archiveSession }, return: null },
      },
    },
  })
  assert.equal(exports.sessionContextFromElement(flatElement).accountKey, '__flat_session_order__')
})

test('pin persistence sanitizes stored ids and reports denied writes', async () => {
  const { exports } = await loadBundle()
  assert.equal(typeof exports.readPinnedSessionIds, 'function')
  assert.equal(typeof exports.writePinnedSessionIds, 'function')

  const storage = {
    value: JSON.stringify(['session-b', '', 'session-b', 42, 'session-a']),
    getItem() { return this.value },
    setItem(_key, value) { this.value = value },
  }
  assert.deepEqual(Array.from(exports.readPinnedSessionIds(storage)), ['session-b', 'session-a'])
  assert.equal(exports.writePinnedSessionIds(storage, ['session-a']), true)
  assert.deepEqual(JSON.parse(storage.value), ['session-a'])

  const corrupt = { getItem() { return '{' } }
  assert.deepEqual(Array.from(exports.readPinnedSessionIds(corrupt)), [])
  const denied = { setItem() { throw new Error('denied') } }
  assert.equal(exports.writePinnedSessionIds(denied, ['session-a']), false)
})

test('pin sync writes the DSH order once and becomes a no-op when already sorted', async () => {
  const { exports } = await loadBundle()
  assert.equal(typeof exports.syncPinnedSessionOrder, 'function')

  const writes = []
  const context = {
    accountKey: 'workspace-1',
    sessionOrderByAccount: {
      'workspace-1': ['session-a', 'session-b', 'session-c'],
    },
    setSessionOrder(accountKey, order) { writes.push({ accountKey, order: Array.from(order) }) },
  }
  assert.equal(exports.syncPinnedSessionOrder(context, ['session-b']), true)
  assert.deepEqual(writes, [{
    accountKey: 'workspace-1',
    order: ['session-b', 'session-a', 'session-c'],
  }])

  context.sessionOrderByAccount['workspace-1'] = writes[0].order
  assert.equal(exports.syncPinnedSessionOrder(context, ['session-b']), false)
  assert.equal(writes.length, 1)
})

test('session quick actions expose accessible pin state and call native archive without opening the row', async () => {
  const { exports } = await loadBundle({}, {
    document: {
      createElement: tag => actionElement(tag),
      createElementNS: (_namespace, tag) => actionElement(tag),
    },
  })
  assert.equal(typeof exports.mountSessionQuickActions, 'function')

  const row = actionElement('div')
  const time = actionElement('span')
  const actionHost = actionElement('span')
  const menuRoot = actionElement('span')
  menuRoot.appendChild(actionElement('button'))
  actionHost.appendChild(menuRoot)
  row.append(time, actionHost)

  const toggled = []
  const archived = []
  const context = {
    sessionId: 'session-row',
    title: 'Pinned row',
    async archiveSession(sessionId) { archived.push(sessionId) },
  }
  const t = (key, params = {}) => `${key}:${params.title ?? ''}`
  assert.equal(exports.mountSessionQuickActions(
    row,
    context,
    ['session-row'],
    t,
    sessionId => { toggled.push(sessionId) },
  ), true)

  const actions = row.querySelector('[data-dsh-session-tools-actions]')
  assert.ok(actions)
  assert.equal(actions.children.length, 2)
  const [pin, archive] = actions.children
  assert.equal(pin.getAttribute('aria-pressed'), 'true')
  assert.equal(pin.getAttribute('aria-label'), 'unpin.aria:Pinned row')
  assert.equal(archive.getAttribute('aria-label'), 'archive.aria:Pinned row')
  assert.equal(actionHost.classList.contains('dsh-session-tools-row-actions-host'), true)
  assert.equal(time.classList.contains('dsh-session-tools-row-time'), true)

  const pinEvent = await pin.dispatch('click')
  const archiveEvent = await archive.dispatch('click')
  assert.equal(pinEvent.defaultPrevented, true)
  assert.equal(pinEvent.propagationStopped, true)
  assert.equal(archiveEvent.defaultPrevented, true)
  assert.equal(archiveEvent.propagationStopped, true)
  assert.deepEqual(toggled, ['session-row'])
  assert.deepEqual(archived, ['session-row'])
})

test('quick action refresh is mutation-free when state is unchanged and updates renamed rows', async () => {
  const { exports } = await loadBundle({}, {
    document: {
      createElement: tag => actionElement(tag),
      createElementNS: (_namespace, tag) => actionElement(tag),
    },
  })
  const row = actionElement('div')
  const actionHost = actionElement('span')
  const menuRoot = actionElement('span')
  menuRoot.appendChild(actionElement('button'))
  actionHost.appendChild(menuRoot)
  row.append(actionElement('span'), actionHost)
  const t = (key, params = {}) => `${key}:${params.title ?? ''}`
  const context = {
    sessionId: 'session-row',
    title: 'Draft title',
    async archiveSession() {},
  }

  exports.mountSessionQuickActions(row, context, [], t, () => {})
  const actions = row.querySelector('[data-dsh-session-tools-actions]')
  const [pin, archive] = actions.children
  const originalPinIcon = pin.children[0]

  exports.mountSessionQuickActions(
    row,
    { ...context, title: 'Final title' },
    [],
    t,
    () => {},
  )

  assert.equal(pin.children[0], originalPinIcon)
  assert.equal(row.dataset.dshSessionToolsPinned, 'false')
  assert.equal(pin.getAttribute('aria-label'), 'pin.aria:Final title')
  assert.equal(archive.getAttribute('aria-label'), 'archive.aria:Final title')
  assert.equal(archive.getAttribute('title'), 'archive.aria:Final title')
})

test('failed quick archive restores the button and exposes a recoverable error state', async () => {
  const warnings = []
  const { exports } = await loadBundle({}, {
    console: { warn(...args) { warnings.push(args) } },
    document: {
      createElement: tag => actionElement(tag),
      createElementNS: (_namespace, tag) => actionElement(tag),
    },
  })
  const row = actionElement('div')
  const actionHost = actionElement('span')
  const menuRoot = actionElement('span')
  menuRoot.appendChild(actionElement('button'))
  actionHost.appendChild(menuRoot)
  row.append(actionElement('span'), actionHost)
  const context = {
    sessionId: 'session-row',
    title: 'Archive failure',
    async archiveSession() { throw new Error('offline') },
  }
  exports.mountSessionQuickActions(
    row,
    context,
    [],
    key => key,
    () => {},
  )

  const archive = row.querySelector('[data-dsh-session-tools-actions]').children[1]
  await archive.dispatch('click')

  assert.equal(archive.disabled, false)
  assert.equal(archive.dataset.status, 'failed')
  assert.equal(archive.getAttribute('title'), 'archive.failed')
  assert.equal(warnings.length, 1)
})

test('browser apply restores pinned rows, mounts quick actions, and watches React list updates', async () => {
  const row = actionElement('div')
  const time = actionElement('span')
  const actionHost = actionElement('span')
  const menuRoot = actionElement('span')
  menuRoot.appendChild(actionElement('button'))
  actionHost.appendChild(menuRoot)
  row.append(time, actionHost)

  const writes = []
  const setSessionOrder = (accountKey, order) => {
    writes.push({ accountKey, order: Array.from(order) })
  }
  Object.defineProperty(row, '__reactFiber$test', {
    value: {
      memoizedProps: {},
      return: {
        memoizedProps: { node: { id: 'session-row', title: 'Pinned row' }, onArchive() {} },
        return: {
          memoizedProps: {
            sessionOrderByAccount: { 'workspace-1': ['session-other', 'session-row'] },
            setSessionOrder,
            workspaces: [{ workspaceId: 'workspace-1', sessionIds: ['session-other', 'session-row'] }],
          },
          return: { memoizedProps: { async archiveSession() {} }, return: null },
        },
      },
    },
  })

  let observed = false
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback }
    observe() { observed = true }
    disconnect() {}
  }
  const storage = {
    getItem() { return JSON.stringify(['session-row']) },
    setItem() {},
  }
  const { exports } = await loadBundle({}, {
    window: {
      localStorage: storage,
      addEventListener() {},
      removeEventListener() {},
    },
    document: {
      querySelectorAll(selector) { return selector === '[role="treeitem"]' ? [row] : [] },
      createElement: tag => actionElement(tag),
      createElementNS: (_namespace, tag) => actionElement(tag),
    },
    MutationObserver: FakeMutationObserver,
  })
  const ctx = {
    effect(start) { return start() },
    locale: {
      bind() { return (key, params = {}) => `${key}:${params.title ?? ''}` },
      register() { return () => {} },
    },
    slots: {
      inject(_name, mount) { return mount() },
      register() { return () => {} },
    },
  }

  exports.apply(ctx)

  assert.ok(row.querySelector('[data-dsh-session-tools-actions]'))
  assert.deepEqual(writes, [{
    accountKey: 'workspace-1',
    order: ['session-row', 'session-other'],
  }])
  assert.equal(observed, true)
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
