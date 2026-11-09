import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultSession, normalizeSession } from '../lib/state.js'
import { renderPlain, renderPreview, renderSummary, renderTavern } from '../lib/prompt.js'

/** Build an enabled plain session. */
function plainOn(level = 'novel') {
  const record = defaultSession()
  record.plain = { on: true, level }
  return record
}

/** Build an enabled tavern session with a card, scene and memory. */
function tavernOn() {
  const record = defaultSession()
  record.tavern.on = true
  record.tavern.card = {
    name: '艾琳',
    personality: '嘴上不饶人，心里先想着别人',
    speech: '句子短，爱用反问',
  }
  record.tavern.persona = '一个刚进城的外乡人，身上只有一把旧刀'
  record.tavern.scene = '雨夜的酒馆，后厨门开着，风把灯吹得直晃'
  record.tavern.memory = ['艾琳左肩有旧伤，阴天会疼', '吧台下面藏着一把没有编号的枪']
  record.tavern.relations = { 艾琳: '戒备→松动' }
  record.tavern.style.tone = '冷硬，带一点戏谑'
  return record
}

test('both features are silent for a session that never opted in', () => {
  const record = defaultSession()
  assert.equal(renderPlain(record), '')
  assert.equal(renderTavern(record), '')
})

test('missing session data renders nothing', () => {
  assert.equal(renderPlain(undefined), '')
  assert.equal(renderTavern(null), '')
})

test('说人话 renders rules and the novel layer by level', () => {
  const novel = renderPlain(plainOn('novel'))
  assert.match(novel, /说人话/)
  assert.match(novel, /小说感/)
  assert.match(novel, /禁用套话/)

  const plain = renderPlain(plainOn('plain'))
  assert.match(plain, /说人话/)
  assert.equal(plain.includes('小说感'), false)
})

test('说人话 keeps the code preservation clause', () => {
  assert.match(renderPlain(plainOn()), /代码块/)
})

test('酒馆模式 renders card, persona, scene, memory and relations', () => {
  const text = renderTavern(tavernOn())
  assert.match(text, /酒馆模式/)
  assert.match(text, /艾琳/)
  assert.match(text, /嘴上不饶人/)
  assert.match(text, /一个刚进城的外乡人/)
  assert.match(text, /雨夜的酒馆/)
  assert.match(text, /左肩有旧伤/)
  assert.match(text, /戒备→松动/)
  assert.match(text, /冷硬，带一点戏谑/)
  assert.match(text, /状态条/)
  assert.match(text, /story_state/)
})

test('status bar and dice blocks follow their switches', () => {
  const withBar = renderTavern(tavernOn())
  assert.match(withBar, /每回合自动生成/)

  const record = tavernOn()
  record.tavern.statusBar = false
  const withoutBar = renderTavern(record)
  assert.equal(withoutBar.includes('每回合自动生成'), false)
  assert.equal(withoutBar.includes('本会话关闭状态条'), true)

  assert.equal(withBar.includes('骰子（已开启）'), false)
  record.tavern.statusBar = true
  record.tavern.dice = true
  assert.match(renderTavern(record), /骰子（已开启）/)
})

test('rating and viewpoint wording change with the style block', () => {
  const record = tavernOn()
  record.tavern.style.rating = 'explicit'
  record.tavern.style.pov = 'first'
  const text = renderTavern(record)
  assert.match(text, /分级：露骨/)
  assert.match(text, /第一人称/)
})

test('empty card and scene fall back to guided openings, not invented facts', () => {
  const record = defaultSession()
  record.tavern.on = true
  const text = renderTavern(record)
  assert.match(text, /未建卡/)
  assert.match(text, /未设定/)
  assert.equal(text.includes('艾琳'), false)
})

test('normalizeSession output renders the same as its input', () => {
  const record = tavernOn()
  assert.equal(renderTavern(normalizeSession(record)), renderTavern(record))
})

test('summary reports both switches', () => {
  assert.match(renderSummary(defaultSession()), /说人话：关/)
  assert.match(renderSummary(defaultSession()), /酒馆模式：关/)
  const text = renderSummary(tavernOn())
  assert.match(text, /酒馆模式：开/)
  assert.match(text, /角色卡：艾琳/)
  assert.match(text, /记忆：2 条/)
})

test('preview says so when the feature is off', () => {
  assert.match(renderPreview(defaultSession(), 'plain'), /未开启/)
  assert.match(renderPreview(defaultSession(), 'tavern'), /未开启/)
  assert.match(renderPreview(plainOn(), 'plain'), /说人话/)
})

test('the novel layer carries the measured sentence-length rules', () => {
  const novel = renderPlain(plainOn('novel'))
  assert.match(novel, /二十到三十五字|20–35/)
  assert.match(novel, /一句一段/)
  // The plain level must stay free of the fiction layer.
  assert.equal(renderPlain(plainOn('plain')).includes('一句一段'), false)
})

test('酒馆 carries the goal-obstacle-cost-information plot rule', () => {
  const text = renderTavern(tavernOn())
  assert.match(text, /目标—阻碍—代价—新信息/)
  assert.match(text, /每五百字必须有一次局势变化/)
  assert.match(text, /巧合/)
})
