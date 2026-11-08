# 更新日志

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
- 54 条 `node:test` 用例。
