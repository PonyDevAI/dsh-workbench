# AGENTS.md — dsh-workbench 项目规范（AI / 自动化代理）

本文件是**在这个仓库里工作时必须遵守的项目级规范**。全局规范见 `~/.dsh/AGENTS.md`；本文件只写项目特有约束。架构、槽位、Feature 契约与 config / state schema 见 [`docs/DESIGN.md`](docs/DESIGN.md)，账号与授权见 [`docs/accounts-auth.md`](docs/accounts-auth.md)，Host ⇄ Client 协议见 [`docs/api-contract.md`](docs/api-contract.md)。

## 0. 一句话与关键标识

DSH Web 插件：个人工作台——以 **Pony 本人身份**接入 Lark / 飞书与 GitHub，按白名单规则采集增量消息与 PR 动态，只做「采集 / 规则 / 历史」；**不发消息、不执行 review、不写 PR 评论**。

**能力边界**：v0.2.0 = v0.1 只读采集 + 规则 + 运行记录 + **插件自己的账号体系与独立授权**（飞书 user OAuth Device Flow、GitHub PAT）。运行时**零 CLI 依赖**（只直连 OpenAPI / REST），`lark-cli` / `gh` 仅保留为一次性导入向导；v0.2.0 仍**没有任何出站动作**，没有 bot 身份、公网 webhook、事件订阅、独立服务 / 新端口。

关键标识（改动前先确认一致，`scripts/verify-plugin.mjs` 会校验）：

- 包名 `@ponydev/dsh-workbench`；插件 `name` `dsh-workbench`
- profile patch insert id `workbench`
- 路由前缀 `/workbench`（写操作要求 `x-dsh-workbench-client: 1`）
- 状态目录 `$DSH_HOME/workbench`（`config.json` / `accounts.json` / `state.json` / `workbench.log`，fallback 时 `secrets.json`）
- i18n NS `dsh-workbench`
- `engines.dsh` `>=0.2.1-rc.2 <0.3.0`；`node >=22.5`
- 凭据 key 前缀 `dsh-workbench/<accountId>/<field>`；账号 id `acc_<12hex>`；`config.json` 当前 `version: 2`

## 1. 目录与职责

```
lib/index.js          Host 入口：/workbench 路由、connection.admit 认证围栏、轮询器装配、状态目录
lib/config.js         默认配置 / 归一化 / 保存（config v1 → v2 迁移，永不抛异常）
lib/accounts.js       账号存储与视图（accounts.json 只存非机密元数据；AccountView 只回 configuredKeys）
lib/account-auth.js   账号授权与 token 生命周期（飞书 Device Flow / 提前刷新 / PAT 校验 / 导入 / 退出）
lib/credentials.js    凭据桥（ctx.credentials 优先；无该服务时 0600 secrets.json 兜底）
lib/http.js           轻量 HTTP 客户端（fetch + AbortController 超时 + 错误分类 + 有限退避）
lib/clients/feishu.js 飞书 / Lark 客户端（device_authorization / token / user_info / chats / messages）
lib/clients/github.js GitHub REST 客户端（/user、open pulls；只读）
lib/channels/lark.js  飞书渠道适配器（按账号取 token、轮询、归一化 envelope、错误归类，只读）
lib/channels/github.js GitHub 渠道适配器（PAT 轮询 open PR、归一化、错误归类，只读）
lib/api.js            管理面端点（state / accounts.* / config.save / 手动轮询 / history.clear）
lib/poller.js         采集引擎（轮询 + 规则 + 事件历史；按账号取 token，401 标 needs_auth）
lib/rules.js          规则匹配（纯函数，可离线测试）
lib/state.js          运行时状态（游标 / 去重 / 事件历史 / 统计）
lib/store.js          私有目录 + 原子 JSON 存储（0700 / 0600 / tmp+fsync+rename）
lib/shell.js          子进程封装（execFile；仅一次性导入 `gh auth token` 时允许使用）
lib/log.js            脱敏日志（redact：token / appSecret / Authorization / cookie）
lib/client.js         手写 ModuleLoader bundle：工作台面板 + 设置页（账号 / 监听 / 默认 / 存储）+ i18n
cordis.patch.yml      bundle patch（插入 id: workbench + 默认配置）
locale/               zh / en 元数据（title / description）
scripts/              门禁与离线测试（check-syntax / check-i18n / check-privacy / verify-plugin / release-notes / smoke / render-test）
docs/                 DESIGN、accounts-auth、api-contract
test-render.html      离线 UI 渲染页（假数据；含账号 / needs_auth 状态）
```

