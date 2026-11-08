# 说书人 · dsh-storyteller

给 DeepSeek Harness 加两个开关。都默认关着，都**只对开了它的那个会话生效**：

1. **说人话**（`/plain`）——让模型写字像网络小说，不像技术文档。
2. **酒馆模式**（`/tavern`）——角色卡、你自己的人设、每回合自动状态条、每回合正文后的选项卡片、d20 骰子、色情模式，外加一个 `story_state` 工具把设定、场景、记忆、关系存下来。

开酒馆模式会**顺手把说人话也打开**：戏要好读。关掉酒馆不会关说人话，要关就 `/plain off`。

没开会话不受任何影响：不注入提示词、不占 token、不改行为、看不到 `story_state` 工具。

中文 / English 两套提示词与回执，`/tavern lang en` 一键切换。

---

## 为什么不全局生效

全局插件只有「整个 profile 一起变」这一种粒度，那样等于把所有人的会话都改成小说腔。这个插件换了个做法：

- 两个功能各注册一段系统提示词，但**内容是个函数**，每次装配提示词时按调用方的 `session.id` 算；
- 会话没开，函数返回空字符串，空段落会被提示词装配直接丢掉 —— 零 token、零影响；
- 开关状态存在 profile 里的 JSON 边车文件，按 `sessionId` 分键，**不进会话历史**，所以不吃上下文、不污染记录，重启、恢复都还在；
- `story_state` 工具用 `register(definition, { when })` 挂在「酒馆模式开着」这个条件上，关掉的会话连工具名都看不见；
- 工具的 schema 是**手写的原始 JSON Schema**，不依赖宿主的 `defineTool`：从目录或 git 装进 profile 时解析不到 `@deepseek-ai/dsh-tools` 也不会丢工具。

---

## 安装

### 本地目录（开发用）

```powershell
dsh plugin --profile desktop add file:D:/deepseek/chat/dsh-storyteller
```

### 从 GitHub 装

```powershell
dsh plugin --profile desktop add github:moz-hao/dsh-storyteller
```

装完重启 profile。检查是否挂上：

```powershell
dsh --profile desktop --dump-config | Select-String storyteller
```

---

## 一、说人话 `/plain`

| 命令 | 作用 |
|---|---|
| `/plain on` / `off` | 本会话开关 |
| `/plain` / `status` | 看状态 |
| `/plain level novel` | 网文感（默认）：短句、有节奏、有镜头、情绪落在动作上 |
| `/plain level plain` | 纯大白话：只去术语和套话 |
| `/plain lang zh` / `en` | 换提示词语言（对两个功能一起生效） |
| `/plain preview` | 看这一刻实际注入的提示词全文 |

代码块、命令、日志、路径、报错原文、表格数字、API 名字都在**不动区**，不会为了顺口被改坏。

## 二、酒馆模式 `/tavern`

### 命令

| 命令 | 作用 |
|---|---|
| `/tavern on` / `off` | 开关（on 同时打开说人话） |
| `/tavern` / `status` | 看状态：卡、人设、场景、设定、视角、分级、卡片、色情模式 |
| `/tavern card {"name":"艾琳","personality":"嘴硬"}` | 建卡/合并卡（只认已知字段） |
| `/tavern card @D:\cards\艾琳.json` | 从文件读卡 |
| `/tavern card clear` | 清空整张卡 |
| `/tavern set <字段> <内容>` | 写单个字段，例如 `/tavern set scene 雨夜的酒馆，后厨门开着` |
| `/tavern memory add <一句事实>` / `list` / `clear` | 记忆 |
| `/tavern relation 艾琳 戒备→松动` | 人物态度 |
| `/tavern statusbar on\|off` | 每回合状态条（默认开） |
| `/tavern choices on\|off` | 每回合正文后的选项卡片（默认开） |
| `/tavern erotic on\|off` | 色情模式（默认关） |
| `/tavern dice on\|off` | d20 判定（默认关） |
| `/tavern rating general\|mature\|explicit` | 分级（色情模式打开后不再受限） |
| `/tavern style pov=third\|first length=short\|medium\|long tone=冷硬` | 视角 / 篇幅 / 语气 |
| `/tavern setup done\|reset` | 设定确认状态（正常不用手动敲，模型问完会自己关） |
| `/tavern lang zh\|en` | 换提示词语言 |
| `/tavern reset` | 清这一场（场景、记忆、关系、笔记），**保留角色卡**，设定回到待确认 |
| `/tavern reset hard` | 连角色卡和人设一起清 |
| `/tavern show` / `preview` / `help` | 看 JSON / 看提示词 / 命令清单 |

### 开局：先问，不拍板

`/tavern on` 之后**不会直接开演**。设定状态是「待确认」，模型第一回合必须先弹卡片，把六组一次问完：

