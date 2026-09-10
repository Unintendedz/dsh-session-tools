import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { apply, inject } from '../lib/index.js'

function setup(targets = new Map()) {
  const definitions = []
  const archived = []
  const prepared = []
  const sessionListeners = new Set()
  const ctx = {
    tools: {
      register(definition) {
        definitions.push(definition)
        return () => {}
      },
    },
    workspaceRegistry: {
      async archiveSession(sessionId) { archived.push(sessionId) },
    },
    sessionReferenceResolver: {
      async prepare(agent, content, references, signal) {
        prepared.push({ agent, content, references, signal })
        return {
          content,
          additionalContext: {
            content: [{ type: 'text', text: 'bounded session snapshot' }],
          },
        }
      },
    },
    typert: {
      lookups: {
        get(key) {
          assert.equal(key, 'agent')
          return { resolve: async sessionId => targets.get(sessionId) }
        },
      },
    },
    on(name, listener) {
      assert.equal(name, 'session/event')
      sessionListeners.add(listener)
      return () => { sessionListeners.delete(listener) }
    },
  }
  apply(ctx)
  return {
    archived,
    prepared,
    emit(session, event) {
      session.events.push(event)
      for (const listener of [...sessionListeners]) listener(session, event)
    },
    byName: name => definitions.find(definition => definition.name === name),
  }
}

function execution(id = 'session-current', signal = new AbortController().signal) {
  return {
    agent: { id },
    signal,
  }
}

function relay(id, senderSessionId) {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text: 'relay' }],
    source: {
      kind: 'plugin',
      plugin: 'dsh-session-tools',
      form: 'relay',
      senderSessionId,
    },
  }
}

test('session_wait reads the current snapshot of a native DSH Session', {
  skip: !process.env.DSH_NATIVE_ROOT && 'set DSH_NATIVE_ROOT for native Session integration',
}, async () => {
  const { Session } = await import(pathToFileURL(`${process.env.DSH_NATIVE_ROOT}/node_modules/@deepseek-ai/dsh-session/lib/index.js`))
  const session = Session.create ? Session.create('session-native-snapshot') : new Session('session-native-snapshot')
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('user/message', relay('request-native', 'session-sender'), { surfaceOp: 'append' })
  const target = { id: session.id, session, status: 'running', inbox: { nextTurn: [], nextStep: [] } }
  const { byName } = setup(new Map([[target.id, target]]))
  const args = { session_id: target.id, request_id: 'request-native', timeout_seconds: 0 }
  const pending = await byName('session_wait').execute(args, execution('session-sender'))
  assert.equal(pending.status, 'running')
  assert.equal(pending.content, '')
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: {
    id: 'native-answer', role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'test' },
    content: [{ type: 'text', text: 'Synthetic native reply.' }],
  } }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.deepEqual(await byName('session_wait').execute(args, execution('session-sender')), {
    session_id: target.id, request_id: 'request-native', status: 'completed',
    reason: 'completed', content: 'Synthetic native reply.',
  })
})

test('registers send and wait beside the existing globally available session tools', () => {
  const { byName } = setup()
  assert.deepEqual(inject, ['tools', 'workspaceRegistry', 'sessionReferenceResolver', 'typert'])
  assert.ok(byName('session_archive'))
  assert.ok(byName('session_read'))
  assert.ok(byName('session_send'))
  assert.ok(byName('session_wait'))
})

test('session_wait returns only visible assistant text from the request turn', async () => {
  const requestId = 'request-completed'
  const target = {
    id: 'session-target',
    status: 'idle',
    session: {
      header: {},
      events: [
        { type: 'turn/start', data: { turn: 7 } },
        { type: 'step/start', data: { turn: 7, step: 1 } },
        {
          type: 'user/message',
          data: {
            id: requestId,
            role: 'user',
            content: [{ type: 'text', text: 'relay' }],
            source: {
              kind: 'plugin', plugin: 'dsh-session-tools', form: 'relay', senderSessionId: 'session-sender',
            },
          },
        },
        {
          type: 'assistant/message',
          data: {
            turn: 7,
            step: 1,
            message: {
              content: [
                { type: 'reasoning', reasoning: 'private chain' },
                { type: 'text', text: 'Visible first part.' },
                { type: 'tool-call', id: 'call-1', name: 'bash', arguments: '{}' },
              ],
            },
          },
        },
        { type: 'step/end', data: { turn: 7, step: 1 } },
        { type: 'step/start', data: { turn: 7, step: 2 } },
        {
          type: 'assistant/message',
          data: {
            turn: 7,
            step: 2,
            message: { content: [{ type: 'text', text: 'Visible final part.' }] },
          },
        },
        { type: 'step/end', data: { turn: 7, step: 2 } },
        { type: 'turn/end', data: { turn: 7, reason: { kind: 'completed' } } },
      ],
    },
    inbox: { nextTurn: [], nextStep: [] },
  }
  const { byName } = setup(new Map([[target.id, target]]))

  assert.deepEqual(await byName('session_wait').execute({
    session_id: target.id,
    request_id: requestId,
    timeout_seconds: 0,
  }, execution('session-sender')), {
    session_id: target.id,
    request_id: requestId,
    status: 'completed',
    content: 'Visible first part.\nVisible final part.',
    reason: 'completed',
  })
})

