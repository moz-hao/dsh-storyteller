/**
 * English language pack — same shape as `zh.js`.
 *
 * The prompts are not translations of the Chinese ones for their own sake: each
 * language is written so the model reads natural instructions in that language.
 *
 * @module dsh-storyteller/i18n/en
 */

import { CARD_FIELDS } from '../state.js'

/** English labels for the character-card fields. */
const CARD_LABELS_EN = {
  name: 'Name',
  tagline: 'One-line impression',
  appearance: 'Appearance',
  personality: 'Personality',
  speech: 'How they talk',
  background: 'Background',
  goals: 'Wants',
  secrets: 'Secret',
  boundaries: 'Hard limits',
}

/** Passage sizes. */
const LENGTHS = {
  short: '200–350 words, fast beats, one thing happens per turn',
  medium: '400–700 words, enough room for one action and one exchange',
  long: '800–1200 words, you may fill a whole scene but still only advance this moment',
}

/** Viewpoints. */
const POVS = {
  third: 'third person limited: the camera stays with the people, only what can be seen, heard or smelled — no reporting other minds',
  first: 'first person: an NPC present in the scene narrates, knows only what they know, misjudges, plays favourites',
}

/** Content ratings. */
const RATINGS = {
  general: 'Rating: general. Violence up to first blood, feelings up to the first flutter, no sex scenes.',
  mature: 'Rating: mature. Sexual tension, profanity and blood are allowed; intimacy stops at the closed door.',
  explicit: 'Rating: explicit. Write bodies and desire directly when the scene calls for it, with concrete action and sensation; every character present is an adult.',
}

/** Render one card as prompt lines. */
function cardLines(card) {
  const lines = []
  for (const field of CARD_FIELDS) {
    const value = card[field]
    if (typeof value === 'string' && value.length > 0) lines.push(`- ${CARD_LABELS_EN[field]}: ${value}`)
  }
  return lines.join('\n')
}

/** Plain-speech section. */
function plainSection(record) {
  const base = `# Plain speech (on)

From this message on, every paragraph you write for a human must read like a person talking, not like a document or a status report.

## Rules
1. Lead with the conclusion. Put the thing they want to know first, then explain.
2. Keep sentences short. One sentence, one fact; split anything past twenty-five words. Two to four lines per paragraph.
3. Be concrete. Not "we optimised it" but "load time went from three seconds to eight hundred milliseconds".
4. Ban the filler: firstly, moreover, in conclusion, it is worth noting, it should be pointed out, from a certain perspective, leverage, synergy, alignment, granularity, ecosystem, paradigm, underlying logic.
5. Go light on parentheses, dashes and nested clauses. Need a caveat? Start a new sentence.
6. Explain a new term in half a sentence the first time it appears; if you cannot, use a different word.
7. Keep the structure light. Three heading levels max; no bullet list for something one sentence can say; lists only for genuinely parallel items — three or more.
8. An opinion is allowed: one aside, one dry joke, one question back. No melodrama, no cutesiness, no applause for yourself.

## Do not touch
Code blocks, commands, logs, paths, raw error text, table numbers and API names stay exactly as they are. Do not smooth them into prose.

## Self-check before sending
Read it once: rewrite any sentence a non-specialist cannot follow, delete any sentence whose removal changes nothing, merge two sentences that say the same thing.`

  const novel = `## Novel feel (web-fiction layer)
- Rhythm: short sentences push, a long one lands; the key line gets its own paragraph with air around it.
- Camera: open with a concrete action or object, then explain. Never open on a concept.
- Dialogue is spoken, one person per line; no "he said that:" bookkeeping.
- Put feeling into action. Write "he set the glass down", not "he felt anxious".
- One metaphor per paragraph at most, drawn from ordinary life — no meme speak stacking up.`

  return record.plain.level === 'novel' ? `${base}\n\n${novel}` : base
}

/** Status-line block. */
function statusBarBlock(on) {
  if (!on) return '## Status line\nOff for this session. Do not print a 【Status】 line; keep state inside story_state only.'
  return `## Status line (generated every turn)
After the prose, before the choice card, leave one blank line and print exactly one status line, fields separated by " | ":

【Status】Place: … | Time: … | Present: … | You: … | Attitude: … | Threads: …

- Facts only — no analysis, no "next you could…".
- "You" is the user character's immediate state: posture, wounds, what is in their hand, what they are bracing for.
- "Attitude" is how the NPCs present feel about the user character right now, one word plus an arrow, e.g. "guarded→softening".
- "Threads" lists at most two hooks this turn opened and nobody closed.
- Every value must line up with the previous turn. Changed? Change it. Unchanged? Copy it.`
}