**硬约束**：

- **运行时零 CLI 依赖**：轮询、采集、授权、刷新只走 `lib/http.js`（Node 内置 `fetch`），**不得**在运行时 spawn `lark-cli` / `gh`；唯一例外是 `accounts.importGh` 一次性读取 `gh auth token`（经 `lib/shell.js`），且失败不得影响插件运行。
- **凭据只经 `lib/credentials.js`**：明文 token / appSecret / PAT 只允许出现在凭据层与调用方内存；`accounts.json`、日志、API 回包、事件历史**永不含明文**，API 只回 `configuredKeys`（字段名）。
- **Host 与 Client 不互相 import**；Client 不读文件 / 环境变量，跨端数据**只走 `/workbench` 的 JSON 协议**。
- **v0.2.0 不做出站动作**：不发送 / 回复飞书、不评论 / approve / 合并 PR、不改工作区。`features['pr-review']` 与 `router.classifier` 仅是 v0.3+ 配置位。
- 核心零运行时依赖、无构建：不引入 TypeScript 编译链 / 打包器 / 框架依赖；HTTP 请求不得绕过 `lib/http.js` 直接 `fetch`（超时 / 错误分类 / 退避要统一）。
- 新增 provider = `lib/clients/<provider>.js` + `credentials.js` 字段约定 + `accounts.js` 的 provider 白名单 + 文档（`docs/accounts-auth.md`），不在内核写平台分支。
- 改 config / state schema 先改 `docs/DESIGN.md` §8 / `docs/accounts-auth.md` §5 与 `lib/config.js`，再改设置页与代码。

## 2. 修改前必须做

1. `git status`、`git log --oneline -3` 确认工作区状态与当前分支；
2. 改协议 / 账号端点先改 [`docs/api-contract.md`](docs/api-contract.md) 与 [`docs/accounts-auth.md`](docs/accounts-auth.md)，再同时改 Host 与 Client；
3. 改 config / state / 凭据 schema 先改对应文档（`DESIGN.md` §8 / `accounts-auth.md` §1、§5），再改 `lib/config.js`、`lib/credentials.js`、设置页；
4. 涉及安全不变量（凭据、401、scope、退出、认证、白名单、只读、日志）的改动，先在本文件第 5 节核对，改动必须能说明为什么不破坏它；
5. 不修改 `package.json` / `cordis.patch.yml` 中的标识字段而不跑 `node scripts/verify-plugin.mjs`。

## 3. 提交前必须通过

```bash
npm run check                   # 语法 + i18n + 隐私 + 插件标识一致性（四道门禁）
npm run smoke                   # Host 侧离线冒烟（mock fetch，不触网）
npm run test-ui                 # 离线渲染 test-render.html（假数据，含账号区状态）
node scripts/check-syntax.mjs   # lib/**/*.js 逐个 node --check
node scripts/check-i18n.mjs     # DICT_ZH/DICT_EN 键一致 + t('key') + locale 元数据 + NS
node scripts/check-privacy.mjs  # 本机路径 / 真实 token / 真实会话 ID / 私有主机名
node scripts/verify-plugin.mjs  # package.json exports / engines / manifestVersion / patch / client id
node scripts/release-notes.mjs  # 从 CHANGELOG 抽取当前版本（发布前）
for f in scripts/*.mjs; do node --check "$f"; done   # 门禁脚本自身语法
```

其中门禁语义：

- `check-syntax.mjs`：`lib/**/*.js` 全部 `node --check`，任何文件失败即非 0；
- `check-i18n.mjs`：解析 `lib/client.js` 的内联 `const DICT_ZH = {...}` / `const DICT_EN = {...}` 纯字面量，zh / en 键必须完全一致，`t('key')` 用到的键必须存在，`locale/{zh,en}.json` 必须有 `meta.title` / `meta.description`，NS 必须是 `dsh-workbench`；
- `check-privacy.mjs`：扫描工作区文本，禁止本机绝对路径、真实平台 token / PAT、真实飞书 `oc_`/`om_` ID、私有主机名（`*.local` / `*.tailnet` / `*.ts.net`）、私钥；占位符 `<token>` / `~/…` / `oc_xxx` / `example.local` 放行；
- `verify-plugin.mjs`：包名 / version / `type: module` / `exports` 指向的文件存在 / `engines.dsh` / `dsh.manifestVersion === 1` / `dsh.bundle.patch` 文件 / patch 行 `id: workbench` 与 `name: '@ponydev/dsh-workbench'` / `lib/index.js` 存在 / `lib/client.js` 的 ModuleLoader id 带 scope；
- CI 重复执行以上检查；失败不合并。