test('session_wait bounds a large visible reply without splitting UTF-8 text', async () => {
  const request = relay('request-large', 'session-sender')
  const target = {
    id: 'session-target',
    status: 'idle',
    session: {
      header: {},
      events: [
        { type: 'turn/start', data: { turn: 8 } },
        { type: 'step/start', data: { turn: 8, step: 1 } },
        { type: 'user/message', data: request },
        {
          type: 'assistant/message',
          data: {
            turn: 8,
            step: 1,
            message: { content: [{ type: 'text', text: '界'.repeat(30_000) }] },
          },
        },
        { type: 'step/end', data: { turn: 8, step: 1 } },
        { type: 'turn/end', data: { turn: 8, reason: { kind: 'completed' } } },
      ],
    },
    inbox: { nextTurn: [], nextStep: [] },
  }
  const { byName } = setup(new Map([[target.id, target]]))

  const result = await byName('session_wait').execute({
    session_id: target.id,
    request_id: request.id,
    timeout_seconds: 0,
  }, execution('session-sender'))

  assert.equal(result.status, 'completed')
  assert.ok(Buffer.byteLength(result.content, 'utf8') <= 65_536)
  assert.match(result.content, /reply truncated/u)
  assert.equal(result.content.includes('�'), false)
})

test('session_wait reports a queued request that was cancelled before its turn as failed', async () => {
  const request = relay('request-cancelled', 'session-sender')
  const target = {
    id: 'session-target',
    status: 'idle',
    session: {
      header: {},
      events: [
        {
          type: 'agent/inbox/spliced',
          data: { target: 'next-turn', start: 0, inserted: [request] },
        },
        {
          type: 'agent/inbox/spliced',
          data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [], outcome: 'canceled' },
        },
      ],
    },
    inbox: { nextTurn: [], nextStep: [] },
  }
  const { byName } = setup(new Map([[target.id, target]]))

  assert.deepEqual(await byName('session_wait').execute({
    session_id: target.id,
    request_id: request.id,
    timeout_seconds: 0,
  }, execution('session-sender')), {
    session_id: target.id,
    request_id: request.id,
    status: 'failed',
    content: '',
    reason: 'canceled',
  })
})

test('session_wait keeps a claimed request running before its user event is appended', async () => {
  const request = relay('request-claimed', 'session-sender')
  const target = {
    id: 'session-target',
    status: 'running',
    session: {
      header: {},
      events: [
        {
          type: 'agent/inbox/spliced',
          data: { target: 'next-turn', start: 0, inserted: [request] },
        },
        {
          type: 'agent/inbox/spliced',
          data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] },
        },
      ],
    },
    inbox: { nextTurn: [], nextStep: [] },
  }
  const { byName } = setup(new Map([[target.id, target]]))

  assert.deepEqual(await byName('session_wait').execute({
    session_id: target.id,
    request_id: request.id,
    timeout_seconds: 0,
  }, execution('session-sender')), {
    session_id: target.id,
    request_id: request.id,
    status: 'running',
    content: '',
  })
})

