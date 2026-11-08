/**
 * The `story_state` tool: the tavern run's save file.
 *
 * The model reads and patches scene, memory, relations and the setup flag
 * through this tool, so the run survives context drift and process restarts
 * instead of living only in the model's attention. It is registered with a
 * `when` condition, so a session that never opened tavern mode never sees it.
 *
 * @module dsh-storyteller/tool
 */

import { normalizeCard } from './state.js'

/** Maximum stored memory entries; older ones are dropped from the front. */
const MAX_MEMORY = 200

/** Maximum stored relations. */
const MAX_RELATIONS = 64

/** Bilingual labels for the rendered result. */
const LABELS = {
  zh: {
    patched: '已更新',
    current: '当前存档',
    scene: '场景',
    memory: '记忆',
    relations: '关系',
    notes: '导演笔记',
    setup: '设定',
    setupDone: '已确认',
    setupPending: '待确认',
    switches: '状态条',
    dice: '骰子',
    choices: '选项卡片',
    erotic: '色情模式',
    on: '开',
    off: '关',
    empty: '（空）',
    style: '风格',
    failed: 'story_state 未生效',
  },
  en: {
    patched: 'updated',
    current: 'current save',
    scene: 'Scene',
    memory: 'Memory',
    relations: 'Relations',
    notes: 'Director notes',
    setup: 'Setup',
    setupDone: 'confirmed',
    setupPending: 'pending',
    switches: 'Status line',
    dice: 'Dice',
    choices: 'Choice card',
    erotic: 'Erotic mode',
    on: 'on',
    off: 'off',
    empty: '(empty)',
    style: 'Style',
    failed: 'story_state did not apply',
  },
}

/**
 * Session id behind an agent.
 *
 * @param {{session?: {id?: string}}|undefined} agent - host agent.
 * @returns {string|undefined} session id.
 */
export function sessionIdOf(agent) {
  const id = agent?.session?.id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

/**
 * Whether the tool should be visible for one model step.
 *
 * @param {import('./state.js').StateStore} store - state store.
 * @param {{session?: {id?: string}}|undefined} agent - host agent.
 * @returns {boolean} true only for a session that turned tavern mode on.
 */
export function storyStateVisible(store, agent) {
  const sessionId = sessionIdOf(agent)
  if (sessionId === undefined) return false
  return store.get(sessionId).tavern.on === true
}

/** The value shape handed back to the model. */
function snapshot(tavern, lang) {
  return {
    ok: true,
    lang,
    setup: tavern.setup,
    scene: tavern.scene,
    memory: [...tavern.memory],
    relations: { ...tavern.relations },
    notes: tavern.notes,
    card: { ...tavern.card },
    style: { ...tavern.style },
    statusBar: tavern.statusBar,
    dice: tavern.dice,
    choices: tavern.choices,
    erotic: tavern.erotic,
  }
}

/** A refusal value, shaped like the success value. */
function refusal(reason, lang = 'zh') {
  return {
    ok: false,
    reason,
    lang,
    setup: 'pending',
    scene: '',
    memory: [],
    relations: {},
    notes: '',
    card: {},
    style: {},
    statusBar: false,
    dice: false,
    choices: true,
    erotic: false,
  }
}

/** Trim a value to a string, dropping non-strings. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Read or patch the tavern state of one session.
 *
 * `read` never writes. `patch` merges: memory appends (deduplicated, capped),
 * relations merge by name, scene and notes replace when non-empty, and
 * `setup: true` closes the opening interview.
 *
 * @param {import('./state.js').StateStore} store - state store.
 * @param {string|undefined} sessionId - session to act on.
 * @param {{action?: string, scene?: string, memory?: string[], relations?: Array<{name?: string, attitude?: string}>, notes?: string, setup?: boolean}} args - tool arguments.
 * @returns {object} the new state or a refusal.
 */
export function applyStoryStatePatch(store, sessionId, args) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return refusal('拿不到会话 id，这次调用没有作用对象。/ No session id for this call.')
  }
  const record = store.get(sessionId)
  if (record.tavern.on !== true) {
    return refusal('酒馆模式没有开启，story_state 不可用。让用户先执行 /tavern on。/ Tavern mode is off; ask the user to run /tavern on.')
  }
  const action = args?.action === 'patch' ? 'patch' : 'read'
  if (action === 'read') return snapshot(record.tavern, record.lang)

  const scene = text(args?.scene)
  const notes = text(args?.notes)
  const closeSetup = args?.setup === true
  const memory = Array.isArray(args?.memory) ? args.memory.map(text).filter((entry) => entry.length > 0) : []
  const relations = Array.isArray(args?.relations) ? args.relations : []

  store.update(sessionId, (next) => {
    if (scene.length > 0) next.tavern.scene = scene
    if (notes.length > 0) next.tavern.notes = notes
    if (closeSetup) next.tavern.setup = 'done'
    for (const entry of memory) {
      if (!next.tavern.memory.includes(entry)) next.tavern.memory.push(entry)
    }
    if (next.tavern.memory.length > MAX_MEMORY) {
      next.tavern.memory = next.tavern.memory.slice(next.tavern.memory.length - MAX_MEMORY)
    }
    for (const relation of relations) {
      const name = text(relation?.name)
      const attitude = text(relation?.attitude)
      if (name.length > 0) next.tavern.relations[name] = attitude.length > 0 ? attitude : '—'
    }
    const names = Object.keys(next.tavern.relations)
    if (names.length > MAX_RELATIONS) {
      for (const name of names.slice(0, names.length - MAX_RELATIONS)) delete next.tavern.relations[name]
    }
  })

  const updated = store.get(sessionId)
  return snapshot(updated.tavern, updated.lang)
}

