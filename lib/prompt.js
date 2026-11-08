/**
 * Prompt rendering for dsh-storyteller.
 *
 * The product lives in the language packs (`./i18n/zh.js`, `./i18n/en.js`);
 * this module only normalises the session record, picks the pack and decides
 * whether a section is injected at all. A session that never opted in renders
 * `''`, which the prompt renderer drops — zero tokens, zero behaviour change.
 *
 * @module dsh-storyteller/prompt
 */

import { defaultSession, normalizeSession } from './state.js'
import zh from './i18n/zh.js'
import en from './i18n/en.js'

/** Installed language packs, keyed by `record.lang`. */
const PACKS = { zh, en }

/**
 * The pack a session renders with.
 *
 * @param {unknown} session - session record.
 * @returns {typeof zh} the matching pack, Chinese when unknown.
 */
export function packFor(session) {
  const record = normalizeSession(session)
  return PACKS[record.lang] ?? zh
}

/**
 * Render the 说人话 section.
 *
 * @param {unknown} session - session record.
 * @returns {string} section text, or `''` when the feature is off.
 */
export function renderPlain(session) {
  const record = normalizeSession(session)
  if (record.plain.on !== true) return ''
  return packFor(record).plainSection(record)
}

/**
 * Render the 酒馆模式 section.
 *
 * @param {unknown} session - session record.
 * @returns {string} section text, or `''` when tavern mode is off.
 */
export function renderTavern(session) {
  const record = normalizeSession(session)
  if (record.tavern.on !== true) return ''
  return packFor(record).tavernSection(record)
}

/**
 * Render a one-screen status summary for `/story` and `/tavern status`.
 *
 * @param {unknown} session - session record.
 * @returns {string} summary text (never empty).
 */
export function renderSummary(session) {
  const record = normalizeSession(session)
  return packFor(record).summary(record)
}

/**
 * The exact text a section would contribute right now, for `… preview`.
 *
 * @param {unknown} session - session record.
 * @param {'plain'|'tavern'} which - section to render.
 * @returns {string} rendered section text or an "off" note.
 */
export function renderPreview(session, which) {
  const record = normalizeSession(session)
  const body = which === 'plain' ? renderPlain(record) : renderTavern(record)
  return body.length > 0 ? body : packFor(record).previewOff[which]
}

/** Convenience re-export so callers can build an empty record here. */
export { defaultSession }
