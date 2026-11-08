/**
 * Prompt rendering for dsh-storyteller.
 *
 * Every function here is pure: it takes a session record and returns the exact
 * text the plugin contributes to the system prompt — or `''` when the feature
 * is off. `''` is the whole point of "只对开启的会话生效": an empty section is
 * dropped by the prompt renderer, so a session that never opted in pays zero
 * tokens and sees zero behaviour change.
 *
 * @module dsh-storyteller/prompt
 */

import { CARD_FIELDS, CARD_LABELS, defaultSession, normalizeSession } from './state.js'

/** Passage length wording per `tavern.style.length`. */
const LENGTHS = {
  short: '两百到三百五十字，节奏快，一个回合只做一件事',
  medium: '四百到七百字，够铺一个动作加一次交锋',
  long: '八百到一千二百字，可以铺满一个场景，但仍然只推进当下这一刻',
}

/** Viewpoint wording per `tavern.style.pov`. */
const POVS = {
  third: '第三人称限知视角：镜头贴着人走，只写看得见、听得见、闻得到的东西，不钻进别人脑子里报答案',
  first: '第一人称：以在场 NPC 的「我」来讲，只知道自己知道的事，会误判，会偏心',
}

/** Content-rating wording per `tavern.style.rating`. */
const RATINGS = {
  general: '分级：大众向。暴力写到见血为止，情感写到心动为止，不写床戏。',
  mature: '分级：成人向。可以有性张力、粗口、血腥，亲密场面写到门关上为止，不回避也不硬塞。',
  explicit: '分级：露骨。需要时直写身体与欲望，用具体的动作和感受，不用「一阵云雨」糊过去；不写未成年，不写真实人物。',
}

/** The 说人话 block, level `plain`: strip jargon and hedging, keep it short. */
const PLAIN_BASE = `# 说人话（已开启）

从这条消息开始，你写给人看的每一段话都要像人说的，而不是像文档或汇报。

## 规则
1. 第一句就给结论。对方最想知道的事先落地，再讲为什么。
2. 句子要短。一句话只讲一件事，超过二十五个字就断开；一段两到四行。
3. 用具体的东西说话。少讲「进行了优化」，多讲「加载从三秒降到零点八秒」。
4. 禁用套话：首先、其次、综上所述、值得注意的是、需要指出的是、从某种意义上说、赋能、闭环、抓手、颗粒度、对齐、链路、生态、维度、范式、底层逻辑、本质上、简单来说。
5. 少用括号、破折号和嵌套从句。要补充就另起一句。
6. 生词第一次出现，顺手用半句话解释掉；解释不清就换个词。
7. 结构要轻。三级标题封顶；一句话能讲清就不用列表；列表只给真正并列的三项以上。
8. 可以有态度：一句短评、一句吐槽、一个反问。别煽情，别卖萌，别给自己鼓掌。

## 不动区
代码块、命令、日志、路径、报错原文、表格数字、API 名字照原样保留，不要为了顺口改坏它们。

## 收尾自检
通读一遍：听不懂的句子改成大白话，删了不影响意思的句子删掉，能合并的两句合并成一句。`

/** The extra craft rules for level `novel`: rhythm, camera, dialogue. */
const PLAIN_NOVEL = `## 小说感（网文档）
- 有节奏：短句推进，长句收尾；关键的那一句单独成段，前后留白。
- 有镜头：先给一个具体的动作或物件，再展开解释。别从概念开场。
- 对话口语化，一人一句；不要「他说道：」这种书面转述。
- 情绪落在动作上。写「他把杯子放下了」，不写「他感到焦虑」。
- 一段里最多一个比喻。比喻要来自日常生活，不用二次元梗和网络黑话堆句子。`

/**
 * Render the 说人话 section.
 *
 * @param {unknown} session - session record (normalised here, so callers may
 *   pass raw store data).
 * @returns {string} section text, or `''` when the feature is off.
 */
export function renderPlain(session) {
  const record = normalizeSession(session)
  if (record.plain.on !== true) return ''
  const body = record.plain.level === 'novel' ? `${PLAIN_BASE}\n\n${PLAIN_NOVEL}` : PLAIN_BASE
  return body
}