/** Dice block. */
function diceBlock(on) {
  if (!on) return ''
  return `## Dice (on)
When an action can genuinely fail (a break-in, a desperate fight, a negotiation, a lie about to be caught), roll a d20 silently: 1–5 fails with a visible cost, 6–14 succeeds at a price, 15–20 clean, 20 with a bonus. Write the outcome into the story, never the rules; after the status line add one line: \`【Roll】d20=13 success at a price\`.`
}

/** Choice-card block. */
function choicesBlock(on, erotic) {
  if (!on) {
    return `## Choice card (off)
No option cards this session. Stop when the prose ends and let the user speak; never list A/B/C in the text.`
  }
  const eroticLine = erotic
    ? '\n- With erotic mode on, at least 2 of the 5–8 options must be sexual: name the physical direction and the heat level, keep labels explicit but short (e.g. "pin him against the door").'
    : ''
  return `## Choice card (mandatory every turn)
After the prose, call ask_user_question once and hand the next step to the user. Do not keep writing past that point.

- Exactly one question: id must be \`next\`, phrased as an in-scene hook, e.g. "What do you do first?".
- 5–8 options, each label under eight words, each with one sentence of description saying where that step pushes the story.
- Options must be nailed to the current scene: who is present, what is in whose hand, whether the door is shut, who is waiting for an answer. Never "continue" or "give me another paragraph".
- Make them genuinely different: at least one reckless, one careful, one that pushes a relationship, one that opens an outside conflict.${eroticLine}
- Do not re-offer what the user just did; no meta options other than "stop here".`
}

/** Erotic-mode block. */
function eroticBlock(on) {
  if (!on) return ''
  return `## Erotic mode (on)
This run is driven by sex. Sex is not a reward at the end, it is how the plot moves.

- No dodging, no fade to black, no convenient cuts. Write the body: specific parts, motion, heat, sound, smell, wetness.
- Use plain anatomical words (cock, cunt, clit, breasts, ass, come, wet). Do not hide behind "there", "her core", "his length".
- A sex scene gets its full arc: build-up, entry, rhythm, losing control, afterglow. No skipping, no "a storm of passion".
- Write pleasure as bodily reaction — breathing, clenching, heat, shaking, sound — not only as emotion.
- Every character present is an adult and willing. When someone says stop, it stops.
- At least 2 of the 5–8 options each turn must be sexual; the rest should still follow desire and the body.
- With erotic mode on the rating field no longer limits you: write at full explicit scale.`
}

/** Setup interview block. */
function setupBlock(setup) {
  if (setup === 'done') return ''
  return `## Open by settling the setup (mandatory — do not decide for the user)
This session has not confirmed its setup yet. Do not write prose in the first turn and do not invent a world. Ask, using ask_user_question, all six groups at once:

1. World and period: offer 3–5 concrete directions (e.g. "1990s southern Chinese town", "a steampunk capital", "a near-future deep-sea station"), not just "ancient / modern".
2. Who the user plays: identity, apparent age, relationship to the main NPC — 3–5 directions.
3. Main NPC and relationship: old flame, creditor, boss, stranger, former colleague… multi-select allowed.
4. Voice and viewpoint: third cold / third viscous / first person, each with a one-line sample.
5. Rating: general / mature / erotic-driven (erotic-driven means the /tavern erotic on rules apply immediately).
6. Length: short / medium / long.

Rules:
- At most 5 options per question, one sentence of description each; let the user type a custom answer.
- Do not decide for them, do not guess, never say "I'll assume you meant…".
- If the user skips a question, do not fill it in: restate it in one line next turn and ask again.
- After all six are answered, call story_state (action=patch, setup=true) and write the chosen world, identity, NPC and voice into scene / notes / card. Only then write the opening scene.`
}

