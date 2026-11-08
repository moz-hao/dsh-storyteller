import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import * as plugin from '../lib/index.js'

/** Minimal stand-in for the host's cordis context. */
function fakeHost() {
  const commandMap = new Map()
  const host = {
    sections: new Map(),
    commands: new Map(),
    tools: new Map(),
    warnings: [],
    effects: [],
  }
  host.logger = {
    warn: (...args) => host.warnings.push(args.join(' ')),
    info: () => {},
  }
  host.get = () => undefined
  host.on = () => () => {}
  host.effect = (fn) => {
    const dispose = fn?.()
    return typeof dispose === 'function' ? dispose : () => {}
  }
  host.systemPrompt = {
    section(definition) {
      host.sections.set(definition.name, definition)
      return () => host.sections.delete(definition.name)
    },
  }
  host.commands = {
    register(definition) {
      commandMap.set(definition.name, definition)
      return () => commandMap.delete(definition.name)
    },
  }
  host.commands.get = (commandName) => commandMap.get(commandName)
  host.commands.keys = () => commandMap.keys()
  host.commands.values = () => commandMap.values()
  const tools = {
    register(definition, options) {
      host.tools.set(definition.name, { definition, options })
      return () => host.tools.delete(definition.name)
    },
  }
  host.inject = (dependencies, callback) => {
    host.injected = dependencies
    return callback({ ...host, tools, effect: host.effect, logger: host.logger, get: host.get })
  }
  return host
}

/** Session scope the prompt assembly hands to a section's text function. */
function scope(sessionId) {
  return { agent: { session: { id: sessionId } } }
}

/** Resolve every registered section's text for one session. */
function assemble(host, sessionId) {
  const parts = []
  for (const definition of host.sections.values()) {
    const text = typeof definition.text === 'function' ? definition.text(scope(sessionId)) : definition.text
    if (typeof text === 'string' && text.length > 0) parts.push(text)
  }
  return parts.join('\n\n')
}

/** A host mounted against a throwaway state file. */
function mounted() {
  const host = fakeHost()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-mount-'))
  const statePath = path.join(dir, 'state.json')
  plugin.apply(host, { statePath })
  return { host, statePath }
}

test('the plugin declares its identity and injected services', () => {
  assert.equal(plugin.name, 'storyteller')
  assert.ok(plugin.inject.includes('systemPrompt'))
  assert.ok(plugin.inject.includes('commands'))
})

test('mounting registers two sections and three commands', () => {
  const { host } = mounted()
  assert.deepEqual([...host.sections.keys()].sort(), ['storyteller:plain', 'storyteller:tavern'])
  assert.deepEqual([...host.commands.keys()].sort(), ['plain', 'story', 'tavern'])
  for (const definition of host.commands.values()) {
    assert.equal(typeof definition.handler, 'function')
    assert.ok(definition.description.length > 0)
  }
})

test('a session that never opted in assembles to nothing', () => {
  const { host } = mounted()
  assert.equal(assemble(host, 'session-untouched'), '')
})

test('switching a feature on changes that session only', () => {
  const { host } = mounted()
  host.commands.get('plain').handler({ agent: { session: { id: 'session-a' } }, rawInput: ' on' })
  assert.match(assemble(host, 'session-a'), /说人话/)
  assert.equal(assemble(host, 'session-b'), '')
})

test('tavern mode assembles the full block after /tavern on', () => {
  const { host } = mounted()
  const agent = { session: { id: 'session-a' } }
  host.commands.get('tavern').handler({ agent, rawInput: ' on' })
  host.commands.get('tavern').handler({ agent, rawInput: ' set name 艾琳' })
  host.commands.get('tavern').handler({ agent, rawInput: ' set scene 雨夜的酒馆' })
  const text = assemble(host, 'session-a')
  assert.match(text, /酒馆模式/)
  assert.match(text, /艾琳/)
  assert.match(text, /雨夜的酒馆/)
  assert.match(text, /状态条/)
})

