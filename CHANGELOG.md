# Changelog

格式：每个版本一个 `## <semver> — <YYYY-MM-DD>` 标题；GitHub Release 正文由 `scripts/release-notes.mjs` 从当前版本条目自动抽取，不手写。分类固定用：新增 / 变更 / 修复 / 移除 / 安全 / 测试 / 已知限制（无内容的分类省略）。

## 0.1.0 — 2026-10-26

v0.1：个人工作台骨架——以**本人身份**接入 Lark / 飞书与 GitHub，按白名单规则采集增量消息与 PR 动态，只做「采集 / 规则 / 历史」。**不发消息、不执行 review、不写 PR 评论。**

### 新增

- **插件骨架**：Host + Client 两半；`cordis.patch.yml` 插入 `id: workbench`；管理面 `POST /workbench`（`ctx.connection.admit` 认证、写操作要求 `x-dsh-workbench-client: 1`、请求体 ≤1 MiB 且只收 JSON）。
- **采集（只读）**：Lark / 飞书走 `lark-cli` 的 user 身份轮询（`im +chat-messages-list --as user`），GitHub 走 `gh api` 读 open PR 元数据；首次监听只建基线，之后只处理游标之后的增量。
- **规则**：Lark 会话按 `mode`（mention / keyword / all / off）+ 关键词 + `/review` 命令判定；GitHub 按仓库 + draft / labels / opened / new-commits 判定；命中后从文本提取 GitHub PR 链接。
- **历史**：`state.json` 保留最近事件（默认 200 条，可配）、当天统计、游标与去重集合；主面板展示状态卡 / 监听规则 / 最近事件。
- **设置页**：DSH Web「设置 → 工作台」编辑 `channels.lark` / `channels.github` / `defaults` / `storage`；保存后在 Host 侧归一化，非法项丢弃并回显错误，轮询按新配置热重排。
- **门禁**：`scripts/check-syntax.mjs`（lib 全部 `node --check`）、`check-i18n.mjs`（内联 DICT_ZH / DICT_EN 键一致 + `t()` 用键 + locale 元数据 + NS）、`check-privacy.mjs`（本机绝对路径 / 真实 token / 真实 Lark 会话 ID / 私有主机名）、`verify-plugin.mjs`（包名 / exports / patch / 客户端 id）、`release-notes.mjs`（从本文件抽取当前版本）。
- 文档：README、AGENTS.md、docs/DESIGN.md、docs/api-contract.md。

### 安全

- 只读采集：v0.1 不发送消息、不评论、不 approve / 合并 PR；`safety.outbound` 默认 `draft`，`safety.allowApprove` 设计上恒为 `false`。
- 零监听默认值：`watchedChats` / `watchedRepos` 为空时既不读也不写；只采集配置白名单内的会话与仓库。
- 凭据复用本机 `lark-cli` 与 `gh` 的登录态，插件不落库 token；状态目录 0700、文件 0600、原子写；消息正文不落日志。
- 仓库门禁禁止真实凭据 / 真实会话 ID / 本机绝对路径 / 私有主机名进入版本库。

### 已知限制

- v0.1 不执行 review、不产生任何出站动作（评论 / 回复 / approve 留给后续版本）。
- `features.pr-review` 与 `router.classifier` 只保留配置位，v0.1 不消费。
- 未做真实组织 / 真实开放平台联调，以离线门禁与离线 UI 渲染验证为主。
