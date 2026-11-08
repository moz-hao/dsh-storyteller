/**
 * Slash-command grammar for dsh-storyteller.
 *
 * `/plain`, `/tavern` and `/story` are the only way to switch a feature on, and
 * every mutation is scoped to the calling session's id. The whole surface is
 * plain functions over a {@link StateStore}: no cordis context, no session log,
 * no UI assumptions — which is what makes it testable without a host.
 *
 * @module dsh-storyteller/grammar
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  CARD_FIELDS,
  PLAIN_LEVELS,
  TAVERN_LENGTHS,
  TAVERN_POVS,
  TAVERN_RATINGS,
  normalizeCard,
  normalizeSession,
} from './state.js'
import { renderPreview, renderSummary } from './prompt.js'

/** Result kind for a command that did what was asked. */
const SUCCESS = 'success'

/** Result kind for a command that refused and changed nothing. */
const ERROR = 'error'

/** Build a success result. */
function ok(text) {
  return { kind: SUCCESS, text }
}

/** Build an error result. */
function fail(text) {
  return { kind: ERROR, text }
}

/** Usage strings, shared by the error paths and `/… help`. */
const USAGE = {
  plain: [
    '/plain on｜off　开关说人话',
    '/plain level novel｜plain　网文感 / 纯大白话',
    '/plain preview　看当前注入的提示词',
    '/plain status　看当前状态',
  ].join('\n'),
  tavern: [
    '/tavern on｜off　开关酒馆模式',
    '/tavern card <JSON | @文件.json | clear>　角色卡',
    '/tavern set <字段> <内容>　单个字段（name/personality/speech/persona/scene/notes…）',
    '/tavern memory add <内容>｜list｜clear　记忆',
    '/tavern relation <名字> <态度>　人物关系',
    '/tavern statusbar on｜off　每回合状态条',
    '/tavern dice on｜off　d20 判定',
    '/tavern rating general｜mature｜explicit　分级',
    '/tavern style pov=third|first length=short|medium|long tone=…',
    '/tavern reset [hard]　清空这一场（hard 连角色卡一起清）',
    '/tavern show｜preview｜status',
  ].join('\n'),
  story: ['/story　看两个功能的开关状态'].join('\n'),
}

/** Split `rawInput` into a lowercased head word and the untouched remainder. */
export function splitHead(rawInput) {
  const text = typeof rawInput === 'string' ? rawInput.replace(/^[\s\u3000]+/, '') : ''
  if (text.length === 0) return { head: '', rest: '' }
  const match = /^(\S+)\s*([\s\S]*)$/.exec(text)
  if (match === null) return { head: text.toLowerCase(), rest: '' }
  return { head: match[1].toLowerCase(), rest: match[2] ?? '' }
}

/**
 * Split a remainder into whitespace-separated words, honouring quotes.
 *
 * Quoted runs keep their inner text verbatim, which is what makes
 * `set persona "一个外乡人"` work without a real parser.
 *
 * @param {string} input - remainder text.
 * @returns {string[]} words.
 */
export function tokenize(input) {
  const text = typeof input === 'string' ? input : ''
  const words = []
  let current = ''
  let quote = ''
  for (const char of text) {
    if (quote.length > 0) {
      if (char === quote) {
        quote = ''
        continue
      }
      current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ' ' || char === '\t' || char === '\n' || char === '\u3000') {
      if (current.length > 0) words.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.length > 0) words.push(current)
  return words
}

/** Parse an on/off style switch. */
function parseToggle(word) {
  const value = (word ?? '').toLowerCase()
  if (['on', 'true', '1', '开', '开启'].includes(value)) return true
  if (['off', 'false', '0', '关', '关闭'].includes(value)) return false
  return undefined
}

/** Require a session id before any mutation. */
function requireSession(sessionId) {
  return typeof sessionId === 'string' && sessionId.length > 0
}

/**
 * Read a character card from inline JSON or a `@path` file.
 *
 * @param {string} source - raw argument.
 * @returns {{ ok: true, card: object } | { ok: false, error: string }} result.
 */
export function readCardSource(source) {
  const trimmed = (source ?? '').trim()
  if (trimmed.startsWith('@')) {
    const file = trimmed.slice(1).trim()
    let body
    try {
      body = fs.readFileSync(path.resolve(file), 'utf8')
    } catch (error) {
      return { ok: false, error: `读不到文件：${file}（${error?.code ?? error}）` }
    }
    try {
      return { ok: true, card: normalizeCard(JSON.parse(body)) }
    } catch {
      return { ok: false, error: `文件不是合法 JSON：${file}` }
    }
  }
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: '角色卡必须是一个 JSON 对象，例如 {"name":"艾琳","personality":"嘴硬"}' }
    }
    return { ok: true, card: normalizeCard(parsed) }
  } catch {
    return { ok: false, error: '不是合法 JSON。要么贴一个 {"name":"…"} 对象，要么用 @文件.json' }
  }
}