1. 世界与年代（给 3–5 个具体方向，不是「古代／现代」这种粗选项）
2. 用户扮演谁（身份、年龄感、和主要 NPC 的关系）
3. 主要 NPC 与关系（旧情人、债主、上司、陌生人……可多选）
4. 文风与视角（第三人称冷硬／第三人称黏稠／第一人称，各配一句示例）
5. 尺度（大众／成人／色情驱动）
6. 篇幅（短／中／长）

规则写死在提示词里：**不替用户决定、不要猜、跳过的问题不许自己补**。六组问完，模型调用 `story_state`（`setup=true`）把世界观、身份、NPC 写进存档，然后才写第一场。

用 `/tavern setup reset` 可以把设定打回待确认，重新走一遍。

### 每回合：正文 → 状态条 → 选项卡片

顺序是固定的：

1. **正文**（网文口感，长度和视角按 `style`）
2. **状态条**（默认开）：`【状态】地点：…｜时间：…｜在场：…｜你：…｜态度：…｜线索：…`
3. **选项卡片**（默认开）：调用 `ask_user_question` 弹 5–8 个选项，一个 label 一行、带说明；要求贴着当前剧情（谁在场、手里有什么、门关没关），不许写「继续」「再来一段」这种空选项；至少一个激进、一个保守、一个往人物关系上拱、一个往外部冲突上拱。

选项卡片就是 Harness 原生的提问卡，点一下就把这句话送回戏里；你也可以在卡片里自己写。

```text
【状态】地点：酒馆后厨｜时间：亥时｜在场：艾琳、你｜你：左肩抵着门框｜态度：戒备→松动｜线索：后厨少了一个伙计
```

### 色情模式

`/tavern erotic on` 之后：

- 剧情**以色情为驱动**，性不是结尾的奖励，是推进方式；
- 不回避、不淡出、不打码：写具体部位、动作、温度、声音、气味、湿度；
- 器官用直白词，不用「那处」「密处」这类遮词；
- 一次亲密场景写完整过程：前戏、进入、节奏、失控、余韵，不跳段；
- 快感落在身体反应上（呼吸、痉挛、发热、发抖、出声），不是只写情绪；
- **每回合 5–8 个选项里，至少 2 个选项必须是色情导向的**，其余选项也顺着欲望写；
- 在场角色一律成年人、自愿；角色说停就停；
- 打开色情模式后不再受 `rating` 限制。

关掉就回到当前分级尺度。

### 角色卡字段

| 字段 | 中文标签 | 写什么 |
|---|---|---|
| `name` | 名字 | 艾琳 |
| `tagline` | 一句话印象 | 雨夜酒馆的老板娘，笑的时候刀在袖子里 |
| `appearance` | 外貌 | 左手总戴着一只不合时宜的皮手套 |
| `personality` | 性格 | 嘴上不饶人，心里先想着别人 |
| `speech` | 说话方式 | 句子短，爱用反问 |
| `background` | 来历 | 十六岁那年在南边烧了一间铺子 |
| `goals` | 想要什么 | 把弟弟的债还清，然后离开这座城 |
| `secrets` | 秘密 | 手套底下没有左手 |
| `boundaries` | 底线 | 不碰孩子，不欠人情 |

### 一条命令走完开局

```text
/tavern on
/tavern card {"name":"艾琳","personality":"嘴上不饶人，心里先想着别人","speech":"句子短，爱用反问"}
/tavern set persona 一个刚进城的外乡人，身上只有一把旧刀
```

然后等它弹设定卡片 —— 选完才会开戏。

### 中英文

`/tavern lang en`（或 `/plain lang en`）之后，注入的提示词、状态摘要、命令回执全部换成英文；`zh` 换回来。语言是按会话存的，和别的会话互不影响。

---

## 状态存在哪

```text
<profile>/plugin-data/dsh-storyteller/state.json
```

路径由宿主自己的 `profileContext.dir` 决定（`<profile>/plugin-data/dsh-storyteller/state.json`），Windows 上通常是 `C:\Users\<你>\.dsh\profiles\desktop\plugin-data\dsh-storyteller\state.json`；`profiles/default` 下的旧文件会在启动时一次性迁移过去。按 `sessionId` 分键，形如：

```json
{
  "version": 1,
  "sessions": {
    "session-5f1c…": {
      "updatedAt": "2026-11-09T02:20:00.000Z",
      "lang": "zh",
      "plain": { "on": true, "level": "novel" },
      "tavern": {
        "on": true,
        "card": { "name": "艾琳" },
        "persona": "一个刚进城的外乡人",
        "scene": "雨夜的酒馆",
        "style": { "pov": "third", "length": "medium", "tone": "冷硬", "rating": "general" },
        "statusBar": true,
        "dice": false,
        "choices": true,
        "erotic": false,
        "setup": "done",
        "memory": ["阿七左肩有旧伤，阴天会疼"],
        "relations": { "艾琳": "戒备→松动" },
        "notes": ""
      }
    }
  }
}
```

