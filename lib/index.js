/**
 * dsh-storyteller — the plugin row.
 *
 * Two features, both **off by default** and both scoped to one session:
 *
 * 1. 说人话 (`/plain`) — rewrites the model's prose into readable, web-novel
 *    Chinese.
 * 2. 酒馆模式 (`/tavern`) — an immersive narrator with a character card, a user
 *    persona, an automatic status bar, optional d20 rolls, and `story_state`
 *    persistence for scene, memory and relations.
 *
 * Why nothing is global: the two prompt sections below are registered once but
 * their `text` is a function evaluated at every assembly against the calling
 * session's record. A session that never ran `/plain on` or `/tavern on`
 * renders `''`, and an empty section costs zero tokens and changes nothing.
 * The state lives in a sidecar JSON file keyed by session id, so it survives
 * restarts without ever entering the session log.
 *
 * @module dsh-storyteller
 */

import { StateStore } from './state.js'
import { migrateLegacyState, resolveStatePath } from './paths.js'
import { packFor, renderPlain, renderTavern } from './prompt.js'
import { MUTATING_SUBCOMMANDS, handlePlain, handleStory, handleTavern, splitHead } from './grammar.js'
import { createStoryStateTool, sessionIdOf, storyStateVisible } from './tool.js'

/** Plugin row name. */
export const name = 'storyteller'

/** Services this row cannot work without. */
export const inject = ['systemPrompt', 'commands']

/**
 * Section placement: after the tool guidance (5000–3000) and the harness
 * source/web-surface blocks, but before the deployment persona suffix (10200) —
 * late enough that the style rules are the freshest thing in the prompt.
 */
export const SECTION_ORDERS = {
  plain: 10150,
  tavern: 10160,
}

/** Command metadata shown in the slash-command discovery list. */
const PLAIN_INPUT = { hint: 'on | off | level novel|plain | lang zh|en | preview | status' }
const TAVERN_INPUT = {
  hint: 'on | off | card <json|@file|clear> | set <field> <value> | memory | relation | statusbar | dice | choices | erotic | rating | style | setup | lang | reset | preview | status',
}
const STORY_INPUT = { hint: 'help' }

/**
 * Mount the plugin.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {{statePath?: string}} [config] - composition config; `statePath` is
 *   mainly for tests and for pinning the sidecar in a non-standard profile.
 * @returns {void}
 */
export function apply(ctx, config = {}) {
  // `profileContext.dir` is the live profile the app booted; the environment is
  // only a fallback for headless runs, because the desktop process does not carry
  // DSH_PROFILE_DIR and an env-only guess lands in `profiles/default`.
  const liveProfile = typeof ctx.get === 'function' ? ctx.get('profileContext') : undefined
  const statePath = resolveStatePath({ config, profileContext: liveProfile })
  // Only a real host profile migrates a leftover from `profiles/default`; a test
  // harness or a scratch profile must keep its own empty state.
  if (typeof liveProfile?.dir === 'string' && liveProfile.dir.length > 0) migrateLegacyState(statePath)
  const store = new StateStore(statePath)

  /** Session id of the calling agent, or undefined outside a session. */
  const idOf = (agent) => sessionIdOf(agent)

  // --- prompt contributions: dynamic text, per-session gating ----------------

  ctx.systemPrompt.section({
    name: 'storyteller:plain',
    order: SECTION_ORDERS.plain,
    text: (context) => renderPlain(store.get(idOf(context?.agent))),
  })

  ctx.systemPrompt.section({
    name: 'storyteller:tavern',
    order: SECTION_ORDERS.tavern,
    text: (context) => renderTavern(store.get(idOf(context?.agent))),
  })

  // --- human command surface -------------------------------------------------

  /**
   * Enqueue one director note so the run actually starts, visibly.
   *
   * Command results are recorded in the session log but the desktop composer does
   * not render them, so a bare `/tavern on` used to look like nothing happened.
   * The toggles that *start* a run therefore submit one `[[…]]` note — the tavern
   * prompt already treats `[[…]]` as an out-of-character director instruction —
   * and the model answers with the setup cards.
   *
   * @param {{followup?: Function}|undefined} agent - receiving agent.
   * @param {string} text - director note.
   * @returns {void}
   */
  const enqueueKickoff = (agent, text) => {
    try {
      agent?.followup?.({ content: [{ type: 'text', text }], source: { kind: 'user' } })
    } catch {
      /* a host without followup keeps the silent behaviour */
    }
  }

  /** Register one command, resolving the session id and refusing politely without one. */
  const register = (definition, handler, options = {}) => {
    ctx.commands.register({
      name: definition.name,
      description: definition.description,
      input: definition.input,
      handler: (invocation) => {
        const sessionId = idOf(invocation?.agent)
        if (sessionId === undefined) {
          return {
            kind: 'error',
            text: '说书人：拿不到会话 id，这条命令没有作用对象。请在会话里执行。',
          }
        }
        const rawInput = invocation?.rawInput ?? ''
        const wasOn = store.get(sessionId).tavern.on === true
        const result = handler(store, sessionId, rawInput)
        if (options.kickoffOnStart === true && result.kind === 'success' && !wasOn && store.get(sessionId).tavern.on === true) {
          const { head } = splitHead(rawInput)
          const command = head === '' ? 'status' : head
          if (command === 'on' || MUTATING_SUBCOMMANDS.has(command)) {
            enqueueKickoff(invocation?.agent, packFor(store.get(sessionId)).cmd.kickoff)
          }
        }
        return result
      },
    })
  }

  register(
    {
      name: 'plain',
      description: '说人话：把回复改成网文口感的短句白话（只对本会话生效）',
      input: PLAIN_INPUT,
    },
    handlePlain,
  )

  register(
    {
      name: 'tavern',
      description: '酒馆模式：设定卡片 / 角色卡 / 人设 / 状态条 / 选项卡片 / 骰子 / 色情模式 / 场景记忆（只对本会话生效）',
      input: TAVERN_INPUT,
    },
    handleTavern,
    { kickoffOnStart: true },
  )

  register(
    {
      name: 'story',
      description: '看说书人两个功能在本会话的开关状态',
      input: STORY_INPUT,
    },
    handleStory,
  )

  // --- the tavern save-file tool, visible only where tavern mode is on -------

  // Registered synchronously and without `defineTool`: a profile that installs
  // this package from a directory or from git cannot resolve
  // `@deepseek-ai/dsh-tools` — it is not a dependency of this package and the
  // host's copy is not on the plugin's module path. The registry takes raw JSON
  // Schema, and the patch path validates its own arguments, so the helper is
  // optional; losing it must never lose the tool.
  ctx.inject(['tools'], (child) => {
    const tools = child?.tools
    if (tools === undefined || typeof tools.register !== 'function') return
    try {
      const definition = createStoryStateTool({ store })
      const dispose = tools.register(definition, {
        when: ({ agent }) => storyStateVisible(store, agent),
      })
      child.effect?.(() => () => {
        if (typeof dispose === 'function') dispose()
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      child.logger?.warn?.(`storyteller: story_state 工具没挂上（${detail}）。酒馆模式仍可用，只是状态改由命令维护。`)
    }
  })
}


