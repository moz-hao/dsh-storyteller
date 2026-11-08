# 说书人 · dsh-storyteller

给 DeepSeek Harness 加两个开关。都默认关着，都**只对开了它的那个会话生效**：

1. **说人话**（`/plain`）——让模型写字像网络小说，不像技术文档。
2. **酒馆模式**（`/tavern`）——角色卡、你自己的人设、每回合自动状态条、d20 骰子，外加一个 `story_state` 工具把场景、记忆、人物关系存下来。

没开会话不受任何影响：不注入提示词、不占 token、不改行为、看不到 `story_state` 工具。

---

## 为什么不全局生效

全局插件只有「整个 profile 一起变」这一种粒度，那样等于把所有人的会话都改成小说腔。这个插件换了个做法：

- 两个功能各注册一段系统提示词，但**内容是个函数**，每次装配提示词时按调用方的 `session.id` 现算；
- 会话没开，函数返回空字符串，空段落会被提示词装配直接丢掉 —— 零 token、零影响；
- 开关状态存在 profile 里的一个 JSON 边车文件，按 `sessionId` 分键，**不进会话历史**，所以不吃上下文、不会污染记录，重启、恢复、换机器拷过去都还在；
- `story_state` 工具用 `register(definition, { when })` 挂在「酒馆模式开着」这个条件上，关掉的会话连工具名都看不见。

---

## 安装

### 本地目录（开发用）

```powershell
dsh plugin --profile desktop add file:D:/deepseek/chat/dsh-storyteller
```

（`file:` 后面用正斜杠，Windows 反斜杠会被当成转义。）

### 从 GitHub 装

```powershell
dsh plugin --profile desktop add github:moz-hao/dsh-storyteller
```

### 从 npm 装（发布后）

```powershell
dsh plugin --profile desktop add dsh-storyteller
```

装完重启对应 profile（桌面端退出重开，或 `dsh web` 重启）。检查是否挂上：

```powershell
dsh --profile desktop --dump-config | Select-String storyteller
```

---

## 一、说人话 `/plain`

| 命令 | 作用 |
|---|---|
| `/plain on` | 本会话开启 |
| `/plain off` | 本会话关闭 |
| `/plain` / `/plain status` | 看当前状态 |
| `/plain level novel` | 网文感（默认）：短句、有节奏、有镜头、情绪落在动作上 |
| `/plain level plain` | 纯大白话：只去术语、去套话，不追求文学性 |
| `/plain preview` | 看这一刻实际注入的提示词全文 |

它管什么：

- 结论先行、句子短、段落两到四行；
- 禁掉「首先/其次/综上所述/赋能/闭环/抓手/颗粒度/底层逻辑」这一整套；
- 生词第一次出现顺手解释，解释不清就换词；
- 结构轻：三级标题封顶，能用一句话就不用列表；
- **代码块、命令、日志、路径、报错原文、表格数字照原样**，不为顺口改坏。

它不管什么：模型该说什么内容、该用哪些工具、回答多长（长度由任务决定，不由口音决定）。

## 二、酒馆模式 `/tavern`

### 命令

| 命令 | 作用 |
|---|---|
| `/tavern on` / `off` | 本会话开关 |
| `/tavern` / `/tavern status` | 看状态：卡、人设、场景、视角、分级、记忆条数 |
| `/tavern card {"name":"艾琳","personality":"嘴硬"}` | 建卡/合并卡（只认已知字段） |
| `/tavern card @D:\cards\艾琳.json` | 从文件读卡 |
| `/tavern card clear` | 清空整张卡 |
| `/tavern set <字段> <内容>` | 写单个字段，例如 `/tavern set scene 雨夜的酒馆，后厨门开着` |
| `/tavern memory add <一句事实>` | 加一条记忆 |
| `/tavern memory list` / `clear` | 看 / 清记忆 |
| `/tavern relation 艾琳 戒备→松动` | 记一个人物态度 |
| `/tavern statusbar on\|off` | 每回合状态条（默认**开**） |
| `/tavern dice on\|off` | d20 判定（默认关） |
| `/tavern rating general\|mature\|explicit` | 分级（默认 general） |
| `/tavern style pov=third\|first length=short\|medium\|long tone=冷硬` | 视角 / 篇幅 / 语气 |
| `/tavern reset` | 清空这一场（场景、记忆、关系、笔记），**保留角色卡** |
| `/tavern reset hard` | 连角色卡和人设一起清 |
| `/tavern show` | 把酒馆状态打成 JSON |
| `/tavern preview` | 看这一刻实际注入的提示词全文 |
| `/tavern help` | 命令清单 |