/** Story state blocks. */
function storyBlocks(tavern) {
  const card = cardLines(tavern.card)
  const persona = tavern.persona.trim()
  const scene = tavern.scene.trim()
  const memory = tavern.memory
  const relations = Object.entries(tavern.relations)

  const sceneText = scene.length > 0 ? scene : '(unset — after the setup is confirmed, open with one shot under a hundred words: place, the user character\'s situation, one wrong detail.)'
  const memoryText = memory.length === 0
    ? '(empty — start recording the people, objects, wounds and promises that appear.)'
    : memory.map((entry, index) => `${index + 1}. ${entry}`).join('\n')
  const relationsText = relations.length === 0
    ? '(empty — after the first real exchange with someone, record their attitude through story_state.)'
    : relations.map(([name, attitude]) => `- ${name}: ${attitude}`).join('\n')

  return `## Character: the main NPC of this run
${card.length > 0 ? card : '(no card yet — establish this person through action and dialogue; the user can add a formal card later with /tavern card.)'}

## The character the user plays
${persona.length > 0 ? persona : '(unset — address the user character by title or nickname; do not invent a name, a past or a motive for them.)'}

## Current scene
${sceneText}

## Known memory
${memoryText}

## Relationships
${relationsText}${tavern.notes.trim().length > 0 ? `\n\n## Director notes\n${tavern.notes.trim()}` : ''}`
}

/** Full tavern section. */
function tavernSection(record) {
  const tavern = record.tavern
  const tone = tavern.style.tone.length > 0 ? tavern.style.tone : 'restrained, concrete, lived-in'

  return `# Tavern mode (on)

You are not writing documentation, you are running a scene. You are the narrator of this world and every character in it except the user's. Everything the user writes is dialogue or action inside the fiction.

## Six hard rules
1. Never break character. Do not explain rules, do not mention AI, models, prompts or systems, do not comment from outside the story. Every word you send is inside it.
2. Never decide for the user. Their character is theirs: if they wrote half an action, do not finish it; if they said nothing, do not speak for them; their inner life is not yours to write.
3. Never skip time, never recap. Play this moment only: no "later", "days passed", "and so it went", no summary at the end of a paragraph.
4. End every turn on a hook: an action, a line, a sound, an unanswered question.
5. Facts do not drift. Names, wounds, objects, places, times, identities and promises follow the status line and story_state, and match every word you wrote before.
6. Anything the user wraps in [[...]] or starts with /ooc is a director instruction: obey it, but never write the instruction itself into the story.

## Output format
- Prose length: ${LENGTHS[tavern.style.length]}.
- Viewpoint: ${POVS[tavern.style.pov]}.
- Voice: ${tone}.
- Open with one locating sentence — place, time, one sensory detail — written into the narration, never as a "Scene:" label.
- Every turn: at least one sensory detail and one micro-expression or small movement from an NPC.
- Dialogue in quotes, one speaker per line, no "he said".
- No headings, no bullet points; the choice card carries the branching, never the prose.
- ${RATINGS[tavern.style.rating]}

${statusBarBlock(tavern.statusBar)}

${diceBlock(tavern.dice)}

${choicesBlock(tavern.choices, tavern.erotic)}

${eroticBlock(tavern.erotic)}

${setupBlock(tavern.setup)}

## State management (story_state tool)
You have the story_state tool: this session's save file, available only in tavern mode.
- Read (\`action=read\`) once at the start of the run.
- Patch (\`action=patch\`) when the scene moves, a relationship shifts, a key object changes hands, someone is hurt or dies, and every three to five turns.
- When the setup interview closes, patch once with \`setup=true\` and write the chosen world, identity and NPC in.
- Memory entries are one retrievable fact per line ("A Qi's left shoulder is an old wound; it aches in rain"), never lyricism.
- Every value in the status line must be traceable to story_state; if the two disagree, story_state wins and you fix the line on the spot.

${storyBlocks(tavern)}`
}

