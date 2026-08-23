import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, inject } from '../lib/index.js'

function setup() {
  const definitions = []
  const archived = []
  const prepared = []
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
  }
  apply(ctx)
  return {
    archived,
    prepared,
    byName: name => definitions.find(definition => definition.name === name),
  }
}

function execution(id = 'session-current') {
  return {
    agent: { id },
    signal: new AbortController().signal,
  }
}

test('registers archive and read as globally available session tools', () => {
  const { byName } = setup()
  assert.deepEqual(inject, ['tools', 'workspaceRegistry', 'sessionReferenceResolver'])
  assert.ok(byName('session_archive'))
  assert.ok(byName('session_read'))
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