/**
 * Write one field of the tavern block.
 *
 * @param {object} tavern - mutated in place.
 * @param {string} rawPath - field path, e.g. `persona`, `card.name`, `style.tone`.
 * @param {string} value - raw value text.
 * @returns {string|undefined} an error message, or undefined on success.
 */
export function setField(tavern, rawPath, value) {
  const fieldPath = (rawPath ?? '').trim()
  const text = typeof value === 'string' ? value : ''
  if (fieldPath.length === 0) return '缺字段名。用 /tavern set <字段> <内容>，例如 /tavern set scene 雨夜的酒馆'

  const cardField = fieldPath.startsWith('card.') ? fieldPath.slice(5) : fieldPath
  if (CARD_FIELDS.includes(cardField)) {
    if (text.trim().length === 0) return `字段 ${cardField} 不能为空；要清掉整张卡用 /tavern card clear`
    tavern.card[cardField] = text.trim()
    return undefined
  }

  if (fieldPath === 'persona' || fieldPath === 'scene' || fieldPath === 'notes') {
    tavern[fieldPath] = text.trim()
    return undefined
  }

  if (fieldPath === 'statusbar' || fieldPath === 'statusBar') {
    const toggle = parseToggle(text)
    if (toggle === undefined) return '状态条只接受 on / off'
    tavern.statusBar = toggle
    return undefined
  }

  if (fieldPath === 'dice') {
    const toggle = parseToggle(text)
    if (toggle === undefined) return '骰子只接受 on / off'
    tavern.dice = toggle
    return undefined
  }

  if (fieldPath === 'rating') {
    if (!TAVERN_RATINGS.includes(text.trim())) return `分级只接受 ${TAVERN_RATINGS.join(' / ')}`
    tavern.style.rating = text.trim()
    return undefined
  }

  const styleKey = fieldPath.startsWith('style.') ? fieldPath.slice(6) : fieldPath
  if (styleKey === 'pov') {
    const normalized = text.trim().toLowerCase()
    const alias = { third: 'third', '第三人称': 'third', first: 'first', '第一人称': 'first' }[normalized]
    if (alias === undefined) return `视角只接受 ${TAVERN_POVS.join(' / ')}（或 第三人称 / 第一人称）`
    tavern.style.pov = alias
    return undefined
  }
  if (styleKey === 'length') {
    const normalized = text.trim().toLowerCase()
    if (!TAVERN_LENGTHS.includes(normalized)) return `长度只接受 ${TAVERN_LENGTHS.join(' / ')}`
    tavern.style.length = normalized
    return undefined
  }
  if (styleKey === 'tone') {
    tavern.style.tone = text.trim()
    return undefined
  }

  return `不认识的字段：${fieldPath}。可用：${[...CARD_FIELDS, 'persona', 'scene', 'notes', 'statusbar', 'dice', 'rating', 'pov', 'length', 'tone'].join('、')}`
}

/**
 * `/plain` — the 说人话 switch.
 *
 * @param {import('./state.js').StateStore} store - state store.
 * @param {string} sessionId - calling session.
 * @param {string} rawInput - everything after `/plain`.
 * @returns {{kind: 'success'|'error', text: string}} command result.
 */
export function handlePlain(store, sessionId, rawInput) {
  if (!requireSession(sessionId)) return fail('说书人：拿不到会话 id，这条命令没有作用对象。请在会话里执行。')
  const { head, rest } = splitHead(rawInput)
  const command = head === '' ? 'status' : head

  if (command === 'help') return ok(USAGE.plain)
  if (command === 'status') return ok(renderSummary(store.get(sessionId)))
  if (command === 'preview') return ok(renderPreview(store.get(sessionId), 'plain'))

  if (command === 'on' || command === 'off') {
    const on = command === 'on'
    store.update(sessionId, (record) => {
      record.plain.on = on
    })
    return ok(on ? '说人话：已开启。这一回合之后的话会换成网文口感，代码和命令照旧。' : '说人话：已关闭。本会话恢复原样。')
  }

  if (command === 'level') {
    const level = rest.trim().toLowerCase()
    if (!PLAIN_LEVELS.includes(level)) return fail(`档位只接受 ${PLAIN_LEVELS.join(' / ')}（novel = 网文感，plain = 纯大白话）`)
    store.update(sessionId, (record) => {
      record.plain.level = level
    })
    return ok(`说人话档位：${level === 'novel' ? '网文感' : '纯大白话'}。${store.get(sessionId).plain.on ? '' : '（功能还没开，用 /plain on）'}`)
  }

  return fail(`不认识的子命令：${command}\n\n${USAGE.plain}`)
}

