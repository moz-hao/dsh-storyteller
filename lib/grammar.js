/**
 * Slash-command grammar for dsh-storyteller.
 *
 * `/plain`, `/tavern` and `/story` are the only way to switch a feature on, and
 * every mutation is scoped to the calling session's id. Replies come from the
 * session's language pack, so a Chinese session and an English session get the
 * same behaviour in their own words.
 *
 * @module dsh-storyteller/grammar
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  CARD_FIELDS,
  LANGUAGES,
  PLAIN_LEVELS,
  TAVERN_LENGTHS,
  TAVERN_POVS,
  TAVERN_RATINGS,
  normalizeCard,
  normalizeSession,
} from './state.js'
import { packFor, renderPreview, renderSummary } from './prompt.js'
import zh from './i18n/zh.js'
import en from './i18n/en.js'

const PACKS = { zh, en }

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

/** Split `rawInput` into a lowercased head word and the untouched remainder. */
export function splitHead(rawInput) {
  const text = typeof rawInput === 'string' ? rawInput.replace(/^[\s\u3000]+/, '') : ''
  if (text.length === 0) return { head: '', rest: '' }
  const match = /^(\S+)\s*([\s\S]*)$/.exec(text)
  if (match === null) return { head: text.toLowerCase(), rest: '' }
  return { head: match[1].toLowerCase(), rest: match[2] ?? '' }
}

/**
 * Split a remainder into whitespace-separated words, honouring ASCII quotes.
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

/** The pack a session currently speaks. */
function packOf(store, sessionId) {
  return packFor(store.get(sessionId))
}

/**
 * Read a character card from inline JSON or a `@path` file.
 *
 * @param {string} source - raw argument.
 * @param {ReturnType<typeof packOf>} pack - language pack for error text.
 * @returns {{ ok: true, card: object } | { ok: false, error: string }} result.
 */
export function readCardSource(source, pack = zh) {
  const trimmed = (source ?? '').trim()
  if (trimmed.startsWith('@')) {
    const file = trimmed.slice(1).trim()
    let body
    try {
      body = fs.readFileSync(path.resolve(file), 'utf8')
    } catch (error) {
      return { ok: false, error: pack.cmd.cardFileMissing(file, error?.code ?? String(error)) }
    }
    try {
      return { ok: true, card: normalizeCard(JSON.parse(body)) }
    } catch {
      return { ok: false, error: pack.cmd.cardFileBad(file) }
    }
  }
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: pack.cmd.cardNotObject }
    }
    return { ok: true, card: normalizeCard(parsed) }
  } catch {
    return { ok: false, error: pack.cmd.cardBadJson }
  }
}

/**
 * Write one field of the tavern block.
 *
 * Returns a machine code rather than prose so the caller can localise it; a
 * refused write must leave the record untouched, so validation happens before
 * any store mutation.
 *
 * @param {object} tavern - tavern block, mutated only on success.
 * @param {string} rawPath - field path, e.g. `persona`, `card.name`, `style.tone`.
 * @param {string} value - raw value text.
 * @returns {undefined | { code: string, detail?: unknown }} undefined on success.
 */