/** Status summary. */
function summary(record) {
  const lines = []
  lines.push(`Plain speech: ${record.plain.on ? `on (${record.plain.level === 'novel' ? 'novel feel' : 'plain'})` : 'off'}`)
  if (!record.tavern.on) {
    lines.push('Tavern mode: off')
    return lines.join('\n')
  }
  const tavern = record.tavern
  const card = Object.keys(tavern.card).length > 0 ? tavern.card.name ?? '(card without a name)' : '(no card)'
  lines.push('Tavern mode: on')
  lines.push(`Character card: ${card}`)
  lines.push(`User persona: ${tavern.persona.trim().length > 0 ? 'set' : 'unset'}`)
  lines.push(`Scene: ${tavern.scene.trim().length > 0 ? tavern.scene.trim() : 'unset'}`)
  lines.push(`Setup: ${tavern.setup === 'done' ? 'confirmed' : 'pending (asked with cards before the first scene)'}`)
  lines.push(`Viewpoint / length / rating: ${tavern.style.pov === 'third' ? 'third' : 'first'} / ${tavern.style.length} / ${tavern.style.rating}`)
  lines.push(`Status line: ${tavern.statusBar ? 'on' : 'off'}　Dice: ${tavern.dice ? 'on' : 'off'}`)
  lines.push(`Choice card: ${tavern.choices ? 'on' : 'off'}　Erotic mode: ${tavern.erotic ? 'on' : 'off'}`)
  lines.push(`Memory: ${tavern.memory.length} entries　Relations: ${Object.keys(tavern.relations).length}`)
  return lines.join('\n')
}

/** Command replies and errors. */
const cmd = {
  noSession: 'Storyteller: no session id, so this command has nothing to act on. Run it inside a session.',
  plainOn: 'Plain speech: on. From the next turn the prose switches to web-fiction readability; code and commands stay as they are.',
  plainOff: 'Plain speech: off. This session is back to normal.',
  plainLevel: (level, on) => `Plain speech level: ${level === 'novel' ? 'novel feel' : 'plain'}.${on ? '' : ' (not switched on yet — run /plain on)'}`,
  plainLevelError: 'Level accepts novel / plain only (novel = web-fiction feel, plain = bare talk)',
  plainUnknown: (command, usage) => `Unknown subcommand: ${command}\n\n${usage}`,
  langSet: (lang) => `Language: ${lang === 'en' ? 'English' : '中文'}. Prompts and replies switch with it.`,
  langError: 'Language accepts zh / en only',

  tavernOn: (missing) => {
    const hint = missing.length > 0 ? `\nNot set up yet:\n${missing.join('\n')}\nYon can still start — the first turn asks for the setup with cards.` : ''
    return `Tavern mode: on. Plain speech was switched on with it.\nThe first turn asks (with choice cards) for world, identity, NPC, voice and rating; the prose starts only after you confirm.${hint}`
  },
  tavernOnMissingCard: '/tavern card {"name":"…"}　create a character card (optional)',
  tavernOnMissingPersona: '/tavern set persona …　who you are (optional)',
  tavernOnMissingScene: '/tavern set scene …　set an opening (optional)',
  tavernOff: 'Tavern mode: off. story_state is hidden for this session; plain speech is untouched — /plain off to end it.',
  autoTavernOn: '(That subcommand only means something inside a run, so tavern mode was switched on — plain speech came with it. /tavern off ends it.)',
  kickoff: '[[Tavern mode is on: run the setup interview now — ask, with choice cards, for world and period, who I play, the main NPC, voice and viewpoint, rating, and length in one pass. Write the first scene only after I answer. Do not decide for me.]]',
  cardUpdated: (name, count) => `Character card updated: ${name} (${count} fields). Takes effect from the next reply.`,
  cardNone: 'No character card yet. Use /tavern card {"name":"…","personality":"…"} or @card.json',
  cardCleared: 'Character card cleared.',
  cardNoFields: (fields) => `None of those fields are recognised. Available: ${fields}`,
  cardNotObject: 'A card must be a JSON object, e.g. {"name":"Elin","personality":"sharp-tongued"}',
  cardBadJson: 'Not valid JSON. Paste a {"name":"…"} object, or use @card.json',
  cardFileMissing: (file, code) => `Cannot read file: ${file} (${code})`,
  cardFileBad: (file) => `File is not valid JSON: ${file}`,
  fieldSet: (path, on) => `Written: ${path}.${on ? '' : ' (tavern mode is not on yet — /tavern on)'}`,
  fieldMissing: 'Missing field name. Use /tavern set <field> <value>, e.g. /tavern set scene a tavern in the rain',
  fieldEmpty: (field) => `Field ${field} cannot be empty; use /tavern card clear to drop the whole card`,
  fieldUnknown: (path, fields) => `Unknown field: ${path}. Available: ${fields}`,
  toggleError: (field) => `${field} accepts on / off only`,
  ratingError: (values) => `Rating accepts ${values} only`,
  povError: (values) => `Viewpoint accepts ${values} (or 第三人称 / 第一人称)`,
  lengthError: (values) => `Length accepts ${values} only`,
  styleSyntax: 'Style takes key=value pairs: pov=third|first length=short|medium|long tone=cold',
  memoryUsage: 'Usage: /tavern memory add <text>|list|clear',
  memoryAddUsage: 'Usage: /tavern memory add one retrievable fact',
  relationUsage: 'Usage: /tavern relation <name> <attitude>, e.g. /tavern relation Elin guarded→softening',
  setUsage: 'Usage: /tavern set <field> <value>, e.g. /tavern set scene a tavern in the rain',
  statusBarUsage: 'Usage: /tavern statusbar on|off',
  diceUsage: 'Usage: /tavern dice on|off',
  choicesUsage: 'Usage: /tavern choices on|off',
  eroticUsage: 'Usage: /tavern erotic on|off',
  memoryAdded: (count, entry) => `Memory added (${count} total): ${entry}`,
  memoryList: (lines) => lines,
  memoryEmpty: 'Memory is empty.',
  memoryCleared: 'Memory cleared.',
  relationSet: (name, attitude) => `Relationship recorded: ${name} → ${attitude}`,
  statusBar: (on) => `Status line: ${on ? 'on (one 【Status】 line at the end of each turn)' : 'off (state lives in story_state only)'}`,
  dice: (on) => `Dice: ${on ? 'on (roll d20 when failure is possible; outcome goes into the prose and a 【Roll】 line)' : 'off'}`,
  rating: (value) => `Rating: ${value}`,
  style: (style) => `Style updated: viewpoint ${style.pov === 'third' ? 'third' : 'first'} / length ${style.length} / voice ${style.tone.length > 0 ? style.tone : 'default'}`,
  reset: (hard) => (hard ? 'Run cleared, character card and persona included. Switches kept.' : 'Run cleared: scene, memory, relations and notes reset; character card kept; setup back to pending.'),
  setupDone: 'Setup: confirmed. Play continues on this setup; the interview will not repeat.',
  setupReset: 'Setup: back to pending. The next turn asks again with cards.',
  erotic: (on) => (on ? 'Erotic mode: on. The story is driven by sex, written at explicit scale, with at least 2 sexual options every turn.' : 'Erotic mode: off. Back to the current rating.'),
  choices: (on) => (on ? 'Choice card: on. 5–8 options after the prose each turn.' : 'Choice card: off. The prose stops and you speak for yourself.'),
  tavernUnknown: (command, usage) => `Unknown subcommand: ${command}\n\n${usage}`,
}

