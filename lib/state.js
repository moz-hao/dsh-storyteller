/**
 * Per-session state for dsh-storyteller.
 *
 * The plugin must never change how a session behaves unless that session turned
 * a feature on. So every fact lives under the session id, in a sidecar JSON file
 * on disk — not in the session log (no history pollution, no model tokens) and
 * not in the profile patch (that would be global by construction).
 *
 * Store shape:
 *
 *   { "version": 1, "sessions": { "<sessionId>": SessionState } }
 *
 * A read of an unknown session returns defaults and writes nothing: merely
 * assembling a prompt must not create files.
 *
 * @module dsh-storyteller/state
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Store file schema version. */
export const STORE_VERSION = 1

/** Hard cap on remembered sessions; oldest by `updatedAt` are dropped first. */
export const MAX_SESSIONS = 256

/** Accepted `plain` levels, weakest first. */
export const PLAIN_LEVELS = ['plain', 'novel']

/** Accepted content ratings for tavern mode. */
export const TAVERN_RATINGS = ['general', 'mature', 'explicit']

/** Accepted narrative viewpoints. */
export const TAVERN_POVS = ['third', 'first']

/** Accepted output languages for the model-facing prompt and command replies. */
export const LANGUAGES = ['zh', 'en']

/** Setup states: the run is not playable until the interview closed it. */
export const SETUP_STATES = ['pending', 'done']

/** Accepted passage lengths. */
export const TAVERN_LENGTHS = ['short', 'medium', 'long']

/** Character-card fields the plugin knows how to render. */
export const CARD_FIELDS = [
  'name',
  'tagline',
  'appearance',
  'personality',
  'speech',
  'background',
  'goals',
  'secrets',
  'boundaries',
]

/** Human-facing card field labels (Chinese), used by the prompt renderer. */
export const CARD_LABELS = {
  name: '名字',
  tagline: '一句话印象',
  appearance: '外貌',
  personality: '性格',
  speech: '说话方式',
  background: '来历',
  goals: '想要什么',
  secrets: '秘密',
  boundaries: '底线',
}

/** A fresh tavern block: everything off, nothing invented. */
export function defaultTavern() {
  return {
    on: false,
    card: {},
    persona: '',
    scene: '',
    style: {
      pov: 'third',
      length: 'medium',
      tone: '',
      rating: 'general',
    },
    statusBar: true,
    dice: false,
    /** 色情模式：以性驱动剧情，直写身体。 */
    erotic: false,
    /** 每回合正文之后弹选项卡片。 */
    choices: true,
    /** 开局设定是否已跟用户确认过。 */
    setup: 'pending',
    memory: [],
    relations: {},
    notes: '',
  }
}

/** A fresh per-session record. */
export function defaultSession() {
  return {
    updatedAt: new Date().toISOString(),
    lang: 'zh',
    plain: { on: false, level: 'novel' },
    tavern: defaultTavern(),
  }
}

/** Coerce to a string, trimming and folding `undefined`. */
function text(value) {
  return typeof value === 'string' ? value : ''
}

/** Coerce to a boolean. */
function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/** Keep only recognised card fields, each as a trimmed string. */
export function normalizeCard(raw) {
  const card = {}
  if (raw === null || typeof raw !== 'object') return card
  for (const field of CARD_FIELDS) {
    const value = typeof raw[field] === 'string' ? raw[field].trim() : ''
    if (value.length > 0) card[field] = value
  }
  return card
}

/**
 * Defensive normalisation of one persisted session record.
 *
 * Anything unreadable degrades to a default instead of throwing: a hand-edited
 * or half-written state file must never take the plugin (and therefore the
 * prompt assembly) down.
 *
 * @param {unknown} raw - persisted record.
 * @returns {ReturnType<typeof defaultSession>} a valid session record.
 */
export function normalizeSession(raw) {
  const base = defaultSession()
  if (raw === null || typeof raw !== 'object') return base
  const plain = raw.plain ?? {}
  const tavern = raw.tavern ?? {}

  base.updatedAt = text(raw.updatedAt) || base.updatedAt
  base.lang = LANGUAGES.includes(raw.lang) ? raw.lang : 'zh'
  base.plain.on = bool(plain.on, false)
  base.plain.level = PLAIN_LEVELS.includes(plain.level) ? plain.level : 'novel'

  base.tavern.on = bool(tavern.on, false)
  base.tavern.card = normalizeCard(tavern.card)
  base.tavern.persona = text(tavern.persona)
  base.tavern.scene = text(tavern.scene)
  base.tavern.notes = text(tavern.notes)
  base.tavern.statusBar = bool(tavern.statusBar, true)
  base.tavern.dice = bool(tavern.dice, false)
  base.tavern.erotic = bool(tavern.erotic, false)
  base.tavern.choices = bool(tavern.choices, true)
  base.tavern.setup = SETUP_STATES.includes(tavern.setup) ? tavern.setup : 'pending'

  const style = tavern.style ?? {}
  base.tavern.style.pov = TAVERN_POVS.includes(style.pov) ? style.pov : 'third'
  base.tavern.style.length = TAVERN_LENGTHS.includes(style.length) ? style.length : 'medium'
  base.tavern.style.rating = TAVERN_RATINGS.includes(style.rating) ? style.rating : 'general'
  base.tavern.style.tone = text(style.tone)

  base.tavern.memory = Array.isArray(tavern.memory)
    ? tavern.memory.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : []
  base.tavern.relations = {}
  if (tavern.relations !== null && typeof tavern.relations === 'object') {
    for (const [name, attitude] of Object.entries(tavern.relations)) {
      if (typeof name === 'string' && name.trim().length > 0 && typeof attitude === 'string') {
        base.tavern.relations[name.trim()] = attitude.trim()
      }
    }
  }
  return base
}