export function setField(tavern, rawPath, value) {
  const fieldPath = (rawPath ?? '').trim()
  const text = typeof value === 'string' ? value : ''
  if (fieldPath.length === 0) return { code: 'fieldMissing' }

  const cardField = fieldPath.startsWith('card.') ? fieldPath.slice(5) : fieldPath
  if (CARD_FIELDS.includes(cardField)) {
    if (text.trim().length === 0) return { code: 'fieldEmpty', detail: cardField }
    tavern.card[cardField] = text.trim()
    return undefined
  }

  if (fieldPath === 'persona' || fieldPath === 'scene' || fieldPath === 'notes') {
    tavern[fieldPath] = text.trim()
    return undefined
  }

  if (fieldPath === 'statusbar' || fieldPath === 'statusBar') {
    const toggle = parseToggle(text)
    if (toggle === undefined) return { code: 'toggleError', detail: 'statusbar' }
    tavern.statusBar = toggle
    return undefined
  }

  if (fieldPath === 'dice') {
    const toggle = parseToggle(text)
    if (toggle === undefined) return { code: 'toggleError', detail: 'dice' }
    tavern.dice = toggle
    return undefined
  }

  if (fieldPath === 'choices') {
    const toggle = parseToggle(text)
    if (toggle === undefined) return { code: 'toggleError', detail: 'choices' }
    tavern.choices = toggle
    return undefined
  }

  if (fieldPath === 'erotic') {
    const toggle = parseToggle(text)
    if (toggle === undefined) return { code: 'toggleError', detail: 'erotic' }
    tavern.erotic = toggle
    return undefined
  }

  if (fieldPath === 'rating') {
    const rating = text.trim()
    if (!TAVERN_RATINGS.includes(rating)) return { code: 'ratingError', detail: TAVERN_RATINGS.join(' / ') }
    tavern.style.rating = rating
    return undefined
  }

  if (fieldPath === 'setup') {
    const state = text.trim().toLowerCase()
    if (!['done', 'pending', 'reset'].includes(state)) return { code: 'toggleError', detail: 'setup' }
    tavern.setup = state === 'reset' ? 'pending' : state
    return undefined
  }

  const styleKey = fieldPath.startsWith('style.') ? fieldPath.slice(6) : fieldPath
  if (styleKey === 'pov') {
    const normalized = text.trim().toLowerCase()
    const alias = { third: 'third', '第三人称': 'third', first: 'first', '第一人称': 'first' }[normalized]
    if (alias === undefined) return { code: 'povError', detail: TAVERN_POVS.join(' / ') }
    tavern.style.pov = alias
    return undefined
  }
  if (styleKey === 'length') {
    const normalized = text.trim().toLowerCase()
    if (!TAVERN_LENGTHS.includes(normalized)) return { code: 'lengthError', detail: TAVERN_LENGTHS.join(' / ') }
    tavern.style.length = normalized
    return undefined
  }
  if (styleKey === 'tone') {
    tavern.style.tone = text.trim()
    return undefined
  }

  return { code: 'fieldUnknown', detail: fieldPath }
}