test('command results reach the UI as text, and errors stay errors', () => {
  const { host } = mounted()
  const agent = { session: { id: 'session-a' } }
  const ok = host.commands.get('tavern').handler({ agent, rawInput: ' on' })
  assert.equal(ok.kind, 'success')
  assert.ok(ok.text.length > 0)
  const bad = host.commands.get('tavern').handler({ agent, rawInput: ' dance' })
  assert.equal(bad.kind, 'error')
})

test('state survives a remount, which is what makes it per-session durable', () => {
  const first = mounted()
  first.host.commands.get('plain').handler({ agent: { session: { id: 'session-a' } }, rawInput: ' on' })
  const second = fakeHost()
  plugin.apply(second, { statePath: first.statePath })
  assert.match(assemble(second, 'session-a'), /说人话/)
  assert.equal(assemble(second, 'session-b'), '')
})

test('commands without an agent do not throw', () => {
  const { host } = mounted()
  const result = host.commands.get('tavern').handler({ rawInput: ' on' })
  assert.equal(result.kind, 'error')
})

test('the bridge never writes outside its state file', () => {
  const { host, statePath } = mounted()
  host.commands.get('story').handler({ agent: { session: { id: 'session-a' } }, rawInput: '' })
  assert.equal(fs.existsSync(statePath), false)
})

test('the slash hint advertises every shipped subcommand', () => {
  const { host } = mounted()
  const hint = host.commands.get('tavern').input.hint
  for (const word of ['erotic', 'choices', 'statusbar', 'dice', 'setup', 'lang', 'card', 'memory', 'relation', 'style', 'reset', 'preview', 'status']) {
    assert.ok(hint.includes(word), `hint is missing "${word}": ${hint}`)
  }
  assert.ok(host.commands.get('plain').input.hint.includes('lang'))
})

test('story_state is registered without the host defineTool helper', () => {
  const { host } = mounted()
  const entry = host.tools.get('story_state')
  assert.notEqual(entry, undefined)
  assert.equal(entry.definition.parameters.type, 'object')
  assert.equal(typeof entry.options.when, 'function')
  assert.equal(entry.options.when({ agent: { session: { id: 'session-off' } } }), false)
  host.commands.get('tavern').handler({ agent: { session: { id: 'session-on' } }, rawInput: ' on' })
  assert.equal(entry.options.when({ agent: { session: { id: 'session-on' } } }), true)
})

test('switching a run on also enqueues the director note, so the turn starts', () => {
  const { host } = mounted()
  const queued = []
  const agent = { session: { id: 'session-kick' }, followup: (message) => queued.push(message) }

  host.commands.get('tavern').handler({ agent, rawInput: ' on' })
  assert.equal(queued.length, 1)
  assert.match(queued[0].content[0].text, /设定/)
  assert.equal(queued[0].source.kind, 'user')

  // Already on: a second toggle must not spam the transcript.
  host.commands.get('tavern').handler({ agent, rawInput: ' on' })
  assert.equal(queued.length, 1)

  // Read-only subcommands never start a turn.
  host.commands.get('tavern').handler({ agent, rawInput: ' status' })
  host.commands.get('plain').handler({ agent, rawInput: ' on' })
  assert.equal(queued.length, 1)
})

test('a tavern subcommand that auto-enables also kicks the run off', () => {
  const { host } = mounted()
  const queued = []
  const agent = { session: { id: 'session-kick2' }, followup: (message) => queued.push(message) }
  host.commands.get('tavern').handler({ agent, rawInput: ' erotic on' })
  assert.equal(queued.length, 1)
})

test('a host without followup still works', () => {
  const { host } = mounted()
  const result = host.commands.get('tavern').handler({ agent: { session: { id: 'session-nofollow' } }, rawInput: ' on' })
  assert.equal(result.kind, 'success')
})