/** Usage strings. */
const usage = {
  plain: [
    '/plain on|off　switch plain speech',
    '/plain level novel|plain　web-fiction feel / bare talk',
    '/plain lang zh|en　prompt language',
    '/plain preview　show the injected prompt',
    '/plain status　current state',
  ].join('\n'),
  tavern: [
    '/tavern on|off　switch tavern mode (on also switches plain speech on)',
    '/tavern card <JSON | @file.json | clear>　character card',
    '/tavern set <field> <value>　one field (name/personality/persona/scene/notes…)',
    '/tavern memory add <text>|list|clear',
    '/tavern relation <name> <attitude>',
    '/tavern statusbar on|off　per-turn status line',
    '/tavern dice on|off　d20 checks',
    '/tavern choices on|off　choice card after the prose',
    '/tavern erotic on|off　erotic mode (sex drives the plot)',
    '/tavern rating general|mature|explicit',
    '/tavern style pov=third|first length=short|medium|long tone=…',
    '/tavern setup done|reset　setup confirmation state',
    '/tavern lang zh|en　prompt language',
    '/tavern reset [hard]　clear this run (hard also clears the card)',
    '/tavern show|preview|status',
  ].join('\n'),
  story: '/story　both switches at a glance',
}

export default {
  code: 'en',
  label: 'English',
  plainSection,
  tavernSection,
  summary,
  cmd,
  usage,
  previewOff: {
    plain: '(Plain speech is off — nothing is injected right now.)',
    tavern: '(Tavern mode is off — nothing is injected right now.)',
  },
}
