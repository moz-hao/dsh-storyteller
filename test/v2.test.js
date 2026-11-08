import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { StateStore, defaultSession } from '../lib/state.js'
import { handlePlain, handleTavern } from '../lib/grammar.js'
import { renderPlain, renderSummary, renderTavern } from '../lib/prompt.js'
import { createStoryStateTool } from '../lib/tool.js'

/** Store + one session id. */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-v2-'))
  const store = new StateStore(path.join(dir, 'state.json'))
  return { store, id: 'session-v2', dir }
}

/** Enabled tavern session. */
function tavernOn() {
  const record = defaultSession()
  record.tavern.on = true
  record.tavern.card = { name: '艾琳' }
  record.tavern.scene = '雨夜的酒馆'
  return record
}

test('opening tavern mode also turns 说人话 on', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'on')
  const record = store.get(id)
  assert.equal(record.tavern.on, true)
  assert.equal(record.plain.on, true)
})

test('closing tavern mode leaves 说人话 alone', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'on')
  handleTavern(store, id, 'off')
  assert.equal(store.get(id).tavern.on, false)
  assert.equal(store.get(id).plain.on, true)
  handlePlain(store, id, 'off')
  assert.equal(store.get(id).plain.on, false)
})

test('tavern mode starts with setup pending and the prompt says so', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'on')
  assert.equal(store.get(id).tavern.setup, 'pending')
  const text = renderTavern(store.get(id))
  assert.match(text, /设定/) 
  assert.match(text, /ask_user_question/)
  assert.match(text, /不要替用户决定|不要代替|不要猜/)
})

test('setup done is recorded and the interview block disappears', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'on')
  assert.equal(handleTavern(store, id, 'setup done').kind, 'success')
  assert.equal(store.get(id).tavern.setup, 'done')
  const text = renderTavern(store.get(id))
  assert.equal(text.includes('开局先补齐设定'), false)
})

test('the prompt always requires a choice card after the prose', () => {
  const text = renderTavern(tavernOn())
  assert.match(text, /ask_user_question/)
  assert.match(text, /正文之后|正文后/)
  assert.match(text, /5–8|5-8|五到八|至少 5/)
})

test('choice cards can be switched off per session', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'on')
  assert.equal(store.get(id).tavern.choices, true)
  handleTavern(store, id, 'choices off')
  assert.equal(store.get(id).tavern.choices, false)
  const text = renderTavern(store.get(id))
  assert.match(text, /选项卡片.*关|关闭选项卡片/)
})

test('erotic mode is off by default and switches on', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'on')
  assert.equal(store.get(id).tavern.erotic, false)
  assert.equal(renderTavern(store.get(id)).includes('色情模式（已开启）'), false)

  const result = handleTavern(store, id, 'erotic on')
  assert.equal(result.kind, 'success')
  assert.equal(store.get(id).tavern.erotic, true)
  const text = renderTavern(store.get(id))
  assert.match(text, /色情模式（已开启）/)
  assert.match(text, /至少 2 个选项|至少两个选项/)
  assert.match(text, /生殖器|性器|器官/)
})

test('plain speech renders in English when the session language is en', () => {
  const record = defaultSession()
  record.lang = 'en'
  record.plain = { on: true, level: 'novel' }
  const text = renderPlain(record)
  assert.match(text, /Plain speech/i)
  assert.equal(text.includes('说人话'), false)
})

test('tavern renders in English, including the setup and choice rules', () => {
  const record = tavernOn()
  record.lang = 'en'
  const text = renderTavern(record)
  assert.match(text, /Tavern mode/i)
  assert.match(text, /ask_user_question/)
  assert.match(text, /option/i)
  assert.equal(text.includes('酒馆模式'), false)
})

test('/tavern lang switches language and the summary follows', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'on')
  assert.equal(handleTavern(store, id, 'lang en').kind, 'success')
  assert.equal(store.get(id).lang, 'en')
  assert.match(renderSummary(store.get(id)), /Tavernmode|Tavern mode/i)
  assert.equal(handleTavern(store, id, 'lang fr').kind, 'error')
  assert.equal(store.get(id).lang, 'en')
})

test('/plain lang switches the same session language', () => {
  const { store, id } = fixture()
  assert.equal(handlePlain(store, id, 'lang en').kind, 'success')
  assert.equal(store.get(id).lang, 'en')
  handlePlain(store, id, 'on')
  assert.match(renderPlain(store.get(id)), /Plain speech/i)
})

test('the tool lets the model close the setup interview', () => {
  const { store, id } = fixture()
  store.update(id, (record) => {
    record.tavern.on = true
  })
  const definition = createStoryStateTool({ defineTool: (options) => options, store })
  const value = definition.execute({ action: 'patch', setup: true, scene: '雨夜的酒馆' }, { agent: { session: { id } } })
  assert.equal(value.ok, true)
  assert.equal(store.get(id).tavern.setup, 'done')
  const read = definition.execute({ action: 'read' }, { agent: { session: { id } } })
  assert.equal(read.setup, 'done')
  assert.equal(read.erotic, false)
  assert.equal(read.choices, true)
})

test('state normalisation repairs the new fields', () => {
  const record = defaultSession()
  record.tavern.erotic = 'yes'
  record.tavern.choices = 'no'
  record.tavern.setup = 'finished'
  record.lang = 'fr'
  const text = renderTavern(record)
  assert.equal(text, '')
  const repaired = renderTavern({ ...record, tavern: { ...record.tavern, on: true } })
  assert.equal(repaired.includes('finish'), false)
})
