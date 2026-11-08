# 更新日志

## 0.2.5 — 2026-11-09

### 修复
- **/tavern on 在桌面端看起来毫无反应**：命令回执只进会话日志，composer 不渲染它，于是"开了"和"没开"长得一模一样。现在打开酒馆（或执行会顺带打开酒馆的子命令）成功后，插件会提交一条 `[[…]]` 导演指令并起一个回合，模型当场弹设定卡片——立刻可见。
- 只对「开启动作」触发一次：已经开着再 /tavern on 不会重复刷屏；status / preview / plain 一律不触发。宿主没有 `followup` 时自动退回静默行为。

### 工程
- 用例 80 → **83**（开启触发、已开不重复、只读不触发、无 `followup` 兼容）。
- 版本 0.2.4 → 0.2.5。
## 0.2.4 — 2026-11-09

### 修复
- 斜杠菜单里的参数提示还是 0.1 的旧文案（没有 `erotic` / `choices` / `setup` / `lang`），用户会以为这些子命令不存在；补全 `tavern` 与 `plain` 的 hint，并把「色情模式 / 选项卡片 / 设定卡片」写进命令描述。
- README 增加「命令回执在这个客户端里不显示」的说明：状态要看 `/tavern status` 的实际效果（第一回合会不会弹设定卡片），不要等回执。

### 工程
- 用例 79 → **80**（新增「提示文案必须列出全部子命令」）。
- 版本 0.2.3 → 0.2.4。

## 0.2.3 — 2026-11-09

### 修复
- **状态写进了 `profiles/default`**：桌面端主进程没有 `DSH_PROFILE_DIR` / `DSH_PROFILE`（那对变量只给工具子进程），旧的解析顺序于是把真实开关落到 `~/.dsh/profiles/default/plugin-data/dsh-storyteller/state.json`，谁都找不到。现在优先用宿主自己的 `profileContext.dir`（`lib/paths.js`），环境变量只作 headless 兜底；`config.statePath` 仍可钉死路径。
- **一次性迁移**：如果新路径还没有文件、而 `profiles/default` 下有一份，启动时复制过去（只复制不覆盖），老开关不丢。
- **`/tavern erotic on` 这类子命令在未开启的会话里没反应**：它只写了一个 flag，酒馆模式仍是关的，于是没有提示词、没有工具、看起来毫无动静。现在任何「只在戏里才有意义」的子命令（card/set/memory/relation/statusbar/dice/choices/erotic/setup/rating/style）在关着的会话上执行成功后，会顺带把酒馆模式和说人话打开，并在回执里说明。

### 工程
- 新增 `lib/paths.js`，把路径解析与迁移拆成可测纯函数。
- 用例 75 → **79**。
- 版本 0.2.2 → 0.2.3。

## 0.2.2 — 2026-11-09

### 修复
- **状态文件读一次就缓存，外部改动不生效**：桌面端和 web 端同时开着（或手工改了 `state.json`）时，另一个进程写的开关要重启才看得见。现在每次读取都比对文件 mtime，变了就重读；自己写盘后记录新 mtime，不会自激重载；文件被删掉时保留内存里的开关而不是忘掉。
- 外部把文件写坏（手改出语法错）会被备份成 `.corrupt-<时间戳>` 并按空库继续，不会让提示词装配报错。

### 工程
- 用例 71 → **75**：新增外部改动可见、自写不自激、文件消失降级、外部写坏降级四条。
- 版本 0.2.1 → 0.2.2。

## 0.2.1 — 2026-11-09

### 修复
- **装进 profile 后 `story_state` 工具会静默消失**：旧实现用裸 `import('@deepseek-ai/dsh-tools')` 取 `defineTool`，而本包并不依赖它、宿主的副本也不在插件的模块解析路径上（profile 里是 junction + pnpm 虚拟store），导入失败只会吞成一条 `warn`。现在工具定义改为**手写原始 JSON Schema 同步注册**，`defineTool` 变成可选增强：解析得到就用它做参数校验，解析不到也照常注册。原始 schema 已用宿主自己的 `assertSupportedJsonSchema` / `validateJsonSchemaValue` 验过，坏参数（`action` 非法、`memory` 不是数组、`relations` 缺 `name`）都会被挡下。
- 注册从 promise 里挪到 `apply` 同步路径，挂载失败会在插件行状态上暴露，而不是只留一行日志。

