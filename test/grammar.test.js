import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { StateStore } from '../lib/state.js'
import { handlePlain, handleStory, handleTavern } from '../lib/grammar.js'

/** Store + a fixed session id for one test. */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyteller-grammar-'))
  const store = new StateStore(path.join(dir, 'state.json'))
  return { store, id: 'session-1', dir }
}

test('/plain toggles only its own session', () => {
  const { store, id } = fixture()
  assert.equal(handlePlain(store, id, '').kind, 'success')
  assert.equal(store.get(id).plain.on, false)

  const on = handlePlain(store, id, 'on')
  assert.equal(on.kind, 'success')
  assert.match(on.text, /开/)
  assert.equal(store.get(id).plain.on, true)
  assert.equal(store.get('session-2').plain.on, false)

  handlePlain(store, id, 'off')
  assert.equal(store.get(id).plain.on, false)
})

test('/plain level switches between novel and plain', () => {
  const { store, id } = fixture()
  const result = handlePlain(store, id, 'level plain')
  assert.equal(result.kind, 'success')
  assert.equal(store.get(id).plain.level, 'plain')
  assert.equal(handlePlain(store, id, 'level literary').kind, 'error')
  assert.equal(store.get(id).plain.level, 'plain')
})

test('/plain preview renders the injected text', () => {
  const { store, id } = fixture()
  handlePlain(store, id, 'on')
  assert.match(handlePlain(store, id, 'preview').text, /说人话/)
})

test('/tavern on then status reports an enabled session', () => {
  const { store, id } = fixture()
  assert.match(handleTavern(store, id, '').text, /酒馆模式：关/)
  handleTavern(store, id, 'on')
  assert.equal(store.get(id).tavern.on, true)
  assert.match(handleTavern(store, id, 'status').text, /酒馆模式：开/)
})

test('/tavern card accepts inline JSON and merges fields', () => {
  const { store, id } = fixture()
  const json = JSON.stringify({ name: '艾琳', personality: '嘴硬', bogus: 'x' })
  const result = handleTavern(store, id, `card ${json}`)
  assert.equal(result.kind, 'success')
  const card = store.get(id).tavern.card
  assert.deepEqual(card, { name: '艾琳', personality: '嘴硬' })
})

test('/tavern card reads a file and can be cleared', () => {
  const { store, id, dir } = fixture()
  const file = path.join(dir, 'card.json')
  fs.writeFileSync(file, JSON.stringify({ name: '老陈', speech: '广东腔，句子短' }), 'utf8')
  assert.equal(handleTavern(store, id, `card @${file}`).kind, 'success')
  assert.equal(store.get(id).tavern.card.name, '老陈')
  assert.equal(handleTavern(store, id, 'card clear').kind, 'success')
  assert.deepEqual(store.get(id).tavern.card, {})
})

test('/tavern card rejects broken JSON without touching state', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'card {"name":"艾琳"}')
  const result = handleTavern(store, id, 'card {oops}')
  assert.equal(result.kind, 'error')
  assert.equal(store.get(id).tavern.card.name, '艾琳')
})

test('/tavern set writes card fields and free text', () => {
  const { store, id } = fixture()
  assert.equal(handleTavern(store, id, 'set name 艾琳').kind, 'success')
  assert.equal(handleTavern(store, id, 'set card.tagline 雨夜里的老板娘').kind, 'success')
  assert.equal(handleTavern(store, id, 'set persona "一个刚进城的外乡人，只有一把旧刀"').kind, 'success')
  assert.equal(handleTavern(store, id, 'set scene 后厨门开着，风把灯吹得直晃').kind, 'success')
  const record = store.get(id)
  assert.equal(record.tavern.card.name, '艾琳')
  assert.equal(record.tavern.card.tagline, '雨夜里的老板娘')
  assert.equal(record.tavern.persona, '一个刚进城的外乡人，只有一把旧刀')
  assert.match(record.tavern.scene, /后厨门开着/)
})

test('/tavern set rejects unknown paths', () => {
  const { store, id } = fixture()
  assert.equal(handleTavern(store, id, 'set bogus 值').kind, 'error')
  assert.equal(handleTavern(store, id, 'set').kind, 'error')
})

