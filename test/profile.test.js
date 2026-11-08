import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import * as plugin from '../lib/index.js'
import { StateStore } from '../lib/state.js'
import { handleTavern } from '../lib/grammar.js'
import { defaultSession } from '../lib/state.js'

/** A host whose only interesting service tells us the profile directory. */
function hostWithProfile(dir) {
  const commandMap = new Map()
  const host = {
    sections: new Map(),
    tools: new Map(),
    warnings: [],
  }
  host.logger = { warn: (...args) => host.warnings.push(args.join(' ')), info: () => {} }
  host.get = (name) => (name === 'profileContext' ? { dir } : undefined)
  host.effect = (fn) => {
    const dispose = fn?.()
    return typeof dispose === 'function' ? dispose : () => {}
  }
  host.systemPrompt = { section: (definition) => (host.sections.set(definition.name, definition), () => {}) }
  host.commands = {
    register(definition) {
      commandMap.set(definition.name, definition)
      return () => commandMap.delete(definition.name)
    },
    get: (name) => commandMap.get(name),
    keys: () => commandMap.keys(),
    values: () => commandMap.values(),
  }
  host.inject = (deps, callback) => callback({ ...host, tools: { register: () => () => {} } })
  return host
}

test('the store lives under the live profile, not a guessed default', () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-profile-'))
  const host = hostWithProfile(profileDir)
  plugin.apply(host, {})
  host.commands.get('tavern').handler({ agent: { session: { id: 'session-x' } }, rawInput: ' on' })
  const expected = path.join(profileDir, 'plugin-data', 'dsh-storyteller', 'state.json')
  assert.equal(fs.existsSync(expected), true, `expected ${expected}`)
})

test('a state file left in profiles/default is migrated once', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-home-'))
  const legacyDir = path.join(home, 'profiles', 'default', 'plugin-data', 'dsh-storyteller')
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(
    path.join(legacyDir, 'state.json'),
    JSON.stringify({ version: 1, sessions: { 'session-old': { tavern: { on: true, erotic: true } } } }),
    'utf8',
  )

  const profileDir = path.join(home, 'profiles', 'desktop')
  fs.mkdirSync(profileDir, { recursive: true })

  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const host = hostWithProfile(profileDir)
    plugin.apply(host, {})
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }

  const migrated = path.join(profileDir, 'plugin-data', 'dsh-storyteller', 'state.json')
  assert.equal(fs.existsSync(migrated), true)
  const store = new StateStore(migrated)
  assert.equal(store.get('session-old').tavern.erotic, true)
})

test('a tavern subcommand on an idle session switches tavern mode on', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-sub-'))
  const store = new StateStore(path.join(dir, 'state.json'))
  const result = handleTavern(store, 'session-a', 'erotic on')
  assert.equal(result.kind, 'success')
  const record = store.get('session-a')
  assert.equal(record.tavern.erotic, true)
  assert.equal(record.tavern.on, true)
  assert.equal(record.plain.on, true)
  assert.match(result.text, /酒馆模式/)
})

test('reset and status do not silently switch tavern mode on', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-sub2-'))
  const store = new StateStore(path.join(dir, 'state.json'))
  handleTavern(store, 'session-a', 'status')
  assert.equal(store.get('session-a').tavern.on, false)
  handleTavern(store, 'session-a', 'reset')
  assert.equal(store.get('session-a').tavern.on, false)
  assert.equal(defaultSession().tavern.on, false)
})