### 角色卡字段

只认这些字段，别的静默忽略：

| 字段 | 中文标签 | 写什么 |
|---|---|---|
| `name` | 名字 | 艾琳 |
| `tagline` | 一句话印象 | 雨夜酒馆的老板娘，笑的时候刀在袖子里 |
| `appearance` | 外貌 | 左手总戴着一只不合时宜的皮手套 |
| `personality` | 性格 | 嘴上不饶人，心里先想着别人 |
| `speech` | 说话方式 | 句子短，爱用反问，不叫名字只叫「喂」 |
| `background` | 来历 | 十六岁那年在南边烧了一间铺子，之后没人再提 |
| `goals` | 想要什么 | 把弟弟的债还清，然后离开这座城 |
| `secrets` | 秘密 | 手套底下没有左手 |
| `boundaries` | 底线 | 不碰孩子，不欠人情 |

### 一条命令走完开局

```text
/tavern on
/tavern card {"name":"艾琳","personality":"嘴上不饶人，心里先想着别人","speech":"句子短，爱用反问","secrets":"手套底下没有左手"}
/tavern set persona 一个刚进城的外乡人，身上只有一把旧刀
/tavern set scene 雨夜的酒馆，后厨门开着，风把灯吹得直晃
/tavern style tone=冷硬，带一点戏谑
```

然后直接说话，不用再说「开始」。

### 每回合输出什么

正文 + 空一行 + 一行状态条：

```text
【状态】地点：酒馆后厨｜时间：亥时｜在场：艾琳、你｜你：左肩抵着门框，刀还在鞘里｜态度：戒备→松动｜线索：后厨少了一个伙计；灶上多着一副碗筷
```

状态条默认开着（`/tavern statusbar off` 可关）。它只写事实，不写分析，不给「接下来你可以选 A/B/C」。

### 骰子（可选）

`/tavern dice on` 之后，有失败可能的行动（潜入、拼命、谈判、撒谎被拆穿）先掷 d20：1–5 失败且代价明显，6–14 成功但有代价，15–20 干净利落，20 额外奖励。结果写进故事本身，状态条后另起一行：

```text
【判定】d20=13 成功但有代价
```

### 分级

| 值 | 尺度 |
|---|---|
| `general` | 大众向：暴力见血为止，情感心动为止 |
| `mature` | 成人向：性张力、粗口、血腥，亲密场面点到门关上 |
| `explicit` | 露骨：需要时直写身体与欲望；不写未成年、不写真实人物 |

### `story_state` 工具：这场戏的存档

只在酒馆模式开着的会话里可见。模型用它读写场景、记忆、关系：

- `action=read`：开局读一次，看清现在有什么；
- `action=patch`：场景切换、关系变化、关键物件转手、有人受伤或死亡、每三到五回合更新一次；
- 记忆一句一条、可检索（「阿七左肩有旧伤，阴天会疼」），最多留 200 条，关系最多 64 人；
- 酒馆没开时会话看不到这个工具；万一宿主管道没挂上 `defineTool`，插件会打一条告警并降级为「只靠命令维护状态」，两个功能的其它部分照常工作。

---

## 状态存在哪

```text
<profile>/plugin-data/dsh-storyteller/state.json
```

Windows 上通常是：

```text
C:\Users\<你>\.dsh\profiles\desktop\plugin-data\dsh-storyteller\state.json
```

里面按 `sessionId` 分键，形如：

```json
{
  "version": 1,
  "sessions": {
    "session-5f1c…": {
      "updatedAt": "2026-11-09T02:20:00.000Z",
      "plain": { "on": true, "level": "novel" },
      "tavern": {
        "on": true,
        "card": { "name": "艾琳" },
        "persona": "一个刚进城的外乡人",
        "scene": "雨夜的酒馆",
        "style": { "pov": "third", "length": "medium", "tone": "冷硬", "rating": "general" },
        "statusBar": true,
        "dice": false,
        "memory": ["阿七左肩有旧伤，阴天会疼"],
        "relations": { "艾琳": "戒备→松动" },
        "notes": ""
      }
    }
  }
}
```