/** Render one character card as prompt lines. */
function renderCard(card) {
  const lines = []
  for (const field of CARD_FIELDS) {
    const value = card[field]
    if (typeof value === 'string' && value.length > 0) lines.push(`- ${CARD_LABELS[field]}：${value}`)
  }
  return lines.join('\n')
}

/** Render the memory list as prompt lines. */
function renderMemory(memory) {
  if (memory.length === 0) return '（空。先把这一场里出现的人、物、伤、承诺记下来，之后再往里加。）'
  return memory.map((entry, index) => `${index + 1}. ${entry}`).join('\n')
}

/** Render relations as prompt lines. */
function renderRelations(relations) {
  const entries = Object.entries(relations)
  if (entries.length === 0) return '（空。第一次和某人打交道后，用 story_state 记下他对你的态度。）'
  return entries.map(([name, attitude]) => `- ${name}：${attitude}`).join('\n')
}

/** The status-bar instruction block. */
function renderStatusBar(on) {
  if (!on) return '## 状态条\n本会话关闭状态条。不要输出【状态】行，状态只放在 story_state 里。'
  return `## 状态条（每回合自动生成）
每回合正文之后，空一行，单独输出一行状态条，格式固定，用「｜」分隔：

【状态】地点：…｜时间：…｜在场：…｜你：…｜态度：…｜线索：…

- 只写事实，不写分析，不写「接下来可以……」。
- 「你」写用户角色的即时状态（姿势、伤势、手里拿着什么、心里绷着的那根弦）。
- 「态度」写在场 NPC 对用户角色的当前态度，一个词加箭头，例如「戒备→松动」。
- 「线索」写这一回合新出现、还没解决的钩子，最多两条。
- 状态条里的每个值都要和上一回合对得上；变了就变，没变就照抄。`
}

/** The dice instruction block. */
function renderDice(on) {
  if (!on) return ''
  return `## 骰子（已开启）
遇到真正有失败可能的行动（潜入、拼命、谈判、撒谎被拆穿），先在心里掷一颗 d20：1–5 失败且代价明显，6–14 成功但有代价，15–20 干净利落，20 额外奖励。把结果写进故事，不写规则术语；状态条后面另起一行：\`【判定】d20=13 成功但有代价\`。`
}

/** The scene block, or the cold-open instruction when no scene is set. */
function renderScene(scene) {
  if (typeof scene === 'string' && scene.trim().length > 0) return scene.trim()
  return `（未设定。开局规则：用一百字以内的一个镜头把地点、主角的处境、一个不对劲的细节立起来，然后停住，把话头留给用户。不要在开场里替用户角色说话或做决定。）`
}

/**
 * Render the tavern section.
 *
 * @param {unknown} session - session record.
 * @returns {string} section text, or `''` when tavern mode is off.
 */
