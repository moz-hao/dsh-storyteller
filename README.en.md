# dsh-storyteller

Two switches for the DeepSeek Harness. Both are **off by default** and both are
**scoped to one session** — a session that never opted in pays zero tokens and
sees no behaviour change.

1. **Plain speech (说人话)** — `/plain` rewrites the model's prose into readable,
   web-novel Chinese: conclusion first, short sentences, concrete verbs, no
   corporate jargon. Code, commands, logs and paths stay untouched.
2. **Tavern mode (酒馆模式)** — `/tavern` turns the session into an immersive
   narrator: character card, user persona, an automatic status line every turn,
   optional d20 checks, and a `story_state` tool that persists scene, memory and
   relations to a sidecar file.

## Why nothing is global

Each feature registers one system-prompt section whose `text` is a function of
the calling session id. A session that never ran `/plain on` or `/tavern on`
renders `''`, and empty sections are dropped by the prompt renderer — no tokens,
no effect. State lives in `<profile>/plugin-data/dsh-storyteller/state.json`
keyed by session id: it never enters the session log, and it survives restarts.
The `story_state` tool is registered with a `when` condition, so sessions with
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
/plain on                        # 说人话
/plain level novel | plain
/plain preview

/tavern on                       # 酒馆模式
/tavern card {"name":"艾琳","personality":"嘴上不饶人","speech":"句子短，爱用反问"}
/tavern set persona 一个刚进城的外乡人，身上只有一把旧刀
/tavern set scene 雨夜的酒馆，后厨门开着，风把灯吹得直晃
/tavern dice on                  # optional d20
/tavern rating general | mature | explicit
/tavern reset | reset hard
/story                            # both switches at a glance
```

The full command table, card fields, status-line format and troubleshooting
live in [README.md](README.md) (Chinese).

## Development

Plain ESM JavaScript, no build step, no runtime dependencies:

```powershell
node --test
```

## License

MIT