/**
 * `/tavern` — the 酒馆 switch and the whole director console.
 *
 * @param {import('./state.js').StateStore} store - state store.
 * @param {string} sessionId - calling session.
 * @param {string} rawInput - everything after `/tavern`.
 * @returns {{kind: 'success'|'error', text: string}} command result.
 */
export function handleTavern(store, sessionId, rawInput) {
  if (!requireSession(sessionId)) return fail('说书人：拿不到会话 id，这条命令没有作用对象。请在会话里执行。')
  const { head, rest } = splitHead(rawInput)
  const command = head === '' ? 'status' : head

  if (command === 'help') return ok(USAGE.tavern)
  if (command === 'status') return ok(renderSummary(store.get(sessionId)))
  if (command === 'preview') return ok(renderPreview(store.get(sessionId), 'tavern'))

  if (command === 'on' || command === 'off') {
    const on = command === 'on'
    store.update(sessionId, (record) => {
      record.tavern.on = on
    })
    if (!on) return ok('酒馆模式：已关闭。story_state 工具对本会话隐藏，正文恢复平常。')
    const record = store.get(sessionId)
    const missing = []
    if (Object.keys(record.tavern.card).length === 0) missing.push('/tavern card {"name":"…"}　建一张角色卡')
    if (record.tavern.persona.trim().length === 0) missing.push('/tavern set persona …　写你自己是谁')
    if (record.tavern.scene.trim().length === 0) missing.push('/tavern set scene …　定一个开场')
    const hint = missing.length > 0 ? `\n还没铺好的：\n${missing.join('\n')}\n不铺也能开场——第一回合会临时立一个人物和场景。` : ''
    return ok(`酒馆模式：已开启。状态条默认开着，骰子默认关着。${hint}`)
  }

  if (command === 'card') {
    const source = rest.trim()
    if (source.length === 0) {
      const card = store.get(sessionId).tavern.card
      return ok(Object.keys(card).length === 0 ? '还没有角色卡。用 /tavern card {"name":"…","personality":"…"} 或 @角色卡.json' : JSON.stringify(card, null, 2))
    }
    if (source.toLowerCase() === 'clear') {
      store.update(sessionId, (record) => {
        record.tavern.card = {}
      })
      return ok('角色卡已清空。')
    }
    const read = readCardSource(source)
    if (read.ok !== true) return fail(read.error)
    if (Object.keys(read.card).length === 0) return fail('这张卡没有任何认识的字段。可用字段：' + CARD_FIELDS.join('、'))
    store.update(sessionId, (record) => {
      record.tavern.card = { ...record.tavern.card, ...read.card }
    })
    const name = read.card.name ?? store.get(sessionId).tavern.card.name ?? '（未命名）'
    return ok(`角色卡已更新：${name}（${Object.keys(read.card).length} 个字段）。下一条回复开始生效。`)
  }

  if (command === 'set') {
    const words = tokenize(rest)
    if (words.length < 2) return fail('用法：/tavern set <字段> <内容>，例如 /tavern set scene 雨夜的酒馆')
    const fieldPath = words[0]
    const value = words.slice(1).join(' ')
    // Validate on a throwaway copy first: a refused write must not touch the
    // session's `updatedAt` or the state file at all.
    const probe = normalizeSession(store.get(sessionId))
    const error = setField(probe.tavern, fieldPath, value)
    if (error !== undefined) return fail(error)
    store.update(sessionId, (record) => {
      setField(record.tavern, fieldPath, value)
    })
    return ok(`已写入：${fieldPath}。${store.get(sessionId).tavern.on ? '' : '（酒馆模式还没开，用 /tavern on）'}`)
  }

  if (command === 'memory') {
    const words = tokenize(rest)
    const action = (words[0] ?? 'list').toLowerCase()
    if (action === 'add') {
      const entry = words.slice(1).join(' ').trim()
      if (entry.length === 0) return fail('用法：/tavern memory add 一句可以检索的事实')
      store.update(sessionId, (record) => {
        record.tavern.memory.push(entry)
      })
      return ok(`记忆已加（共 ${store.get(sessionId).tavern.memory.length} 条）：${entry}`)
    }
    if (action === 'list') {
      const memory = store.get(sessionId).tavern.memory
      return ok(memory.length === 0 ? '记忆是空的。' : memory.map((entry, index) => `${index + 1}. ${entry}`).join('\n'))
    }
    if (action === 'clear') {
      store.update(sessionId, (record) => {
        record.tavern.memory = []
      })
      return ok('记忆已清空。')
    }
    return fail('用法：/tavern memory add <内容>｜list｜clear')
  }

  if (command === 'relation') {
    const words = tokenize(rest)
    if (words.length < 2) return fail('用法：/tavern relation <名字> <态度>，例如 /tavern relation 艾琳 戒备→松动')
    const name = words[0]
    const attitude = words.slice(1).join(' ')
    store.update(sessionId, (record) => {
      record.tavern.relations[name] = attitude
    })
    return ok(`关系已记：${name} → ${attitude}`)
  }

  if (command === 'statusbar') {
    const toggle = parseToggle(rest.trim())
    if (toggle === undefined) return fail('用法：/tavern statusbar on｜off')
    store.update(sessionId, (record) => {
      record.tavern.statusBar = toggle
    })
    return ok(`状态条：${toggle ? '开（每回合末尾自动出一行【状态】）' : '关（状态只留在 story_state 里）'}`)
  }

  if (command === 'dice') {
    const toggle = parseToggle(rest.trim())
    if (toggle === undefined) return fail('用法：/tavern dice on｜off')
    store.update(sessionId, (record) => {
      record.tavern.dice = toggle
    })
    return ok(`骰子：${toggle ? '开（有失败可能的行动掷 d20，结果写进正文和【判定】行）' : '关'}`)
  }

  if (command === 'rating') {
    const rating = rest.trim().toLowerCase()
    if (!TAVERN_RATINGS.includes(rating)) return fail(`分级只接受 ${TAVERN_RATINGS.join(' / ')}`)
    store.update(sessionId, (record) => {
      record.tavern.style.rating = rating
    })
    return ok(`分级：${rating}`)
  }

  if (command === 'style') {
    const words = tokenize(rest)
    if (words.length === 0) return fail(USAGE.tavern)
    const pairs = []
    for (const word of words) {
      const index = word.indexOf('=')
      if (index <= 0) return fail('风格参数要写成 key=value：pov=third|first length=short|medium|long tone=冷硬')
      pairs.push([word.slice(0, index), word.slice(index + 1)])
    }
    // Same rule as `/tavern set`: validate every pair on a copy before writing.
    const probe = normalizeSession(store.get(sessionId))
    for (const [key, value] of pairs) {
      const error = setField(probe.tavern, key, value)
      if (error !== undefined) return fail(error)
    }
    store.update(sessionId, (record) => {
      for (const [key, value] of pairs) setField(record.tavern, key, value)
    })
    const style = store.get(sessionId).tavern.style
    return ok(`风格已更新：视角 ${style.pov === 'third' ? '第三人称' : '第一人称'}／长度 ${style.length}／语气 ${style.tone.length > 0 ? style.tone : '默认'}`)
  }

  if (command === 'reset') {
    const hard = rest.trim().toLowerCase() === 'hard'
    store.update(sessionId, (record) => {
      record.tavern.scene = ''
      record.tavern.memory = []
      record.tavern.relations = {}
      record.tavern.notes = ''
      if (hard) {
        record.tavern.card = {}
        record.tavern.persona = ''
      }
    })
    return ok(hard ? '这一场已清空，角色卡和人设也清了。开关状态保留。' : '这一场已清空：场景、记忆、关系、笔记都归零，角色卡保留。')
  }

  if (command === 'show') {
    return ok(JSON.stringify(store.get(sessionId).tavern, null, 2))
  }

  return fail(`不认识的子命令：${command}\n\n${USAGE.tavern}`)
}

/**
 * `/story` — both switches at a glance.
 *
 * @param {import('./state.js').StateStore} store - state store.
 * @param {string} sessionId - calling session.
 * @param {string} rawInput - unused.
 * @returns {{kind: 'success'|'error', text: string}} command result.
 */
export function handleStory(store, sessionId, rawInput) {
  if (!requireSession(sessionId)) return fail('说书人：拿不到会话 id，这条命令没有作用对象。请在会话里执行。')
  const { head } = splitHead(rawInput)
  if (head === 'help') return ok(`${USAGE.plain}\n\n${USAGE.tavern}`)
  return ok(renderSummary(store.get(sessionId)))
}

/** Exported for tests and for `/story help`. */
export { USAGE }
