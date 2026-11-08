import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { StateStore } from '../lib/state.js'

/** A store over a throwaway file. */
function store() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-watch-'))
  return { store: new StateStore(path.join(dir, 'state.json')), file: path.join(dir, 'state.json') }
}

/** Write a whole state document, as an external editor would. */
function writeState(file, sessions) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ version: 1, sessions }, null, 2), 'utf8')
  // Push the mtime forward so the change is visible even on a coarse clock.
  const next = new Date(Date.now() + 1000)
  fs.utimesSync(file, next, next)
}

test('an external edit is picked up without recreating the store', () => {
  const { store: s, file } = store()
  s.update('session-a', (record) => {
    record.tavern.on = true
  })
  assert.equal(s.get('session-b').tavern.on, false)

  writeState(file, {
    'session-b': { updatedAt: new Date().toISOString(), tavern: { on: true, setup: 'done' } },
  })

  assert.equal(s.get('session-b').tavern.on, true)
  assert.equal(s.get('session-b').tavern.setup, 'done')
})

test('our own writes do not trigger a reload loop', () => {
  const { store: s, file } = store()
  s.update('session-a', (record) => {
    record.plain.on = true
  })
  const before = fs.statSync(file).mtimeMs
  assert.equal(s.get('session-a').plain.on, true)
  s.update('session-a', (record) => {
    record.plain.level = 'plain'
  })
  assert.equal(s.get('session-a').plain.level, 'plain')
  assert.ok(fs.statSync(file).mtimeMs >= before)
})

test('an edit that removes the file degrades instead of throwing', () => {
  const { store: s, file } = store()
  s.update('session-a', (record) => {
    record.plain.on = true
  })
  fs.rmSync(file)
  assert.equal(s.get('session-a').plain.on, true)
  assert.equal(s.get('session-b').plain.on, false)
})

test('a corrupt external rewrite is backed up rather than crashing the turn', () => {
  const { store: s, file } = store()
  s.update('session-a', (record) => {
    record.plain.on = true
  })
  fs.writeFileSync(file, '{ broken', 'utf8')
  const next = new Date(Date.now() + 1000)
  fs.utimesSync(file, next, next)
  assert.equal(s.get('session-a').plain.on, false)
  const backups = fs.readdirSync(path.dirname(file)).filter((name) => name.includes('.corrupt-'))
  assert.equal(backups.length, 1)
})
