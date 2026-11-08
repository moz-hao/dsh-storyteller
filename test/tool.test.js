import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { StateStore, defaultSession } from '../lib/state.js'
import { createStoryStateTool, applyStoryStatePatch, storyStateVisible } from '../lib/tool.js'

/** A stand-in for `defineTool` that keeps the definition inspectable. */
function stubDefineTool(options) {
  return options
}

/** Store over a throwaway file. */
function store() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-tool-'))
  return new StateStore(path.join(dir, 'state.json'))
}

/** Fake tool execution metadata. */
function exec(sessionId) {
  return { agent: { session: { id: sessionId } }, signal: { aborted: false } }
}

test('the tool is only visible for sessions with tavern mode on', () => {
  const s = store()
  assert.equal(storyStateVisible(s, { session: { id: 'session-1' } }), false)
  s.update('session-1', (record) => {
    record.tavern.on = true
  })
  assert.equal(storyStateVisible(s, { session: { id: 'session-1' } }), true)
  assert.equal(storyStateVisible(s, { session: { id: 'session-2' } }), false)
  assert.equal(storyStateVisible(s, undefined), false)
})

test('the definition is schema-valid shaped', () => {
  const definition = createStoryStateTool({ defineTool: stubDefineTool, store: store() })
  assert.equal(definition.name, 'story_state')
  assert.ok(definition.description.length > 20)
  assert.deepEqual(definition.parameters.action.enum, ['read', 'patch'])
  assert.equal(definition.parameters.action.required, true)
  assert.equal(definition.parameters.relations.items.type, 'object')
  assert.equal(definition.parameters.relations.items.additionalProperties, false)
  assert.equal(typeof definition.execute, 'function')
  assert.equal(typeof definition.output.render, 'function')
})

test('read returns the current state and never writes', () => {
  const s = store()
  s.update('session-1', (record) => {
    record.tavern.on = true
    record.tavern.scene = '雨夜的酒馆'
    record.tavern.memory = ['艾琳左肩有旧伤']
    record.tavern.relations = { 艾琳: '戒备' }
  })
  const definition = createStoryStateTool({ defineTool: stubDefineTool, store: s })
  const value = definition.execute({ action: 'read' }, exec('session-1'))
  assert.equal(value.ok, true)
  assert.equal(value.scene, '雨夜的酒馆')
  assert.deepEqual(value.memory, ['艾琳左肩有旧伤'])
  assert.equal(value.relations['艾琳'], '戒备')
})

test('patch appends memory and merges relations for that session only', () => {
  const s = store()
  s.update('session-1', (record) => {
    record.tavern.on = true
  })
  const definition = createStoryStateTool({ defineTool: stubDefineTool, store: s })
  const value = definition.execute(
    {
      action: 'patch',
      scene: '后厨，油锅还响着',
      memory: ['吧台下藏着一把枪'],
      relations: [{ name: '艾琳', attitude: '戒备→松动' }],
      notes: '这一夜要出事',
    },
    exec('session-1'),
  )
  assert.equal(value.ok, true)
  assert.equal(s.get('session-1').tavern.scene, '后厨，油锅还响着')
  assert.deepEqual(s.get('session-1').tavern.memory, ['吧台下藏着一把枪'])
  assert.deepEqual(s.get('session-1').tavern.relations, { 艾琳: '戒备→松动' })
  assert.equal(s.get('session-1').tavern.notes, '这一夜要出事')
  assert.equal(s.get('session-2').tavern.on, false)
})

test('patch refuses to run for a session with tavern mode off', () => {
  const s = store()
  const value = applyStoryStatePatch(s, 'session-1', { action: 'patch', scene: '不该写进去' })
  assert.equal(value.ok, false)
  assert.equal(s.get('session-1').tavern.scene, '')
})

test('read without a live session degrades instead of throwing', () => {
  const definition = createStoryStateTool({ defineTool: stubDefineTool, store: store() })
  const value = definition.execute({ action: 'read' }, {})
  assert.equal(value.ok, false)
})

test('rendered text carries the facts the model needs', () => {
  const s = store()
  s.update('session-1', (record) => {
    record.tavern.on = true
    record.tavern.scene = '雨夜的酒馆'
    record.tavern.memory = ['艾琳左肩有旧伤']
    record.tavern.relations = { 艾琳: '戒备' }
  })
  const definition = createStoryStateTool({ defineTool: stubDefineTool, store: s })
  const value = definition.execute({ action: 'read' }, exec('session-1'))
  const rendered = definition.output.render({ action: 'read' }, value)
  const text = rendered.map((block) => block.text).join('\n')
  assert.match(text, /雨夜的酒馆/)
  assert.match(text, /艾琳左肩有旧伤/)
  assert.match(text, /戒备/)
})

test('defaultSession stays the source of truth for an untouched session', () => {
  const record = defaultSession()
  assert.equal(record.tavern.statusBar, true)
  assert.equal(record.tavern.dice, false)
})

test('the definition works without the host defineTool helper', () => {
  const s = store()
  s.update('session-1', (record) => {
    record.tavern.on = true
  })
  const definition = createStoryStateTool({ store: s })
  assert.equal(definition.name, 'story_state')
  // Raw JSON Schema, because the registry never needed the DSL.
  assert.equal(definition.parameters.type, 'object')
  assert.deepEqual(definition.parameters.required, ['action'])
  assert.deepEqual(definition.parameters.properties.action.enum, ['read', 'patch'])
  assert.equal(definition.parameters.properties.relations.type, 'array')
  assert.deepEqual(definition.parameters.properties.relations.items.required, ['name'])
  assert.equal(definition.output.schema.type, 'object')
  assert.equal(definition.output.schema.additionalProperties, true)
  assert.equal(typeof definition.output.render, 'function')

  const value = definition.execute({ action: 'patch', scene: '雨夜' }, exec('session-1'))
  assert.equal(value.ok, true)
  assert.equal(s.get('session-1').tavern.scene, '雨夜')
  const rendered = definition.output.render({ action: 'read' }, value)
  assert.match(rendered[0].text, /雨夜/)
})

test('the fallback refuses bad arguments instead of writing them', () => {
  const s = store()
  s.update('session-1', (record) => {
    record.tavern.on = true
  })
  const definition = createStoryStateTool({ store: s })
  const value = definition.execute({ action: 'patch', memory: 'not-an-array', relations: [{}] }, exec('session-1'))
  assert.equal(value.ok, true)
  assert.deepEqual(s.get('session-1').tavern.memory, [])
  assert.deepEqual(s.get('session-1').tavern.relations, {})
})