### 工程
- 用例 68 → **71**：新增「无 `defineTool` 也能构造并执行工具」「坏参数不写入」「伪造 host 下工具确实注册且 `when` 生效」。
- 版本 0.2.0 → 0.2.1。

## 0.2.0 — 2026-11-09

### 新增
- **酒馆模式联动说人话**：`/tavern on` 会一并打开说人话（戏要好读）；关酒馆不动说人话。
- **开局先问、不拍板**：新会话设定为「待确认」，第一回合禁止开演，必须先弹选择卡片问清世界与年代、用户扮演谁、主要 NPC 与关系、文风视角、尺度、篇幅六组；不许替用户决定、不许猜、跳过的题不许自己补。设定由 `story_state`（`setup=true`）收口后才开戏。`/tavern setup done|reset` 可手动推进/回退。
- **每回合选项卡片**：正文 → 状态条 → `ask_user_question` 弹 5–8 个贴合剧情的选项（各有说明，至少一个激进、一个保守、一个推关系、一个开外部冲突），不许写「继续」。`/tavern choices on|off` 可关。
- **色情模式** `/tavern erotic on|off`：以色情驱动剧情，露骨直写身体与器官，亲密场景写完整过程，快感落在身体反应上；在场角色一律成年人；**每回合 5–8 个选项里至少 2 个选项必须是色情导向的**；打开后不再受 `rating` 限制。
- **中英双语**：提示词、状态摘要、命令回执全部双语（`lib/i18n/zh.js`、`lib/i18n/en.js`），`/tavern lang zh|en`、`/plain lang zh|en` 按会话切换。

### 变更
- `lib/prompt.js` 改为纯分发：按会话语言选包、按开关决定注不注入；产品文案全部搬进语言包。
- `/tavern reset` 现在也会把设定打回「待确认」。
- `story_state` 增加 `setup` 参数与 `setup / choices / erotic` 三个返回字段，渲染文案随会话语言。
- 命令报错按语言本地化；被拒绝的写入仍然不改状态文件。

### 工程
- 用例 55 → **68**，新增覆盖：联动、设定待确认/已确认、选项卡片开关、色情模式、双语渲染、工具 `setup` 收口。
- 版本 0.1.0 → 0.2.0。

## 0.1.0 — 2026-11-09

首个版本。

### 说人话
- `/plain on|off`、`/plain level novel|plain`、`/plain preview`、`/plain status`。
- 网文感档：短句、结论先行、有镜头、情绪落在动作上，附禁用套话清单。
- 代码块、命令、日志、路径、报错原文、表格数字列入「不动区」。

### 酒馆模式
- `/tavern on|off`、`status`、`show`、`preview`、`help`。
- 角色卡：`name / tagline / appearance / personality / speech / background / goals / secrets / boundaries`，支持 inline JSON、`@文件.json`、合并与清空。
- 用户人设、场景、导演笔记、人物关系、记忆（add/list/clear）。
- 每回合自动状态条（默认开）：地点 / 时间 / 在场 / 你 / 态度 / 线索。
- 可选 d20 判定（`/tavern dice on`），结果写进正文与 `【判定】` 行。
- 分级三档：`general / mature / explicit`。
- 风格：`pov=third|first`、`length=short|medium|long`、`tone=…`。
- `story_state` 工具：`read` / `patch`，持久化场景、记忆、关系、笔记；仅在酒馆模式开启的会话可见。

### 工程
- 状态按 `sessionId` 存边车 JSON，不进会话历史；原子写、坏文件备份降级、256 会话上限。
- 两段提示词为纯函数，未开启会话渲染为空串，零 token 注入。
- 顶层仅依赖 `node:` 内置模块；`defineTool` 延迟导入，宿主缺包时降级为命令维护状态并告警。