test('a refused write leaves the state file byte-identical', () => {
  const { store, id, dir } = fixture()
  handleTavern(store, id, 'set scene 雨夜的酒馆')
  const file = path.join(dir, 'state.json')
  const before = fs.readFileSync(file, 'utf8')
  assert.equal(handleTavern(store, id, 'set bogus 值').kind, 'error')
  assert.equal(handleTavern(store, id, 'style pov=tilted').kind, 'error')
  assert.equal(fs.readFileSync(file, 'utf8'), before)
})

test('/tavern memory add, list and clear', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'memory add 艾琳左肩有旧伤')
  handleTavern(store, id, 'memory add 吧台下藏着一把枪')
  assert.deepEqual(store.get(id).tavern.memory, ['艾琳左肩有旧伤', '吧台下藏着一把枪'])
  assert.match(handleTavern(store, id, 'memory list').text, /吧台下藏着一把枪/)
  handleTavern(store, id, 'memory clear')
  assert.deepEqual(store.get(id).tavern.memory, [])
})

test('/tavern relation records attitude', () => {
  const { store, id } = fixture()
  assert.equal(handleTavern(store, id, 'relation 艾琳 戒备→松动').kind, 'success')
  assert.deepEqual(store.get(id).tavern.relations, { 艾琳: '戒备→松动' })
  assert.equal(handleTavern(store, id, 'relation 艾琳').kind, 'error')
})

test('/tavern switches: statusbar, dice, rating, style', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'statusbar off')
  handleTavern(store, id, 'dice on')
  handleTavern(store, id, 'rating explicit')
  const result = handleTavern(store, id, 'style pov=first length=long tone=冷硬')
  assert.equal(result.kind, 'success')
  const tavern = store.get(id).tavern
  assert.equal(tavern.statusBar, false)
  assert.equal(tavern.dice, true)
  assert.equal(tavern.style.rating, 'explicit')
  assert.equal(tavern.style.pov, 'first')
  assert.equal(tavern.style.length, 'long')
  assert.equal(tavern.style.tone, '冷硬')
  assert.equal(handleTavern(store, id, 'rating nc17').kind, 'error')
  assert.equal(store.get(id).tavern.style.rating, 'explicit')
})

test('/tavern reset clears the run but keeps the card', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'card {"name":"艾琳"}')
  handleTavern(store, id, 'on')
  handleTavern(store, id, 'scene 雨夜酒馆')
  handleTavern(store, id, 'memory add 一条记忆')
  handleTavern(store, id, 'relation 艾琳 警惕')
  handleTavern(store, id, 'reset')
  const record = store.get(id).tavern
  assert.equal(record.on, true)
  assert.deepEqual(record.card, { name: '艾琳' })
  assert.equal(record.scene, '')
  assert.deepEqual(record.memory, [])
  assert.deepEqual(record.relations, {})
})

test('/tavern reset hard clears the card too', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'card {"name":"艾琳"}')
  handleTavern(store, id, 'reset hard')
  assert.deepEqual(store.get(id).tavern.card, {})
})

test('/tavern show dumps JSON and preview renders the prompt', () => {
  const { store, id } = fixture()
  handleTavern(store, id, 'on')
  const shown = handleTavern(store, id, 'show')
  assert.equal(shown.kind, 'success')
  assert.deepEqual(JSON.parse(shown.text), store.get(id).tavern)
  assert.match(handleTavern(store, id, 'preview').text, /酒馆模式/)
})

test('unknown tavern subcommands fail loudly and change nothing', () => {
  const { store, id } = fixture()
  const before = JSON.stringify(store.get(id))
  const result = handleTavern(store, id, 'summon dragon')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /tavern/)
  assert.equal(JSON.stringify(store.get(id)), before)
})

test('/story reports both features', () => {
  const { store, id } = fixture()
  handlePlain(store, id, 'on')
  handleTavern(store, id, 'on')
  const text = handleStory(store, id, '').text
  assert.match(text, /说人话：开/)
  assert.match(text, /酒馆模式：开/)
})

test('commands never leak between sessions', () => {
  const { store } = fixture()
  handleTavern(store, 'session-a', 'on')
  handleTavern(store, 'session-a', 'set scene A 的场景')
  assert.equal(store.get('session-b').tavern.on, false)
  assert.equal(store.get('session-b').tavern.scene, '')
})
