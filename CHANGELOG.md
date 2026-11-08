# 更新日志

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
