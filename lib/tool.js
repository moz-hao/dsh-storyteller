/**
 * The `story_state` tool: the tavern run's save file.
 *
 * The model reads and patches scene, memory and relations through this tool, so
 * the run survives context drift and process restarts instead of living only in
 * the model's attention. The tool is registered with a `when` condition, which
 * means a session that never opened tavern mode never sees it — not in the
 * schema set, not in the executor, not in the PTC bindings.
 *
 * @module dsh-storyteller/tool
 */

import { normalizeCard } from './state.js'

/** Maximum stored memory entries; older ones are dropped from the front. */
const MAX_MEMORY = 200

/** Maximum stored relations. */
const MAX_RELATIONS = 64

/**
 * Session id behind an agent, or `undefined` when the agent is not one of ours.
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

/** The value shape handed back to the model and the transcript. */
function snapshot(tavern) {
  return {
    ok: true,
    scene: tavern.scene,
    memory: [...tavern.memory],
    relations: { ...tavern.relations },
    notes: tavern.notes,
    card: { ...tavern.card },
    style: { ...tavern.style },
    statusBar: tavern.statusBar,
    dice: tavern.dice,
  }
}

/** A refusal value: always shaped like the success value, never a throw. */
function refusal(reason) {
  return {
    ok: false,
    reason,
    scene: '',
    memory: [],
    relations: {},
    notes: '',
    card: {},
    style: {},
    statusBar: false,
    dice: false,
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
 * relations merge by name, scene and notes replace when a non-empty value is
 * given. A session with tavern mode off is refused instead of silently written.
 *
 * @param {import('./state.js').StateStore} store - state store.
 * @param {string|undefined} sessionId - session to act on.
 * @param {{action?: string, scene?: string, memory?: string[], relations?: Array<{name?: string, attitude?: string}>, notes?: string}} args - tool arguments.
 * @returns {ReturnType<typeof snapshot>|ReturnType<typeof refusal>} the new state.
 */
export function applyStoryStatePatch(store, sessionId, args) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return refusal('拿不到会话 id，这次调用没有作用对象。')
  }
  const record = store.get(sessionId)
  if (record.tavern.on !== true) {
    return refusal('酒馆模式没有开启，story_state 不可用。让用户先执行 /tavern on。')
  }
  const action = args?.action === 'patch' ? 'patch' : 'read'
  if (action === 'read') return snapshot(record.tavern)

  const scene = text(args?.scene)
  const notes = text(args?.notes)
  const memory = Array.isArray(args?.memory) ? args.memory.map(text).filter((entry) => entry.length > 0) : []
  const relations = Array.isArray(args?.relations) ? args.relations : []

  store.update(sessionId, (next) => {
    if (scene.length > 0) next.tavern.scene = scene
    if (notes.length > 0) next.tavern.notes = notes
    for (const entry of memory) {
      if (!next.tavern.memory.includes(entry)) next.tavern.memory.push(entry)
    }
    if (next.tavern.memory.length > MAX_MEMORY) {
      next.tavern.memory = next.tavern.memory.slice(next.tavern.memory.length - MAX_MEMORY)
    }
    for (const relation of relations) {
      const name = text(relation?.name)
      const attitude = text(relation?.attitude)
      if (name.length > 0) next.tavern.relations[name] = attitude.length > 0 ? attitude : '（未记录）'
    }
    const names = Object.keys(next.tavern.relations)
    if (names.length > MAX_RELATIONS) {
      for (const name of names.slice(0, names.length - MAX_RELATIONS)) delete next.tavern.relations[name]
    }
  })

  return snapshot(store.get(sessionId).tavern)
}

/** Render one state value as model-facing text. */
export function renderState(args, value) {
  if (value?.ok !== true) return [{ type: 'text', text: `story_state 未生效：${value?.reason ?? '未知原因'}` }]
  const lines = []
  const verb = args?.action === 'patch' ? '已更新' : '当前存档'
  lines.push(`【${verb}】`)
  lines.push(`场景：${value.scene.length > 0 ? value.scene : '未设定'}`)
  lines.push(`记忆（${value.memory.length}）：`)
  if (value.memory.length === 0) lines.push('- （空）')
  else for (const entry of value.memory) lines.push(`- ${entry}`)
  const relationEntries = Object.entries(value.relations)
  lines.push(`关系（${relationEntries.length}）：`)
  if (relationEntries.length === 0) lines.push('- （空）')
  else for (const [name, attitude] of relationEntries) lines.push(`- ${name}：${attitude}`)
  if (value.notes.length > 0) lines.push(`导演笔记：${value.notes}`)
  lines.push(`状态条：${value.statusBar ? '开' : '关'}　骰子：${value.dice ? '开' : '关'}　风格：${value.style?.pov === 'first' ? '第一人称' : '第三人称'}/${value.style?.length ?? 'medium'}/${value.style?.rating ?? 'general'}`)
  return [{ type: 'text', text: lines.join('\n') }]
}

/** The model-facing description; kept long enough to teach the call shape. */
const DESCRIPTION = [
  '读写这场酒馆戏的存档：场景、记忆、人物关系。只有酒馆模式开启的会话才看得到这个工具。',
  'action=read 只读取，不写盘；action=patch 合并更新：memory 追加（自动去重），relations 按名字合并，scene/notes 用非空值替换。',
  '什么时候调用：开局先 read 一次；场景切换、关系变化、关键物件转手、有人受伤或死亡、每三到五回合，patch 一次。',
  '记忆写成一句一条、可检索的事实，例如「艾琳左肩有旧伤，阴天会疼」，不写抒情和猜测。',
].join('\n')

/**
 * Build the tool definition.
 *
 * `defineTool` is injected rather than imported so this module stays free of
 * host dependencies (and therefore testable without the harness).
 *
 * @param {{defineTool: Function, store: import('./state.js').StateStore}} options - builder inputs.
 * @returns {object} a registry-ready tool definition.
 */
export function createStoryStateTool({ defineTool, store }) {
  if (typeof defineTool !== 'function') throw new TypeError('createStoryStateTool: defineTool 必须是函数')
  return defineTool({
    name: 'story_state',
    description: DESCRIPTION,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['read', 'patch'],
        description: 'read 读取当前存档；patch 合并更新。',
      },
      scene: {
        type: 'string',
        description: '当前场景，一句话，例如「雨夜酒馆，后厨门开着，灯在晃」。只在 action=patch 时写入。',
      },
      memory: {
        type: 'array',
        items: { type: 'string' },
        description: '要追加的记忆条目，一句一条、可检索的事实。只在 action=patch 时写入。',
      },
      relations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true, description: 'NPC 名字' },
            attitude: { type: 'string', description: '对用户角色的当前态度，例如「戒备→松动」' },
          },
        },
        description: '人物关系更新，按名字合并。只在 action=patch 时写入。',
      },
      notes: {
        type: 'string',
        description: '导演笔记：这一场要推向哪里、哪些线还没收。只在 action=patch 时写入。',
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
      const verb = args?.action === 'patch' ? '更新酒馆存档' : '读取酒馆存档'
      return { title: verb, kind: 'read' }
    },
  })
}

export { normalizeCard }