- 文件不存在就代表两个功能全关 —— 不会为了读状态而建文件；
- 文件坏了（手改出语法错）会被备份成 `state.json.corrupt-<时间戳>`，然后按空库启动，不会让提示词装配失败；
- 最多记 256 个会话，超了按 `updatedAt` 淘汰最旧的；
- 写盘是「临时文件 + rename」的原子替换，半截文件写不进去。

## 想删干净

```text
/tavern reset hard
/plain off
```

或者直接删掉那个 `state.json`，两个功能对全部会话回到默认关闭。

---

## 排障

| 现象 | 处理 |
|---|---|
| 命令列表里没有 `/plain` | 插件没挂上：`dsh --profile <名字> --dump-config` 看有没有 `storyteller` 行，装完是否重启过 |
| 命令报「拿不到会话 id」 | 在无会话上下文里执行（脚本、ACP、子代理早期装配），这类场景本来就不该有开关 |
| 开了没效果 | `/plain preview` 或 `/tavern preview` 看实际注入的文本；有文本说明装配成功了，接着看是不是模型没照做 |
| 状态条消失 | `/tavern statusbar on`；`/tavern show` 看 `statusBar` 字段 |
| 模型开始写「接下来你可以…」 | 这是出戏，`/tavern reset` 重开一场，或把 `tone` 写得更硬 |

---

## 开发

纯 JS，无构建、无运行时依赖（顶层只 import `node:` 内置模块）：

```powershell
cd D:\deepseek\chat\dsh-storyteller
node --test
```

55 条用例，覆盖存储读改写与重载、损坏文件降级、会话隔离、提示词只在开启时非空、全部命令语法（含「被拒绝的写入不改文件」）、伪造 host 挂载后的分节与命令注册、工具的条件可见性。

目录：

```text
lib/state.js     按 sessionId 的边车存储（原子写、坏文件降级、容量上限）
lib/prompt.js    两段提示词的纯渲染函数（唯一的「产品」在这里）
lib/grammar.js   /plain、/tavern、/story 的语法与状态迁移
lib/tool.js      story_state 工具定义与 read/patch 合并逻辑
lib/index.js     cordis 插件行：分节 + 命令 + 工具条件注册
test/            node:test 用例
tools/           端到端验证用的假模型服务
examples/        角色卡示例、一场戏的剧本
```

## 端到端验证（不需要真 API key）

`tools/fake-llm.mjs` 是一个只会回一句话的假 Anthropic Messages 端点。把它接到一个一次性 profile 上，就能看见模型**实际收到的**系统提示词长度和工具清单。

```powershell
# 1) 造一个一次性 profile（用桌面端同版本 0.2.2-rc.1 的 harness）
$bin = 'C:\Users\haosu\AppData\Local\Programs\DeepSeek Harness\resources\app\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js'
node $bin --profile story2 --from-default-profile headless --dump-config
node $bin plugin --profile story2 add file:D:/deepseek/chat/dsh-storyteller

# 2) 把 provider 指向假端点：story2/cordis.patch.yml 写
#    - id: llm-deepseek
#      name: '@deepseek-ai/dsh-llm-deepseek-api-key'
#      config: { baseURL: 'http://127.0.0.1:18901' }

# 3) 起假端点，跑一轮
node tools/fake-llm.mjs
$env:DEEPSEEK_API_KEY='sk-fake-0123456789abcdef0123456789abcdef'
$env:DSH_PROFILE_DIR='C:\Users\haosu\.dsh\profiles\story2'   # 在别的 profile 会话里跑时必须改
node $bin --profile story2 "只回答两个字：收到"
```

实测结果（0.2.2-rc.1，同一套提示词，只改会话状态）：

| 会话状态 | 系统提示词长度 | 工具列表里有 `story_state` 吗 |
|---|---|---|
| 全新会话，从未开启 | 2639 字符 | 没有 |
| 同一会话，`/plain` + `/tavern` 都开 | 4714 字符 | 有 |
| 同一会话，两个再关掉 | 2639 字符 | 没有 |

也就是说：不开启 = 一个字都不多；开启 = 多出 2075 字符的提示词和一个工具；关掉 = 立刻回到原样。

## 不做的事

- 不做全局开关；
- 不往会话历史里塞事件或消息；
- 不做网页输入框徽章、不做设置页卡片（v1 用命令）；
- 不发网络请求、不读 API key。

## License

MIT