/**
 * Resolve the state file for this profile.
 *
 * `DSH_PROFILE_DIR` is the exact directory the running host uses for profile
 * data, so it wins; `DSH_HOME` plus the profile name is the fallback, and a
 * plain `~/.dsh` home is the last resort.
 *
 * @param {NodeJS.ProcessEnv} [env] - environment to read.
 * @param {NodeJS.Platform} [platform] - only used to pick a home directory.
 * @returns {string} absolute path to the store file.
 */
export function resolveStorePath(env = process.env, platform = process.platform) {
  const profileDir = text(env.DSH_PROFILE_DIR).trim()
  if (profileDir.length > 0) return path.join(profileDir, 'plugin-data', 'dsh-storyteller', 'state.json')
  const homeRoot = text(env.DSH_HOME).trim() || path.join(platform === 'win32' ? env.USERPROFILE ?? env.HOME ?? os.homedir() : env.HOME ?? os.homedir(), '.dsh')
  const profileName = text(env.DSH_PROFILE).trim() || 'default'
  return path.join(homeRoot, 'profiles', profileName, 'plugin-data', 'dsh-storyteller', 'state.json')
}

/**
 * Sidecar JSON store keyed by session id.
 *
 * Writes are synchronous and atomic (temp file + rename): toggles are rare,
 * human-paced actions, and a half-written file is worse than a slow one.
 */
export class StateStore {
  /** @param {string} file - absolute path of the state file. */
  constructor(file) {
    this.file = file
    /** @type {{ version: number, sessions: Record<string, ReturnType<typeof defaultSession>> }} */
    this.data = { version: STORE_VERSION, sessions: {} }
    this.loaded = false
  }

  /** Read the file once; a missing or corrupt file degrades to an empty store. */
  load() {
    if (this.loaded) return this
    this.loaded = true
    let raw
    try {
      raw = fs.readFileSync(this.file, 'utf8')
    } catch {
      return this
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      try {
        fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`)
      } catch {
        /* the backup is best effort */
      }
      return this
    }
    const sessions = parsed !== null && typeof parsed === 'object' ? parsed.sessions : undefined
    if (sessions === null || typeof sessions !== 'object') return this
    for (const [id, record] of Object.entries(sessions)) {
      if (typeof id === 'string' && id.length > 0) this.data.sessions[id] = normalizeSession(record)
    }
    return this
  }

  /**
   * Read one session.
   *
   * @param {string|undefined} sessionId - session identity, or anything falsy.
   * @returns {ReturnType<typeof defaultSession>} the stored record, or fresh
   *   defaults for an unknown session (never persisted by a read).
   */
  get(sessionId) {
    this.load()
    if (typeof sessionId !== 'string' || sessionId.length === 0) return defaultSession()
    const record = this.data.sessions[sessionId]
    return record === undefined ? defaultSession() : record
  }

  /**
   * Mutate one session and persist the result.
   *
   * @param {string} sessionId - session identity.
   * @param {(record: ReturnType<typeof defaultSession>) => void} mutate - edit
   *   callback; the record is normalised before and after it runs.
   * @returns {ReturnType<typeof defaultSession>} the persisted record.
   */
  update(sessionId, mutate) {
    this.load()
    const current = normalizeSession(this.data.sessions[sessionId])
    mutate(current)
    current.updatedAt = new Date().toISOString()
    this.data.sessions[sessionId] = current
    this.trim()
    this.save()
    return current
  }

  /** Drop the oldest sessions past {@link MAX_SESSIONS}. */
  trim() {
    const entries = Object.entries(this.data.sessions)
    if (entries.length <= MAX_SESSIONS) return
    entries.sort((a, b) => String(a[1].updatedAt).localeCompare(String(b[1].updatedAt)))
    for (const [id] of entries.slice(0, entries.length - MAX_SESSIONS)) delete this.data.sessions[id]
  }

  /** Write the store atomically, creating its directory first. */
  save() {
    const dir = path.dirname(this.file)
    const body = `${JSON.stringify(this.data, null, 2)}\n`
    try {
      fs.mkdirSync(dir, { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, body, 'utf8')
      fs.renameSync(tmp, this.file)
    } catch {
      /* a failed write must not break the turn that triggered it */
    }
  }
}