## 4. 代码规范

- plain ESM、Node `>=22.5`、**无构建**、核心零运行时依赖；只用 Node 内置能力（`fetch` / `crypto` / `fs` / `http`）；
- **凭据**：只在 `lib/credentials.js` 读写；字段固定 `appSecret` / `accessToken` / `refreshToken` / `token`，未知字段直接拒绝；空值 = 删除；
- **token 生命周期**：飞书 access token 提前 5 分钟刷新；refresh token 轮换后必须持久化新值；同一账号刷新用 Promise 单飞；刷新失败 / 401 → `needs_auth`，**不重试**；
- **HTTP**：一律经 `lib/http.js`；错误归类 `auth`（401/403 → needs_auth，不重试）/ `rate-limit`（429、GitHub 403 + `x-ratelimit-remaining: 0`，按 `Retry-After` 退避）/ `network`（有限重试）/ `unknown`；不打印请求头与响应正文；
- **采集失败**：`auth` 不推进游标、不风暴；`rate-limit` 退避且不推进游标；`network` 有限重试；失败只回短文案 + 错误码；
- **账号存储**：`accounts.json` 只存 provider / 身份 / 状态 / scope / 过期时间等非机密字段；写入走 `lib/store.js` 原子写；损坏先备份 `.corrupt-<ts>-<pid>` 再回落；
- **配置**：归一化永不抛异常（非法项丢弃 / 回落默认并回传 `errors` / `warnings`）；v1 配置读入自动升级 `version: 2`、`accountId` 为空；任何入口为空 = 不监听；
- **规则**：`lib/rules.js` 保持纯函数（可离线测试），命中必须带 `reason`，便于 UI 解释「为什么命中」；
- **i18n**：文案全走稳定 key，zh / en 键**完全一致**（`check-i18n.mjs` 强制）；UI 不硬编码中英文；
- **日志**：只用 `lib/log.js` 脱敏后落盘；不打印消息正文、diff 全文、token、appSecret、Authorization / cookie 头；
- **错误**：统一 `{ ok: false, error: { code, message } }`；`account/*` 错误码见 `docs/accounts-auth.md` §7。

## 5. 安全不变量（不可破坏）

1. **凭据只进凭据层**：token / appSecret / PAT 只写 `ctx.credentials`（或 0600 fallback）；`accounts.json`、日志、API 回包、事件历史、UI 都不得出现明文，API 只回 `configuredKeys`。
2. **accounts.json 不含机密**：账号元数据与凭据分离；账号 id 稳定（`acc_<12hex>`），退出后不复用。
3. **401 不重试**：任何 API 401 或刷新失败 → 账号标 `needs_auth`，停止该账号轮询并等用户重新授权；不循环重试、不刷新风暴、不静默续授。
4. **最小 scope**：飞书默认只申请 `im:message`（读）+ `offline_access`；发送类 scope 属出站能力，v0.3 才允许且必须显式提示。GitHub PAT 提示 `repo`（或 fine-grained 只读 PR 权限）即可。
5. **退出即删凭据**：账号「退出」必须清空该账号全部凭据字段并移除账号记录；不允许只改状态留下 token。
6. **不自动授权**：授权只能由用户在 UI 主动发起；插件不自动弹浏览器、不后台重放 device code、不沿用旧 CLI 登录态。
7. **运行时零 CLI 依赖**：轮询 / 采集 / 授权只用 `fetch`；`lark-cli` / `gh` 仅限一次性导入向导（`accounts.importGh`），且失败不影响运行。
8. **管理面认证**：`/workbench` 下所有请求先过 `ctx.connection.admit(req)`，未认证 401/403；写请求必须校验 `x-dsh-workbench-client: 1`；请求体 ≤1 MiB、只收 JSON。
9. **白名单零监听**：只处理 `channels.lark.watchedChats` / `channels.github.watchedRepos` 中配置的会话与仓库，且必须引用已授权账号（`accountId`）；入口为空或账号缺失 = 不读不写。
10. **v0.2.0 只读**：不发送消息、不评论、不 approve / request changes / 合并、不改代码；`safety.outbound` 默认 `draft`，`safety.allowApprove` 恒 `false`（字段保留）。
11. **无公网面**：Device Flow 不需要回环 / 公网回调；不开 webhook、不做事件订阅、不新增监听端口、不做多租户。
12. **日志与保留**：消息正文只进内存与截断后的事件标题，不落盘、不写日志；历史默认 200 条可配，日志按 1 MiB 轮转到 `workbench.log.1`；`history.clear` 只清事件 / 统计，不动游标与去重集合。
13. **不提交隐私**：禁止真实凭据 / PAT / appSecret / 真实飞书会话 ID / 本机绝对路径 / 私有主机名 / 私钥进入版本库；示例值用 `<token>`、`~/…`、`oc_xxx`、`example.local` 等占位符。