/** Render one state value as model-facing text, in the session's language. */
export function renderState(args, value) {
  const labels = LABELS[value?.lang] ?? LABELS.zh
  if (value?.ok !== true) return [{ type: 'text', text: `${labels.failed}：${value?.reason ?? '?'}` }]
  const lines = []
  lines.push(`【${args?.action === 'patch' ? labels.patched : labels.current}】`)
  lines.push(`${labels.setup}：${value.setup === 'done' ? labels.setupDone : labels.setupPending}`)
  lines.push(`${labels.scene}：${value.scene.length > 0 ? value.scene : labels.empty}`)
  lines.push(`${labels.memory}（${value.memory.length}）：`)
  if (value.memory.length === 0) lines.push(`- ${labels.empty}`)
  else for (const entry of value.memory) lines.push(`- ${entry}`)
  const relations = Object.entries(value.relations)
  lines.push(`${labels.relations}（${relations.length}）：`)
  if (relations.length === 0) lines.push(`- ${labels.empty}`)
  else for (const [name, attitude] of relations) lines.push(`- ${name}: ${attitude}`)
  if (value.notes.length > 0) lines.push(`${labels.notes}：${value.notes}`)
  lines.push(
    `${labels.switches}：${value.statusBar ? labels.on : labels.off}　${labels.dice}：${value.dice ? labels.on : labels.off}　${labels.choices}：${value.choices ? labels.on : labels.off}　${labels.erotic}：${value.erotic ? labels.on : labels.off}`,
  )
  return [{ type: 'text', text: lines.join('\n') }]
}

/** The model-facing description, kept bilingual on purpose. */
const DESCRIPTION = [
  '读写这场酒馆戏的存档：设定状态、场景、记忆、人物关系。只有酒馆模式开启的会话才看得到这个工具。',
  'Read/write this tavern run\'s save file: setup state, scene, memory, relations. Visible only while tavern mode is on.',
  '',
  'action=read 只读取；action=patch 合并写入：memory 追加（去重）、relations 按名字合并、scene/notes 用非空值替换。',
  'action=read never writes; action=patch merges: appends memory (deduplicated), merges relations by name, replaces scene/notes when non-empty.',
  '',
  '开局的设定问完之后，必须调用一次 action=patch、setup=true，把用户确认的世界、身份、NPC 写进 scene / notes / card，再开始第一场。',
  'After the opening interview, call action=patch with setup=true once, writing the confirmed world, identity and NPC into scene / notes / card, then start the first scene.',
].join('\n')