- 文件不存在 = 两个功能全关，不会为了读状态去建文件；
- 文件坏了会备份成 `state.json.corrupt-<时间戳>`，然后按空库启动；
- 最多记 256 个会话，超了按 `updatedAt` 淘汰最旧的；
- 写盘是「临时文件 + rename」的原子替换；读取按 mtime 监听，另一个窗口（或另一个 profile 进程）改了状态、甚至你手工改文件，都会在下一步生效。

删干净：`/tavern reset hard` + `/plain off`，或者直接删那个 `state.json`。

---

## 排障

| 现象 | 处理 |
|---|---|
| 命令列表里没有 `/plain` | 插件没挂上：`dsh --profile <名字> --dump-config` 看有没有 `storyteller` 行，装完是否重启过 |
| 敲了 `/tavern erotic on` 毫无反应 | 命令必须**行首**带 `/`；客户端斜杠菜单是**按会话缓存**的，刚装完/刚重启时先输入 `/` 等菜单加载完再回车（菜单没热时回车会被静默丢弃）。会话日志里有 `command/run` 就说明已经到宿主了 |
| 开了酒馆但一直不弹设定卡片 | `/tavern status` 看「设定」是否「待确认」；`/tavern preview` 看提示词里有没有「开局先补齐设定」 |
| 没有选项卡片 | `/tavern choices on`；确认 `ask_user_question` 工具在这个 preset 里可用 |
| 说人话自己没了 | 开酒馆会打开它，关掉酒馆不会关它；要关自己敲 `/plain off` |
| 色情模式没生效 | `/tavern status` 看「色情模式」；再 `/tavern preview` 确认提示词里有那一段 |
| 命令报「拿不到会话 id」 | 在无会话上下文里执行（脚本、ACP、子代理早期装配），这类场景本来就不该有开关 |

---

## 开发

纯 JS，无构建、无运行时依赖（顶层只 import `node:` 内置模块）：

```powershell
cd D:\deepseek\chat\dsh-storyteller
node --test
```

80 条用例：存储读改写与重载、坏文件降级、会话隔离、提示词只在开启时非空、全部命令语法（含「被拒绝的写入不改文件」）、酒馆联动说人话、设定待确认/已确认、选项卡片开关、色情模式、中英双语渲染、伪造 host 挂载后的分节与命令注册、工具条件可见性。

目录：

```text
lib/state.js         按 sessionId 的边车存储（原子写、坏文件降级、容量上限）
lib/prompt.js        纯渲染入口：按会话语言选包、按开关决定注不注入
lib/i18n/zh.js       中文语言包：两段提示词 + 命令回执 + 状态摘要
lib/i18n/en.js       英文语言包（与 zh 同构）
lib/grammar.js       /plain、/tavern、/story 的语法与状态迁移
lib/tool.js          story_state 工具（read/patch、setup 收口）
lib/index.js         cordis 插件行：分节 + 命令 + 工具条件注册
test/                node:test 用例
tools/               端到端验证用的假模型服务
examples/            角色卡示例、一场戏的剧本
```

## 端到端验证（不需要真 API key）

`tools/fake-llm.mjs` 是一个只会回一句话的假 Anthropic Messages 端点。把它接到一次性 profile 上，就能看见模型**实际收到的**系统提示词长度和工具清单：

```powershell
$bin = 'C:\Users\haosu\AppData\Local\Programs\DeepSeek Harness\resources\app\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js'
node $bin --profile story2 --from-default-profile headless --dump-config
node $bin plugin --profile story2 add file:D:/deepseek/chat/dsh-storyteller
# cordis.patch.yml 里把 llm-deepseek 的 baseURL 指到 http://127.0.0.1:18901
node tools/fake-llm.mjs
$env:DEEPSEEK_API_KEY='sk-fake-0123456789abcdef0123456789abcdef'
$env:DSH_PROFILE_DIR='C:\Users\haosu\.dsh\profiles\story2'   # 在别的 profile 会话里跑时必须改
node $bin --profile story2 "只回答两个字：收到"
```

实测（0.2.2-rc.1，同一套提示词，只改会话状态）：未开 2639 字符且无 `story_state`；zh 开 5690 且有；en + 色情 + 选项 + 设定待确认 11520，四个标记齐全且无中文泄漏；设定已确认 + 选项关 9392，采访块消失。

## 不做的事

- 不做全局开关；
- 不往会话历史里塞事件或消息；
- 不做网页输入框徽章、不做设置页卡片；
- 不发网络请求、不读 API key；
- **不替用户拍板设定**：没确认过的世界、身份、NPC，模型不许自己编。

## License

MIT
