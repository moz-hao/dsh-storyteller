# dsh-storyteller

Two switches for the DeepSeek Harness. Both are **off by default** and both are
**scoped to one session** — a session that never opted in pays zero tokens and
sees no behaviour change.

1. **Plain speech (说人话)** — `/plain` rewrites the model's prose into readable,
   web-novel Chinese (or English). Code, commands, logs and paths stay untouched.
2. **Tavern mode (酒馆模式)** — `/tavern` turns the session into an immersive
   narrator: character card, user persona, an automatic status line every turn,
   a **choice card with 5–8 options after every prose**, optional d20 checks, an
   **erotic mode**, and a `story_state` tool that persists the setup, scene,
   memory and relations.

Turning tavern mode on also turns plain speech on (a scene should read well).
Turning it off leaves plain speech alone — `/plain off` ends that separately.

Every prompt and reply ships in **Chinese and English**; `/tavern lang en`
switches the session.

## Why nothing is global

Each feature registers one system-prompt section whose `text` is a function of
the calling session id. A session that never ran `/plain on` or `/tavern on`
renders `''`, and empty sections are dropped by the prompt renderer — no tokens,
no effect. State lives in `<profile>/plugin-data/dsh-storyteller/state.json`
keyed by session id: never in the session log, and it survives restarts. The
`story_state` tool is registered with a `when` condition, so sessions with
tavern mode off do not even see its name.

## Install

```powershell
dsh plugin --profile desktop add github:moz-hao/dsh-storyteller
# or a local checkout:
dsh plugin --profile desktop add file:D:/deepseek/chat/dsh-storyteller
```

Restart the profile, then check with `dsh --profile desktop --dump-config`.

## Use

```text
/plain on                        # plain speech
/plain level novel | plain
/plain lang zh | en
/plain preview

/tavern on                       # tavern mode (also switches plain speech on)
/tavern card {"name":"Elin","personality":"sharp-tongued","speech":"short questions"}
/tavern set persona a stranger off the last bus with one old knife
/tavern choices on | off         # choice card after the prose (default on)
/tavern erotic on | off          # sex drives the plot (default off)
/tavern dice on                  # optional d20
/tavern rating general | mature | explicit
/tavern setup done | reset       # opening-interview state
/tavern lang zh | en
/tavern reset | reset hard
/story                            # both switches at a glance
```

### The opening is an interview, not an assumption

`/tavern on` does **not** start the scene. The run is "setup pending", and the
first turn must ask — with `ask_user_question` cards — for world and period, who
the user plays, the main NPC and relationship, voice and viewpoint, rating, and
length. The prompt forbids deciding for the user, guessing, or filling skipped
answers. Only after `story_state` records `setup=true` does the prose start.

### Every turn: prose → status line → choice card

The model writes the scene, prints one `【Status】Place | Time | Present | You |
Attitude | Threads` line, then calls `ask_user_question` with 5–8 options that are
nailed to the current scene (never "continue"), each with one line of
description: at least one reckless, one careful, one pushing a relationship, one
opening an outside conflict.

### Erotic mode

`/tavern erotic on` makes sex the engine of the plot: no fade to black, explicit
anatomy, complete arcs (build-up, entry, rhythm, losing control, afterglow),
pleasure written as bodily reaction, every character an adult and willing — and
**at least 2 of the 5–8 options each turn must be sexual**.

The full command table, card fields, state schema and troubleshooting live in
[README.md](README.md) (Chinese).

## Development

Plain ESM JavaScript, no build step, no runtime dependencies:

```powershell
node --test
```

87 tests: store read/write/reload, corrupt-file fallback, session isolation,
prompt gating, full command grammar, tavern-implies-plain, setup pending/done,
choice cards, erotic mode, bilingual rendering, a fake-host mount, and the
tool's conditional visibility.

## License

MIT