/** Raw JSON Schema for the parameters, used when the host's `defineTool` cannot be resolved. */
export const RAW_PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['read', 'patch'],
      description: 'read 读取当前存档 / read the current save；patch 合并更新 / merge an update.',
    },
    setup: {
      type: 'boolean',
      description: '设 true 表示开局的设定已经跟用户确认完（只在 action=patch 时生效）。/ true closes the opening setup interview (patch only).',
    },
    scene: {
      type: 'string',
      description: '当前场景一句话。/ One sentence for the current scene.',
    },
    memory: {
      type: 'array',
      items: { type: 'string' },
      description: '要追加的记忆条目，一句一条。/ Memory entries to append, one retrievable fact each.',
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'NPC 名字 / NPC name' },
          attitude: { type: 'string', description: '对用户角色的态度 / attitude toward the user character' },
        },
        required: ['name'],
      },
      description: '人物关系更新，按名字合并。/ Relationship updates, merged by name.',
    },
    notes: {
      type: 'string',
      description: '导演笔记：这一场要推向哪里。/ Director notes: where this run should go.',
    },
  },
  required: ['action'],
}

/** Raw JSON Schema for the result value. */
export const RAW_OUTPUT = {
  type: 'object',
  additionalProperties: true,
}

/**
 * Build the tool definition without the host's `defineTool` helper.
 *
 * `defineTool` only compiles the author-facing schema DSL and wraps arguments in
 * validation; the registry itself takes raw JSON Schema. A profile that installs
 * this plugin from a directory cannot resolve `@deepseek-ai/dsh-tools` (it is not
 * a dependency of this package and the host's copy is not on the plugin's module
 * path), so the fallback must not need it. `applyStoryStatePatch` validates its
 * own arguments, so the missing wrapper costs nothing.
 *
 * @param {import('./state.js').StateStore} store - state store.
 * @returns {object} a registry-ready tool definition.
 */
export function createRawStoryStateTool(store) {
  return {
    name: 'story_state',
    description: DESCRIPTION,
    parameters: RAW_PARAMETERS,
    output: {
      schema: RAW_OUTPUT,
      render: (args, value) => renderState(args, value),
    },
    execute(args, exec) {
      return applyStoryStatePatch(store, sessionIdOf(exec?.agent), args)
    },
    presentCall(args) {
      return { title: args?.action === 'patch' ? '更新酒馆存档 / update tavern save' : '读取酒馆存档 / read tavern save', kind: 'read' }
    },
  }
}

/**
 * Build the tool definition.
 *
 * `defineTool` is optional: when the host's copy is reachable the definition gets
 * its schema-DSL compilation and argument validation, and when it is not the raw
 * definition is used instead.
 *
 * @param {{defineTool?: Function, store: import('./state.js').StateStore}} options - builder inputs.
 * @returns {object} a registry-ready tool definition.
 */
export function createStoryStateTool({ defineTool, store }) {
  if (typeof defineTool !== 'function') return createRawStoryStateTool(store)
  return defineTool({
    name: 'story_state',
    description: DESCRIPTION,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['read', 'patch'],
        description: 'read 读取当前存档 / read the current save；patch 合并更新 / merge an update.',
      },
      setup: {
        type: 'boolean',
        description: '设 true 表示开局的设定已经跟用户确认完（只在 action=patch 时生效）。/ true closes the opening setup interview (patch only).',
      },
      scene: {
        type: 'string',
        description: '当前场景一句话。/ One sentence for the current scene.',
      },
      memory: {
        type: 'array',
        items: { type: 'string' },
        description: '要追加的记忆条目，一句一条。/ Memory entries to append, one retrievable fact each.',
      },
      relations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true, description: 'NPC 名字 / NPC name' },
            attitude: { type: 'string', description: '对用户角色的态度，例如「戒备→松动」/attitude toward the user character' },
          },
        },
        description: '人物关系更新，按名字合并。/ Relationship updates, merged by name.',
      },
      notes: {
        type: 'string',
        description: '导演笔记：这一场要推向哪里。/ Director notes: where this run should go.',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (args, value) => renderState(args, value),
    },
    execute(args, exec) {
      return applyStoryStatePatch(store, sessionIdOf(exec?.agent), args)
    },
    presentCall(args) {
      const Verb = args?.action === 'patch' ? '更新酒馆存档 / update tavern save' : '读取酒馆存档 / read tavern save'
      return { title: Verb, kind: 'read' }
    },
  })
}

export { normalizeCard }