test('session_wait wakes a restored queued request and waits for its exact turn end', async () => {
  const request = relay('request-restored', 'session-sender')
  let publish
  let wakeCount = 0
  const target = {
    id: 'session-target',
    status: 'idle',
    session: { header: {}, events: [] },
    inbox: {
      nextTurn: [request],
      nextStep: [],
      remove(id) {
        const index = this.nextTurn.findIndex(message => message.id === id)
        if (index < 0) return false
        this.nextTurn.splice(index, 1)
        return true
      },
    },
    followup(message) {
      wakeCount += 1
      this.inbox.nextTurn.push(message)
      this.status = 'running'
      queueMicrotask(() => publish())
    },
  }
  const environment = setup(new Map([[target.id, target]]))
  publish = () => {
    target.inbox.nextTurn.shift()
    environment.emit(target.session, { type: 'turn/start', data: { turn: 1 } })
    environment.emit(target.session, { type: 'step/start', data: { turn: 1, step: 1 } })
    environment.emit(target.session, { type: 'user/message', data: request })
    environment.emit(target.session, {
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        message: { content: [{ type: 'text', text: 'Restored request finished.' }] },
      },
    })
    environment.emit(target.session, { type: 'step/end', data: { turn: 1, step: 1 } })
    environment.emit(target.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
    target.status = 'idle'
  }

  assert.deepEqual(await environment.byName('session_wait').execute({
    session_id: target.id,
    request_id: request.id,
    timeout_seconds: 1,
  }, execution('session-sender')), {
    session_id: target.id,
    request_id: request.id,
    status: 'completed',
    content: 'Restored request finished.',
    reason: 'completed',
  })
  assert.equal(wakeCount, 1)
  assert.deepEqual(target.inbox.nextTurn, [])
})

test('session_wait returns running only after its timeout without cancelling the target', async () => {
  const request = relay('request-running', 'session-sender')
  let cancelled = false
  const target = {
    id: 'session-target',
    status: 'running',
    session: {
      header: {},
      events: [
        { type: 'turn/start', data: { turn: 3 } },
        { type: 'step/start', data: { turn: 3, step: 1 } },
        { type: 'user/message', data: request },
      ],
    },
    inbox: { nextTurn: [], nextStep: [] },
    cancel() { cancelled = true },
  }
  const { byName } = setup(new Map([[target.id, target]]))
  const started = performance.now()

  assert.deepEqual(await byName('session_wait').execute({
    session_id: target.id,
    request_id: request.id,
    timeout_seconds: 0.02,
  }, execution('session-sender')), {
    session_id: target.id,
    request_id: request.id,
    status: 'running',
    content: '',
  })
  assert.ok(performance.now() - started >= 10)
  assert.equal(cancelled, false)
})

test('session_wait rejects a cross-session wait cycle and releases the first wait on cancellation', async () => {
  const requestAB = relay('request-a-to-b', 'session-a')
  const requestBA = relay('request-b-to-a', 'session-b')
  const targetA = {
    id: 'session-a',
    status: 'running',
    session: {
      header: {},
      events: [
        { type: 'turn/start', data: { turn: 1 } },
        { type: 'step/start', data: { turn: 1, step: 1 } },
        { type: 'user/message', data: requestBA },
      ],
    },
    inbox: { nextTurn: [], nextStep: [] },
  }
  const targetB = {
    id: 'session-b',
    status: 'running',
    session: {
      header: {},
      events: [
        { type: 'turn/start', data: { turn: 2 } },
        { type: 'step/start', data: { turn: 2, step: 1 } },
        { type: 'user/message', data: requestAB },
      ],
    },
    inbox: { nextTurn: [], nextStep: [] },
  }
  const { byName } = setup(new Map([[targetA.id, targetA], [targetB.id, targetB]]))
  const tool = byName('session_wait')
  const firstController = new AbortController()
  const first = tool.execute({
    session_id: targetB.id,
    request_id: requestAB.id,
    timeout_seconds: 1,
  }, execution(targetA.id, firstController.signal)).catch(error => error)
  await new Promise(resolve => setImmediate(resolve))

  const secondController = new AbortController()
  const fallback = setTimeout(() => secondController.abort(new Error('cycle test timeout')), 20)
  await assert.rejects(() => tool.execute({
    session_id: targetA.id,
    request_id: requestBA.id,
    timeout_seconds: 1,
  }, execution(targetB.id, secondController.signal)), /wait cycle/)
  clearTimeout(fallback)

  firstController.abort(new Error('first wait cleanup'))
  assert.match(String(await first), /first wait cleanup/)
})