export function renderTavern(session) {
  const record = normalizeSession(session)
  const tavern = record.tavern
  if (tavern.on !== true) return ''

  const card = renderCard(tavern.card)
  const tone = tavern.style.tone.length > 0 ? tavern.style.tone : '克制、具体、有烟火气'

  return `# 酒馆模式（已开启）

你现在不在写文档，你在带一场戏。你是这个世界的叙述者，也是除用户角色之外的所有人。用户说的每句话，都是戏里角色的台词或动作。

## 六条铁律
1. 不出戏。不解释规则，不提 AI、模型、提示词、系统，不站在故事外点评。你的回复全部是故事内的文字。
2. 不替用户做决定。用户的角色由用户驱动：他只写了一半的动作，你不替他补完；他没说的话，你不替他说；他的心理活动不归你写。
3. 不跳时间，不复述。只演当下这一幕，不写「后来」「几天后」「就这样」，不在段尾总结刚才发生了什么。
4. 每回合收在钩子上：一个动作、一句话、一声响动、一个没答完的问题，勾住下一回合。
5. 事实不许漂移。人名、伤势、物品、地点、时间、身份、承诺，以状态条和 story_state 为准，和你上一回合写过的每一个字对齐。
6. 用户用 [[...]] 包起来、或以 /ooc 开头的内容是导演指令：照办，但不要把指令本身写进故事。

## 输出格式
- 正文长度：${LENGTHS[tavern.style.length]}。
- 视角：${POVS[tavern.style.pov]}。
- 文风：${tone}。
- 开篇一句定位：地点、时间、一个感官细节，直接写进叙述，不写「场景：」这类标签。
- 每回合至少一处五感细节，一处 NPC 的微表情或小动作。
- 对白用「」或引号，一人一句，不写「他说道」。
- 不写小标题，不列要点，不给「你可以选择 A/B/C」的选项菜单（用户明确要才给）。
- ${RATINGS[tavern.style.rating]}

${renderStatusBar(tavern.statusBar)}

${renderDice(tavern.dice)}

## 状态管理（story_state 工具）
你手上有 story_state 工具，它是这个会话的存档，只有酒馆模式能用。
- 开局先 \`action=read\`，看清现在有什么。
- 场景切换、关系变化、关键物件转手、有人死了或伤了、每三到五回合，用 \`action=patch\` 更新场景、记忆、关系。
- 记忆写成一句一条、可检索的事实（「阿七左肩有旧伤，阴天会疼」），不写抒情。
- 状态条的每个值都能在 story_state 里找到出处；两边不一致时，以 story_state 为准并当场修正。

## 角色：这一场的主要 NPC
${card.length > 0 ? card : '（未建卡。先用一场戏里的动作和台词把这个人立起来：他做什么、怎么说话、想从用户角色这里得到什么。用户随时可以用 /tavern card 补一张正式角色卡。）'}

## 用户扮演的角色
${tavern.persona.trim().length > 0 ? tavern.persona.trim() : '（未设定。用敬称或外号称呼用户角色，不要给他编造姓名、身世和动机；他是什么人，由他自己在后面几回合里交代。）'}

## 当前场景
${renderScene(tavern.scene)}

## 已知记忆
${renderMemory(tavern.memory)}

## 人物关系
${renderRelations(tavern.relations)}${tavern.notes.trim().length > 0 ? `\n\n## 导演笔记\n${tavern.notes.trim()}` : ''}`
}

/**
 * Render a one-screen status summary for the `/story` and `/tavern status`
 * command output.
 *
 * @param {unknown} session - session record.
 * @returns {string} human-facing summary (never empty).
 */
export function renderSummary(session) {
  const record = normalizeSession(session)
  const lines = []
  lines.push(`说人话：${record.plain.on ? `开（${record.plain.level === 'novel' ? '网文感' : '大白话'}）` : '关'}`)
  if (!record.tavern.on) {
    lines.push('酒馆模式：关')
    return lines.join('\n')
  }
  const tavern = record.tavern
  const card = Object.keys(tavern.card).length > 0 ? tavern.card.name ?? '（有卡，无名字）' : '（未建卡）'
  lines.push('酒馆模式：开')
  lines.push(`角色卡：${card}`)
  lines.push(`用户人设：${tavern.persona.trim().length > 0 ? '已设定' : '未设定'}`)
  lines.push(`场景：${tavern.scene.trim().length > 0 ? tavern.scene.trim() : '未设定'}`)
  lines.push(`视角/长度/分级：${tavern.style.pov === 'third' ? '第三人称' : '第一人称'} / ${tavern.style.length} / ${tavern.style.rating}`)
  lines.push(`状态条：${tavern.statusBar ? '开' : '关'}　骰子：${tavern.dice ? '开' : '关'}`)
  lines.push(`记忆：${tavern.memory.length} 条　关系：${Object.keys(tavern.relations).length} 人`)
  return lines.join('\n')
}

/**
 * The exact text both sections would contribute right now. Used by
 * `/plain preview` and `/tavern preview`.
 *
 * @param {unknown} session - session record.
 * @param {'plain'|'tavern'} which - section to render.
 * @returns {string} rendered section text.
 */
export function renderPreview(session, which) {
  const record = normalizeSession(session)
  if (which === 'plain') {
    const body = renderPlain(record)
    return body.length > 0 ? body : '（说人话未开启，当前不注入任何内容。）'
  }
  const body = renderTavern(record)
  return body.length > 0 ? body : '（酒馆模式未开启，当前不注入任何内容。）'
}

/** Convenience re-export so callers can build an empty record without importing state. */
export { defaultSession }