## 6. UI 规范（DSH 原生）

- 只用 `--dsw-*` token 与 DSH primitives，禁止硬编码色值 / 字号（fallback 除外）；无构建、零依赖，手写 ModuleLoader bundle；
- 位置（已核对 DSH `0.2.1-rc.2`）：
  - 左栏「工作台」：`sidebar.panellist`，id `workbench`，order `5`，点击 `ctx.layout.selectPanel('workbench')`；
  - 右侧主面板：`main`，key `workbench`（**非全屏**，替换主内容区）；
  - 设置 → 工作台：`settings.section`，id `workbench`；内含 **账号 / 监听 / 默认 / 存储**；
- **账号区**（v0.2.0）：
  - 列表显示 provider / 身份（name / login / open_id）/ 状态 / scope / 过期时间 / 最近错误；`needs_auth` 必须给出「重新授权」入口；
  - 飞书添加流程：`appId` / `appSecret`（`type=password`）/ `brand` / `scope` → `accounts.feishu.start` → 展示 `user_code` + `verification_uri`（本地生成二维码可点）与倒计时 → 每 2s `accounts.feishu.poll`；页面关闭后 Host 继续轮询，重新打开用 `accounts.list` / `poll` 续看；
  - GitHub 添加：PAT 输入框（password）→ `accounts.github.add`；可选「从 gh 导入」（`accounts.importGh`）；
  - 操作：测试 / 重新授权 / 退出（退出需二次确认）；「使用账号」下拉只列同 provider 的已授权账号；
- **凭据永不回显**：前端只拿 `configuredKeys` / 掩码 / 状态；提交后清空本地输入；不在 i18n 文案、URL、日志里放 token；
- 文案全走 i18n；诊断只显示「通过 / 失败 / 未验证 + 静态原因码」，不显示上游原始响应；
- 设置页只放短标签 + 控件，不写大段说明文（说明放 README / `docs/`）；
- `lib/client.js` 只允许 `require('react')` / `require('react-dom')` 与宿主注入的 client-ui 包；禁止 `console.*`；
- 面板轮询 `state`：挂载后一次，随后每 8s；页面隐藏时暂停；写操作串行，成功后立即刷新一次；
- 离线自测用 `test-render.html` 的假数据（浅 / 深色 × 中 / 英，含账号与 needs_auth 场景），**不要重启 dsh 做 UI 自测**；禁止真机 / 真实账户截图进仓库。

## 7. 版本与发布

- 版本号语义化；`0.x` 阶段 minor 提升可含行为变化，但必须在 CHANGELOG 写清楚；
- 当前 `0.2.0`：账号与独立授权（账号模型 + 凭据桥 + 飞书 Device Flow + GitHub PAT + 原生 HTTP 客户端 + 设置页账号区 + config v1→v2 迁移）；仍无出站动作；
- 每个版本必须更新 `CHANGELOG.md`，标题格式 `## <semver> — <YYYY-MM-DD>`（也接受 `-` 分隔与 `(unreleased)`）；GitHub Release 正文由 `scripts/release-notes.mjs` 从当前版本条目抽取，缺失 / 为空时非 0 退出，发布失败；
- 只声明 `engines.dsh`（`>=0.2.1-rc.2 <0.3.0`），不撒 `@deepseek-ai/dsh-*` peerDependencies；宿主大版本升级前先核对 `docs/DESIGN.md` §2 的槽位与协议；
- 发布内容以 `package.json` 的 `files` 为准（`lib` / `locale` / patch / `docs/*.md` / README / CHANGELOG / LICENSE / AGENTS）；`docs/accounts-auth.md` 会随 `docs/*.md` 发布，改它的同时同步 README 口径。

## 8. 提交规范

- 提交信息用 Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:` / `test:` / `refactor:`）；
- 作者使用全局 git config（`Pony <205503242+jmaubay7@users.noreply.github.com>`），不写 AI 名称、不加 `Co-authored-by`；
- 只提交本次任务相关改动；不提交 `node_modules/`、`*.tgz`、`secrets.json`、真实凭据、真实会话截图、本机绝对路径；
- 提交前必须跑第 3 节的全部检查；改 UI 额外用 `test-render.html` 离线自查。