test('session_wait validates ownership and arguments before blocking', async () => {
  const request = relay('request-owned', 'session-other-sender')
  let resolutions = 0
  const target = {
    id: 'session-target',
    status: 'idle',
    session: {
      header: {},
      events: [
        { type: 'turn/start', data: { turn: 1 } },
        { type: 'step/start', data: { turn: 1, step: 1 } },
        { type: 'user/message', data: request },
        { type: 'step/end', data: { turn: 1, step: 1 } },
        { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      ],
    },
    inbox: { nextTurn: [], nextStep: [] },
  }
  const targets = new Map([[target.id, target]])
  const { byName } = setup({
    get(sessionId) {
      resolutions += 1
      return targets.get(sessionId)
    },
  })
  const tool = byName('session_wait')

  await assert.rejects(() => tool.execute({
    session_id: target.id,
    request_id: '',
  }, execution('session-sender')), /request_id.*non-empty/)
  await assert.rejects(() => tool.execute({
    session_id: target.id,
    request_id: request.id,
    timeout_seconds: 601,
  }, execution('session-sender')), /0 to 600/)
  await assert.rejects(() => tool.execute({
    session_id: target.id,
    request_id: request.id,
    extra: true,
  }, execution('session-sender')), /unknown argument/)
  await assert.rejects(() => tool.execute({
    session_id: 'session-sender',
    request_id: request.id,
  }, execution('session-sender')), /calling session itself/)

  const stopped = new AbortController()
  stopped.abort(new Error('wait stopped'))
  await assert.rejects(() => tool.execute({
    session_id: target.id,
    request_id: request.id,
  }, execution('session-sender', stopped.signal)), /wait stopped/)
  assert.equal(resolutions, 0)

  await assert.rejects(() => tool.execute({
    session_id: target.id,
    request_id: request.id,
    timeout_seconds: 0,
  }, execution('session-sender')), /sent by another session/)
  assert.equal(resolutions, 1)
})

test('session_send queues one identified relay on the target session', async () => {
  const target = {
    id: 'session-target',
    session: { header: {}, events: [] },
    inbox: { nextTurn: [], nextStep: [] },
    followup(message) { this.inbox.nextTurn.push(message) },
  }
  const { byName } = setup(new Map([[target.id, target]]))

  const result = await byName('session_send').execute({
    session_id: target.id,
    message: 'Check the release state.',
  }, execution('session-sender'))

  assert.equal(result.session_id, target.id)
  assert.equal(result.queued, true)
  assert.match(result.request_id, /^[0-9a-f-]{36}$/u)
  assert.deepEqual(target.inbox.nextTurn, [{
    id: result.request_id,
    role: 'user',
    content: [{
      type: 'text',
      text: 'Message from DSH session session-sender:\n\nCheck the release state.',
    }],
    source: {
      kind: 'plugin',
      plugin: 'dsh-session-tools',
      form: 'relay',
      senderSessionId: 'session-sender',
    },
  }])
})

test('session_send rejects unsafe targets before queuing a relay', async () => {
  const target = {
    id: 'session-subagent',
    session: { header: { origin: 'subagent' }, events: [] },
    inbox: { nextTurn: [], nextStep: [] },
    followup(message) { this.inbox.nextTurn.push(message) },
  }
  const { byName } = setup(new Map([[target.id, target]]))
  const tool = byName('session_send')

  await assert.rejects(() => tool.execute({
    session_id: 'session-sender',
    message: 'self',
  }, execution('session-sender')), /another session/)
  await assert.rejects(() => tool.execute({
    session_id: target.id,
    message: 'wrong route',
  }, execution('session-sender')), /subagent.*send_message/)
  await assert.rejects(() => tool.execute({
    session_id: 'session-missing',
    message: 'missing',
  }, execution('session-sender')), /not found/)
  assert.deepEqual(target.inbox.nextTurn, [])
})

test('session_send rejects malformed arguments before resolving the target', async () => {
  let resolutions = 0
  const target = {
    id: 'session-target',
    session: { header: {}, events: [] },
    inbox: { nextTurn: [], nextStep: [] },
    followup(message) { this.inbox.nextTurn.push(message) },
  }
  const targets = new Map([[target.id, target]])
  const { byName } = setup({
    get(sessionId) {
      resolutions += 1
      return targets.get(sessionId)
    },
  })
  const tool = byName('session_send')

  await assert.rejects(() => tool.execute({ session_id: target.id, message: '  ' }, execution()), /message.*non-empty/)
  await assert.rejects(() => tool.execute({ session_id: target.id, message: 'ok', extra: true }, execution()), /unknown argument/)
  await assert.rejects(() => tool.execute({ message: 'missing id' }, execution()), /session_id/)
  assert.equal(resolutions, 0)
  assert.deepEqual(target.inbox.nextTurn, [])
})

test('session_send does not deliver when the caller is cancelled during target resolution', async () => {
  let resolveTarget
  const target = {
    id: 'session-target',
    session: { header: {}, events: [] },
    inbox: { nextTurn: [], nextStep: [] },
    followup(message) { this.inbox.nextTurn.push(message) },
  }
  const { byName } = setup({
    get() { return new Promise(resolve => { resolveTarget = resolve }) },
  })
  const controller = new AbortController()
  const sending = byName('session_send').execute({
    session_id: target.id,
    message: 'Do not deliver after cancellation.',
  }, execution('session-sender', controller.signal))
  await new Promise(resolve => setImmediate(resolve))

  controller.abort(new Error('sender stopped'))
  resolveTarget(target)

  await assert.rejects(() => sending, /sender stopped/)
  assert.deepEqual(target.inbox.nextTurn, [])
})

test('session_archive defaults to the caller and accepts another session id', async () => {
  const { archived, byName } = setup()
  const tool = byName('session_archive')

  assert.deepEqual(await tool.execute({}, execution()), {
    session_id: 'session-current',
    archived: true,
  })
  assert.deepEqual(await tool.execute({ session_id: 'session-other' }, execution()), {
    session_id: 'session-other',
    archived: true,
  })
  assert.deepEqual(archived, ['session-current', 'session-other'])
})

test('session_read returns the bounded cross-session snapshot and forwards cancellation', async () => {
  const { prepared, byName } = setup()
  const tool = byName('session_read')
  const exec = execution()

  assert.deepEqual(await tool.execute({ session_id: 'session-source' }, exec), {
    session_id: 'session-source',
    content: 'bounded session snapshot',
  })
  assert.deepEqual(prepared, [{
    agent: exec.agent,
    content: [],
    references: [{ sessionId: 'session-source', label: 'session-source' }],
    signal: exec.signal,
  }])
  assert.deepEqual(tool.output.render({}, {
    session_id: 'session-source',
    content: 'bounded session snapshot',
  }), [{ type: 'text', text: 'bounded session snapshot' }])
})

test('tool executors reject missing, blank, and unknown arguments before changing state', async () => {
  const { archived, prepared, byName } = setup()
  await assert.rejects(() => byName('session_archive').execute({ session_id: '  ' }, execution()), /non-empty/)
  await assert.rejects(() => byName('session_archive').execute({ extra: true }, execution()), /unknown argument/)
  await assert.rejects(() => byName('session_read').execute({}, execution()), /session_id/)
  await assert.rejects(() => byName('session_read').execute({ session_id: '', extra: true }, execution()), /unknown argument/)
  assert.deepEqual(archived, [])
  assert.deepEqual(prepared, [])
})

for (const kind of ['aborted', 'error', 'blocked']) {
  test(`session_wait recognizes ${kind} after claim but before user/message`, async () => {
    const request = relay(`claimed-${kind}`, 'session-sender')
    const target = {
      id: 'session-target', status: 'running',
      session: { header: {}, events: [
        { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [request] } },
        { type: 'turn/start', data: { turn: 9 } },
        { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
      ] },
      inbox: { nextTurn: [], nextStep: [] },
    }
    const environment = setup(new Map([[target.id, target]]))
    const tool = environment.byName('session_wait')
    const args = { session_id: target.id, request_id: request.id, timeout_seconds: 0 }
    assert.equal((await tool.execute(args, execution('session-sender'))).status, 'running')
    await assert.rejects(() => tool.execute(args, execution('session-intruder')), /another session/)
    const waiting = tool.execute({ ...args, timeout_seconds: 1 }, execution('session-sender'))
    await new Promise(resolve => setImmediate(resolve))
    environment.emit(target.session, { type: 'turn/end', data: { turn: 9, reason: { kind } } })
    target.status = 'idle'
    assert.deepEqual(await waiting, {
      session_id: target.id, request_id: request.id, status: 'failed', content: '', reason: kind,
    })
  })
}

test('native session_wait output preserves status, failure reason and partial reply', () => {
  const tool = setup().byName('session_wait')
  for (const [status, reason] of [['completed', 'completed'], ['failed', 'aborted'], ['failed', 'error'], ['running', undefined]]) {
    const rendered = tool.output.render({}, {
      session_id: 'session-target', request_id: 'request-partial', status, reason, content: 'Synthetic partial reply.',
    }).map(block => block.text).join('')
    assert.ok(rendered.includes(status))
    if (reason) assert.ok(rendered.includes(reason))
    assert.ok(rendered.includes('Synthetic partial reply.'))
  }
})