/** Turn a setField code into localised text. */
function describeFieldError(pack, error) {
  switch (error.code) {
    case 'fieldMissing':
      return pack.cmd.fieldMissing
    case 'fieldEmpty':
      return pack.cmd.fieldEmpty(error.detail)
    case 'toggleError':
      return pack.cmd.toggleError(error.detail)
    case 'ratingError':
      return pack.cmd.ratingError(error.detail)
    case 'povError':
      return pack.cmd.povError(error.detail)
    case 'lengthError':
      return pack.cmd.lengthError(error.detail)
    default:
      return pack.cmd.fieldUnknown(
        error.detail,
        [...CARD_FIELDS, 'persona', 'scene', 'notes', 'statusbar', 'dice', 'choices', 'erotic', 'rating', 'pov', 'length', 'tone'].join('、'),
      )
  }
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
  if (!requireSession(sessionId)) return fail(zh.cmd.noSession)
  const pack = packOf(store, sessionId)
  const { head, rest } = splitHead(rawInput)
  const command = head === '' ? 'status' : head

  if (command === 'help') return ok(pack.usage.plain)
  if (command === 'status') return ok(renderSummary(store.get(sessionId)))
  if (command === 'preview') return ok(renderPreview(store.get(sessionId), 'plain'))

  if (command === 'lang') {
    const lang = rest.trim().toLowerCase()
    if (!LANGUAGES.includes(lang)) return fail(pack.cmd.langError)
    store.update(sessionId, (record) => {
      record.lang = lang
    })
    return ok(PACKS[lang].cmd.langSet(lang))
  }

  if (command === 'on' || command === 'off') {
    const on = command === 'on'
    store.update(sessionId, (record) => {
      record.plain.on = on
    })
    return ok(on ? pack.cmd.plainOn : pack.cmd.plainOff)
  }

  if (command === 'level') {
    const level = rest.trim().toLowerCase()
    if (!PLAIN_LEVELS.includes(level)) return fail(pack.cmd.plainLevelError)
    store.update(sessionId, (record) => {
      record.plain.level = level
    })
    return ok(pack.cmd.plainLevel(level, store.get(sessionId).plain.on))
  }

  return fail(pack.cmd.plainUnknown(command, pack.usage.plain))
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
  if (!requireSession(sessionId)) return fail(zh.cmd.noSession)
  const pack = packOf(store, sessionId)
  const { head, rest } = splitHead(rawInput)
  const command = head === '' ? 'status' : head

  if (command === 'help') return ok(pack.usage.tavern)
  if (command === 'status') return ok(renderSummary(store.get(sessionId)))
  if (command === 'preview') return ok(renderPreview(store.get(sessionId), 'tavern'))

  if (command === 'lang') {
    const lang = rest.trim().toLowerCase()
    if (!LANGUAGES.includes(lang)) return fail(pack.cmd.langError)
    store.update(sessionId, (record) => {
      record.lang = lang
    })
    return ok(PACKS[lang].cmd.langSet(lang))
  }

  if (command === 'on' || command === 'off') {
    const on = command === 'on'
    store.update(sessionId, (record) => {
      record.tavern.on = on
      if (on) {
        // 酒馆模式默认连说人话一起开：戏要好读。
        record.plain.on = true
        if (record.tavern.setup !== 'done') record.tavern.setup = 'pending'
      }
    })
    if (!on) return ok(pack.cmd.tavernOff)
    const record = store.get(sessionId)
    const missing = []
    if (Object.keys(record.tavern.card).length === 0) missing.push(pack.cmd.tavernOnMissingCard)
    if (record.tavern.persona.trim().length === 0) missing.push(pack.cmd.tavernOnMissingPersona)
    if (record.tavern.scene.trim().length === 0) missing.push(pack.cmd.tavernOnMissingScene)
    return ok(pack.cmd.tavernOn(missing))
  }

  if (command === 'card') {
    const source = rest.trim()
    if (source.length === 0) {
      const card = store.get(sessionId).tavern.card
      return ok(Object.keys(card).length === 0 ? pack.cmd.cardNone : JSON.stringify(card, null, 2))
    }
    if (source.toLowerCase() === 'clear') {
      store.update(sessionId, (record) => {
        record.tavern.card = {}
      })
      return ok(pack.cmd.cardCleared)
    }
    const read = readCardSource(source, pack)
    if (read.ok !== true) return fail(read.error)
    if (Object.keys(read.card).length === 0) return fail(pack.cmd.cardNoFields(CARD_FIELDS.join('、')))
    store.update(sessionId, (record) => {
      record.tavern.card = { ...record.tavern.card, ...read.card }
    })
    const name = read.card.name ?? store.get(sessionId).tavern.card.name ?? '—'
    return ok(pack.cmd.cardUpdated(name, Object.keys(read.card).length))
  }

  if (command === 'set') {
    const words = tokenize(rest)
    if (words.length < 2) return fail(pack.cmd.setUsage)
    const fieldPath = words[0]
    const value = words.slice(1).join(' ')
    const probe = normalizeSession(store.get(sessionId))
    const error = setField(probe.tavern, fieldPath, value)
    if (error !== undefined) return fail(describeFieldError(pack, error))
    store.update(sessionId, (record) => {
      setField(record.tavern, fieldPath, value)
    })
    return ok(pack.cmd.fieldSet(fieldPath, store.get(sessionId).tavern.on))
  }

  if (command === 'memory') {
    const words = tokenize(rest)
    const action = (words[0] ?? 'list').toLowerCase()
    if (action === 'add') {
      const entry = words.slice(1).join(' ').trim()
      if (entry.length === 0) return fail(pack.cmd.memoryAddUsage)
      store.update(sessionId, (record) => {
        record.tavern.memory.push(entry)
      })
      return ok(pack.cmd.memoryAdded(store.get(sessionId).tavern.memory.length, entry))
    }
    if (action === 'list') {
      const memory = store.get(sessionId).tavern.memory
      return ok(memory.length === 0 ? pack.cmd.memoryEmpty : pack.cmd.memoryList(memory.map((entry, index) => `${index + 1}. ${entry}`).join('\n')))
    }
    if (action === 'clear') {
      store.update(sessionId, (record) => {
        record.tavern.memory = []
      })
      return ok(pack.cmd.memoryCleared)
    }
    return fail(pack.cmd.memoryUsage)
  }

  if (command === 'relation') {
    const words = tokenize(rest)
    if (words.length < 2) return fail(pack.cmd.relationUsage)
    const name = words[0]
    const attitude = words.slice(1).join(' ')
    store.update(sessionId, (record) => {
      record.tavern.relations[name] = attitude
    })
    return ok(pack.cmd.relationSet(name, attitude))
  }

  if (command === 'statusbar' || command === 'dice' || command === 'choices' || command === 'erotic') {
    const toggle = parseToggle(rest.trim())
    if (toggle === undefined) return fail(pack.cmd[`${command}Usage`] ?? pack.cmd.toggleError(command))
    store.update(sessionId, (record) => {
      if (command === 'statusbar') record.tavern.statusBar = toggle
      else if (command === 'dice') record.tavern.dice = toggle
      else if (command === 'choices') record.tavern.choices = toggle
      else record.tavern.erotic = toggle
    })
    const replyKey = command === 'statusbar' ? 'statusBar' : command
    const reply = pack.cmd[replyKey]
    return ok(typeof reply === 'function' ? reply(toggle) : pack.cmd.toggleError(command))
  }

  if (command === 'setup') {
    const value = rest.trim().toLowerCase()
    if (!['done', 'reset', 'pending'].includes(value)) return fail(pack.cmd.toggleError('setup'))
    store.update(sessionId, (record) => {
      record.tavern.setup = value === 'done' ? 'done' : 'pending'
    })
    return ok(value === 'done' ? pack.cmd.setupDone : pack.cmd.setupReset)
  }

  if (command === 'rating') {
    const rating = rest.trim().toLowerCase()
    if (!TAVERN_RATINGS.includes(rating)) return fail(pack.cmd.ratingError(TAVERN_RATINGS.join(' / ')))
    store.update(sessionId, (record) => {
      record.tavern.style.rating = rating
    })
    return ok(pack.cmd.rating(rating))
  }

  if (command === 'style') {
    const words = tokenize(rest)
    if (words.length === 0) return fail(pack.usage.tavern)
    const pairs = []
    for (const word of words) {
      const index = word.indexOf('=')
      if (index <= 0) return fail(pack.cmd.styleSyntax)
      pairs.push([word.slice(0, index), word.slice(index + 1)])
    }
    const probe = normalizeSession(store.get(sessionId))
    for (const [key, value] of pairs) {
      const error = setField(probe.tavern, key, value)
      if (error !== undefined) return fail(describeFieldError(pack, error))
    }
    store.update(sessionId, (record) => {
      for (const [key, value] of pairs) setField(record.tavern, key, value)
    })
    return ok(pack.cmd.style(store.get(sessionId).tavern.style))
  }

  if (command === 'reset') {
    const hard = rest.trim().toLowerCase() === 'hard'
    store.update(sessionId, (record) => {
      record.tavern.scene = ''
      record.tavern.memory = []
      record.tavern.relations = {}
      record.tavern.notes = ''
      record.tavern.setup = 'pending'
      if (hard) {
        record.tavern.card = {}
        record.tavern.persona = ''
      }
    })
    return ok(pack.cmd.reset(hard))
  }

  if (command === 'show') {
    return ok(JSON.stringify(store.get(sessionId).tavern, null, 2))
  }

  return fail(pack.cmd.tavernUnknown(command, pack.usage.tavern))
}

/**
 * `/story` — both switches at a glance.
 *
 * @param {import('./state.js').StateStore} store - state store.
 * @param {string} sessionId - calling session.
 * @param {string} rawInput - unused except `help`.
 * @returns {{kind: 'success'|'error', text: string}} command result.
 */
export function handleStory(store, sessionId, rawInput) {
  if (!requireSession(sessionId)) return fail(zh.cmd.noSession)
  const pack = packOf(store, sessionId)
  const { head } = splitHead(rawInput)
  if (head === 'help') return ok(`${pack.usage.plain}\n\n${pack.usage.tavern}`)
  return ok(renderSummary(store.get(sessionId)))
}

/** Usage strings of the default (Chinese) pack, kept for callers that import it. */
export const USAGE = zh.usage
