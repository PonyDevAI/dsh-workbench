# Changelog

格式：每个版本一个 `## <semver> — <YYYY-MM-DD>` 标题；GitHub Release 正文由 `scripts/release-notes.mjs` 从当前版本条目自动抽取，不手写。分类固定用：新增 / 变更 / 修复 / 移除 / 安全 / 测试 / 已知限制（无内容的分类省略）。

## 0.2.0 — 2026-10-26

v0.2.0：**账号与独立授权**——插件自己管理飞书 / GitHub 账号与凭据，运行时不再依赖 `lark-cli` / `gh`；采集仍是只读，**不发送消息、不评论、不执行 review**（出站能力留给 v0.3）。

### 新增

- **账号模型**：`$DSH_HOME/workbench/accounts.json` 顶层 `accounts[]`（id `acc_<12hex>`，provider `feishu` / `github`），只存身份 / 状态 / scope / 过期时间等非机密元数据；账号与监听配置分离。
- **凭据桥**：优先宿主 `ctx.credentials`（key `dsh-workbench/<accountId>/<field>`，字段 `appSecret` / `accessToken` / `refreshToken` / `token`）；宿主无该服务时回落 `$DSH_HOME/workbench/secrets.json`（目录 0700、文件 0600、原子写）。API 只回 `configuredKeys`，日志经 `redact()`。
- **飞书独立授权（user OAuth Device Flow）**：账号表单填 `appId` / `appSecret` 并选 `brand`（飞书 / Lark）与 scope（默认 `im:message offline_access`）；Host 请求 `device_authorization` 返回 `user_code` + `verification_uri`，后台轮询换 token；无回调地址、无公网入口。
- **token 生命周期**：access token 提前 5 分钟刷新，refresh token 轮换并持久化；同一账号刷新 Promise 单飞；刷新失败 / 401 → 账号标 `needs_auth`，不重试、不风暴。
- **GitHub 授权（PAT）**：粘贴 token 后 `GET /user` 校验并读取 scope / 身份；支持「从 gh 导入」一次性读取 `gh auth token`（可选，运行时仍不依赖 gh）。
- **原生 HTTP 客户端**：`lib/http.js`（Node `fetch` + 超时 + 错误分类 `auth` / `rate-limit` / `network` / `unknown` + 有限退避），`lib/clients/feishu.js`、`lib/clients/github.js` 直连飞书 OpenAPI 与 GitHub REST，`lib/channels/lark.js`、`lib/channels/github.js` 负责按账号取 token、轮询与消息 / PR 归一化，替换原 CLI 采集层。
- **设置页账号区**：设置 → 工作台 → 账号，展示账号列表（provider / 身份 / 状态 / scope / 过期 / 最近错误），提供 测试 / 重新授权 / 退出；飞书添加流程含 `user_code`、可点链接（本地二维码）与倒计时，每 2s 轮询授权结果；GitHub 添加含 PAT 输入与「从 gh 导入」。监听区新增「使用账号」下拉。
- **配置 v2**：`channels.lark.accountId` / `channels.github.accountId` 引用账号；v1 配置读入自动升级为 `version: 2`（`accountId` 为空）；未配置账号 = 该渠道不轮询。

### 变更

- **运行时零 CLI 依赖**：轮询、采集、授权、刷新全部改为原生 HTTP；`lark-cli` / `gh` 仅保留为一次性导入向导。
- `status.lark` / `status.github` 与面板状态卡改为显示账号身份与授权状态（`needs_auth` 时提示重新授权）；新增账号视图进 `state`。
- 版本升到 `0.2.0`；文档同步：README、AGENTS、`docs/accounts-auth.md`、`docs/api-contract.md`、`docs/DESIGN.md` 里程碑。

### 安全

- **凭据只进凭据层**：token / appSecret / PAT 不写 `accounts.json`、日志、API 回包、事件历史；前端只拿 `configuredKeys` / 掩码 / 状态。
- **最小 scope**：飞书默认 `im:message`（读）+ `offline_access`，发送类 scope 留到 v0.3 且显式提示；GitHub PAT 提示 `repo` 即可。
- **401 不重试**：任何 API 401 或刷新失败即 `needs_auth` 并停轮询，等用户重新授权；不静默续授、不自动弹浏览器。
- **退出即删凭据**：账号退出清空全部凭据字段并移除账号记录。
- **不新增公网面**：Device Flow 无回调地址；不开 webhook、不做事件订阅、不新增监听端口。
- 只读不变量不变：v0.2.0 无任何出站动作，`safety.outbound` 默认 `draft`、`safety.allowApprove` 恒 `false`。

### 已知限制

- v0.2.0 **仍不做 review 出站**：不发送飞书消息、不评论 PR、不 approve / request changes / 合并（v0.3）。
- GitHub 仅 PAT，Device Flow 留 v0.3+；飞书 refresh token 过期（默认 7 天）后需在账号页手动重新授权。
- 账号组织级隔离（多应用 / 多组织）未提供；一个 provider 可建多个账号，但监听配置一次只引用一个。
- 未做真实组织 / 真实开放平台联调，以离线 mock（device flow / 刷新 / 401 / 凭据桥 / 迁移）验证为主。

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
