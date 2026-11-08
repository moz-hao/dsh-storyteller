import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  MAX_SESSIONS,
  StateStore,
  defaultSession,
  normalizeSession,
  resolveStorePath,
} from '../lib/state.js'

/** Create a throwaway store file path under the OS temp dir. */
function tempFile(name = 'state.json') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-'))
  return path.join(dir, name)
}

test('unknown session reads as defaults and writes nothing', () => {
  const file = tempFile()
  const store = new StateStore(file)
  const record = store.get('session-a')
  assert.equal(record.plain.on, false)
  assert.equal(record.tavern.on, false)
  assert.equal(fs.existsSync(file), false)
})

test('missing session id degrades to defaults', () => {
  const store = new StateStore(tempFile())
  assert.equal(store.get(undefined).tavern.on, false)
  assert.equal(store.get('').plain.on, false)
  assert.equal(store.get(42).plain.on, false)
})

test('update persists and a new store reads it back', () => {
  const file = tempFile()
  const store = new StateStore(file)
  store.update('session-a', (record) => {
    record.plain.on = true
    record.tavern.on = true
    record.tavern.scene = '雨夜的酒馆'
  })
  const reopened = new StateStore(file)
  const record = reopened.get('session-a')
  assert.equal(record.plain.on, true)
  assert.equal(record.tavern.scene, '雨夜的酒馆')
})

test('sessions are isolated from each other', () => {
  const file = tempFile()
  const store = new StateStore(file)
  store.update('session-a', (record) => {
    record.plain.on = true
  })
  store.update('session-b', (record) => {
    record.tavern.on = true
  })
  const reopened = new StateStore(file)
  assert.equal(reopened.get('session-a').plain.on, true)
  assert.equal(reopened.get('session-a').tavern.on, false)
  assert.equal(reopened.get('session-b').plain.on, false)
  assert.equal(reopened.get('session-b').tavern.on, true)
})

test('corrupt file is backed up and replaced by an empty store', () => {
  const file = tempFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{ this is not json', 'utf8')
  const store = new StateStore(file)
  assert.equal(store.get('session-a').plain.on, false)
  const backups = fs.readdirSync(path.dirname(file)).filter((name) => name.includes('.corrupt-'))
  assert.equal(backups.length, 1)
})

test('normalizeSession repairs garbage values', () => {
  const record = normalizeSession({
    plain: { on: 'yes', level: 'literary' },
    tavern: {
      on: 1,
      card: { name: ' 艾琳 ', bogus: 'x' },
      style: { pov: 'omniscient', length: 'epic', rating: 'xxx' },
      memory: [' 一条记忆 ', '', 7],
      relations: { 艾琳: '戒备', '': 'nobody' },
      statusBar: 'off',
    },
  })
  assert.equal(record.plain.on, false)
  assert.equal(record.plain.level, 'novel')
  assert.equal(record.tavern.on, false)
  assert.deepEqual(record.tavern.card, { name: '艾琳' })
  assert.equal(record.tavern.style.pov, 'third')
  assert.equal(record.tavern.style.length, 'medium')
  assert.equal(record.tavern.style.rating, 'general')
  assert.deepEqual(record.tavern.memory, ['一条记忆'])
  assert.deepEqual(record.tavern.relations, { 艾琳: '戒备' })
  assert.equal(record.tavern.statusBar, true)
})

test('oldest sessions are dropped past the cap', () => {
  const store = new StateStore(tempFile())
  for (let index = 0; index < MAX_SESSIONS + 3; index += 1) {
    store.update(`session-${index}`, (record) => {
      record.plain.on = true
    })
  }
  assert.equal(Object.keys(store.data.sessions).length, MAX_SESSIONS)
  assert.equal(store.data.sessions['session-0'], undefined)
  assert.notEqual(store.data.sessions[`session-${MAX_SESSIONS + 2}`], undefined)
})

test('resolveStorePath prefers the profile dir and falls back to DSH_HOME', () => {
  const withProfile = resolveStorePath({ DSH_PROFILE_DIR: 'C:\\p\\desktop' }, 'win32')
  assert.equal(withProfile, path.join('C:\\p\\desktop', 'plugin-data', 'dsh-storyteller', 'state.json'))
  const withHome = resolveStorePath({ DSH_HOME: 'C:\\h', DSH_PROFILE: 'web' }, 'win32')
  assert.equal(withHome, path.join('C:\\h', 'profiles', 'web', 'plugin-data', 'dsh-storyteller', 'state.json'))
})
