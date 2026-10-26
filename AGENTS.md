# AGENTS.md — dsh-workbench 项目规范（AI / 自动化代理）

本文件是**在这个仓库里工作时必须遵守的项目级规范**。全局规范见 `~/.dsh/AGENTS.md`；本文件只写项目特有约束。架构、槽位、Feature 契约与 config / state schema 见 [`docs/DESIGN.md`](docs/DESIGN.md)，Host ⇄ Client 协议见 [`docs/api-contract.md`](docs/api-contract.md)。

## 0. 一句话与关键标识

DSH Web 插件：个人工作台——以 **Pony 本人身份**接入 Lark / 飞书与 GitHub，按白名单规则采集增量消息与 PR 动态，只做「采集 / 规则 / 历史」；**不发消息、不执行 review、不写 PR 评论**。

**能力边界**：v0.1 只读采集 + 规则匹配 + 运行记录 + 设置页。没有 bot 身份、没有公网 webhook、没有事件订阅、没有独立服务 / 新端口；凭据复用本机 `lark-cli`（`--as user`）与 `gh`，插件不落盘 token。

关键标识（改动前先确认一致，`scripts/verify-plugin.mjs` 会校验）：

- 包名 `@ponydev/dsh-workbench`；插件 `name` `dsh-workbench`
- profile patch insert id `workbench`
- 路由前缀 `/workbench`（写操作要求 `x-dsh-workbench-client: 1`）
- 状态目录 `$DSH_HOME/workbench`（`config.json` / `state.json` / `workbench.log`）
- i18n NS `dsh-workbench`
- `engines.dsh` `>=0.2.1-rc.2 <0.3.0`；`node >=22.5`

## 1. 目录与职责

```
lib/index.js       Host 入口：/workbench 路由、connection.admit 认证围栏、轮询器装配、状态目录
lib/config.js      默认配置 / 归一化 / 保存（永不抛异常）
lib/lark.js        Lark / 飞书渠道（lark-cli user 身份轮询，只读）
lib/github.js      GitHub 渠道（gh api 只读 open PR）
lib/rules.js       规则匹配（纯函数，可离线测试）
lib/state.js       运行时状态：游标 / 去重 / 事件历史 / 统计
lib/store.js       私有目录 + 原子 JSON 存储
lib/shell.js       子进程封装（execFile，不拼 shell 字符串）
lib/log.js         脱敏日志
lib/client.js      手写 ModuleLoader bundle：工作台主面板 + 设置页 + i18n
cordis.patch.yml   bundle patch（插入 id: workbench + 默认配置）
locale/            zh / en 元数据（title / description）
test-render.html   离线 UI 渲染页（假数据，浏览器直接打开，0 控制台错误）
scripts/           门禁与离线测试（check-syntax / check-i18n / check-privacy / verify-plugin / release-notes / smoke）
docs/              DESIGN.md、api-contract.md、config.example.json
```

**硬约束**：

- **Host 与 Client 不互相 import**；Client 不读文件 / 环境变量，跨端数据**只走 `/workbench` 的 JSON 协议**（见 `docs/api-contract.md`）。
- **v0.1 不做出站动作**：不发送 / 回复 Lark、不评论 / approve / 合并 PR、不改工作区。`features['pr-review']` 与 `router.classifier` 仅是配置位，v0.1 不消费。
- 核心零运行时依赖、无构建：不引入 TypeScript 编译链 / 打包器 / 框架依赖；子进程只用 `lib/shell.js` 的 `execFile`。
- 新增渠道 / Feature 时只加 adapter / feature 文件，不在内核写平台分支；配置 schema 先加到 `lib/config.js` 的归一化与 `docs/DESIGN.md` §8。

## 2. 修改前必须做

1. `git status`、`git log --oneline -3` 确认工作区状态与当前分支；
2. 改协议字段先改 [`docs/api-contract.md`](docs/api-contract.md)，再同时改 Host 与 Client；
3. 改 config / state schema 先改 [`docs/DESIGN.md`](docs/DESIGN.md) §8 / §9 与 `lib/config.js` 的默认值 / 归一化，再改设置页与 `docs/config.example.json`；
4. 涉及安全不变量（身份、认证、白名单、只读、凭据、日志、保留）的改动，先在本文件第 5 节核对，改动必须能说明为什么不破坏它；
5. 不修改 `package.json` / `cordis.patch.yml` 中的标识字段而不跑 `node scripts/verify-plugin.mjs`。

## 3. 提交前必须通过

```bash
npm run check                   # 语法 + i18n + 隐私 + 插件标识一致性（四道门禁）
npm run smoke                   # Host 侧离线冒烟（不触网）
node scripts/check-syntax.mjs   # lib/**/*.js 逐个 node --check
node scripts/check-i18n.mjs     # DICT_ZH/DICT_EN 键一致 + t('key') + locale 元数据 + NS
node scripts/check-privacy.mjs  # 本机路径 / 真实 token / 真实 Lark ID / 私有主机名
node scripts/verify-plugin.mjs  # package.json exports / engines / manifestVersion / patch / client id
node scripts/release-notes.mjs  # 从 CHANGELOG 抽取当前版本（发布前）
for f in scripts/*.mjs; do node --check "$f"; done   # 门禁脚本自身语法
```

其中门禁语义：

- `check-syntax.mjs`：`lib/**/*.js` 全部 `node --check`，任何文件失败即非 0；
- `check-i18n.mjs`：解析 `lib/client.js` 的内联 `const DICT_ZH = {...}` / `const DICT_EN = {...}` 纯字面量，zh / en 键必须完全一致，`t('key')` 用到的键必须存在，`locale/{zh,en}.json` 必须有 `meta.title` / `meta.description`，NS 必须是 `dsh-workbench`；
- `check-privacy.mjs`：扫描工作区文本，禁止本机绝对路径、真实平台 token、真实 Lark `oc_`/`om_` ID、私有主机名（`*.local` / `*.tailnet` / `*.ts.net`）、私钥；占位符 `<token>` / `~/…` / `oc_xxx` / `example.local` 放行；
- `verify-plugin.mjs`：包名 / version / `type: module` / `exports` 指向的文件存在 / `engines.dsh` / `dsh.manifestVersion === 1` / `dsh.bundle.patch` 文件 / patch 行 `id: workbench` 与 `name: '@ponydev/dsh-workbench'` / `lib/index.js` 存在 / `lib/client.js` 的 ModuleLoader id 带 scope；
- CI 重复执行以上检查；失败不合并。

## 4. 代码规范

- plain ESM、Node `>=22.5`、**无构建**、核心零运行时依赖；不引入 TypeScript / 打包器 / 运行时框架；
- 状态文件只用 `lib/store.js` 的原子写：目录 `0700`、文件 `0600`、`tmp + fsync + rename`；解析失败先备份 `.corrupt-<ts>-<pid>` 再回落，绝不覆盖唯一副本；
- 配置归一化（`lib/config.js`）**永不抛异常**：非法项丢弃 / 回落默认并回传 `errors` / `warnings`；任何入口为空 = 不监听；
- 子进程只用 `lib/shell.js` 的 `execFile`（不经 shell、不拼字符串命令），带超时与输出上限；非 0 退出返回 `{ code, stdout, stderr }` 由调用方归类；
- 规则匹配 `lib/rules.js` 保持纯函数（可离线测试），命中必须带 `reason`，便于 UI 解释「为什么命中」；
- 文案全走 i18n 稳定 key（如 `workbench.panel.title`），zh / en 键**完全一致**，由 `scripts/check-i18n.mjs` 强制；不要在 UI 里硬编码中文；
- 日志只用 `lib/log.js` 脱敏后落盘：不打印消息正文、diff 全文、token、完整请求头；
- 错误统一 `{ ok: false, error: { code, message } }`；内部异常只记日志，只回短文案与错误码（见 `docs/api-contract.md`）。

## 5. 安全不变量（不可破坏）

1. **本人身份**：Lark / 飞书固定 `lark-cli --as user`，GitHub 用 `gh` 的 PonyDevAI 身份；不切 bot、不伪装机器人、不引入 bot 分支。
2. **管理面认证**：`/workbench` 下所有请求先过 `ctx.connection.admit(req)`，未认证 401/403；写请求必须校验 `x-dsh-workbench-client: 1`；请求体 ≤1 MiB、只收 JSON。
3. **白名单零监听**：只处理 `channels.lark.watchedChats` / `channels.github.watchedRepos` 中配置的会话与仓库；入口为空 = 不读不写；私聊会话同样必须显式加入 `watchedChats`，`p2pWhitelist` 为 schema 预留（v0.1 不参与过滤）。
4. **v0.1 只读**：不发送消息、不评论、不 approve / request changes / 合并、不改代码；`safety.outbound` 默认 `draft`，`safety.allowApprove` 恒 `false`（字段保留）。
5. **凭据**：不新增 token、不落盘凭据、不回显凭据；复用 `lark-cli` / `gh` 登录态；token 失效只在状态卡提示重新登录，不自动重试、不反复刷接口。
6. **日志与保留**：消息正文只进内存与截断后的事件标题，不落盘、不写日志；历史默认 200 条可配，日志按 1 MiB 轮转到 `workbench.log.1`；`storage` 里的正文保留 / 日志天数为 v0.1 配置位；`history.clear` 只清事件 / 统计，不动游标与去重集合。
7. **频控**：轮询按游标增量 + `message_id` 去重；出站（未来版本）受 `rateLimitPerHour` 限制，失败退避不风暴。
8. **无公网面**：不开公网 webhook、不做事件订阅、不新增监听端口、不做多租户；远程访问依赖宿主既有能力。
9. **不提交隐私**：禁止真实凭据 / 真实 Lark 会话 ID / 本机绝对路径 / 私有主机名 / 私钥进入版本库；示例值用 `<token>`、`~/…`、`oc_xxx`、`example.local` 等占位符。

## 6. UI 规范（DSH 原生）

- 只用 `--dsw-*` token 与 DSH primitives，禁止硬编码色值 / 字号（fallback 除外）；无构建、零依赖，手写 ModuleLoader bundle；
- 位置（已核对 DSH `0.2.1-rc.2`）：
  - 左栏「工作台」：`sidebar.panellist`，id `workbench`，order `5`，点击 `ctx.layout.selectPanel('workbench')`；
  - 右侧主面板：`main`，key `workbench`（**非全屏**，替换主内容区）；
  - 设置 → 工作台：`settings.section`，id `workbench`；
  - 可选增强槽位（review 徽标 / 轻提示 / 会话头部按钮）留到后续版本，v0.1 不注册；
- 文案全走 i18n；凭据 / token 永不回显；诊断只显示「通过 / 失败 / 未验证 + 静态原因码」，不显示 CLI 原始输出；
- 设置页只放短标签 + 控件，不写大段说明文（说明放 README / `docs/DESIGN.md`）；
- `lib/client.js` 只允许 `require('react')` / `require('react-dom')` 与宿主注入的 client-ui 包；禁止 `console.*`；
- 面板轮询 `state`：挂载后一次，随后每 8s；页面隐藏时暂停；写操作串行，成功后立即刷新一次；
- 离线自测用 `test-render.html` 的假数据（浅 / 深色 × 中 / 英），**不要重启 dsh 做 UI 自测**；禁止真机 / 真实账户截图进仓库。

## 7. 版本与发布

- 版本号语义化；`0.x` 阶段 minor 提升可含行为变化，但必须在 CHANGELOG 写清楚；
- 每个版本必须更新 `CHANGELOG.md`，标题格式 `## <semver> — <YYYY-MM-DD>`（也接受 `-` 分隔与 `(unreleased)`）；GitHub Release 正文由 `scripts/release-notes.mjs` 从当前版本条目抽取，缺失 / 为空时非 0 退出，发布失败；
- 只声明 `engines.dsh`（`>=0.2.1-rc.2 <0.3.0`），不撒 `@deepseek-ai/dsh-*` peerDependencies；宿主大版本升级前先核对 `docs/DESIGN.md` §2 的槽位与协议；
- 发布内容以 `package.json` 的 `files` 为准（`lib` / `locale` / patch / docs / README / CHANGELOG / LICENSE / AGENTS）；不把 `test-render.html` 之外的本地调试产物打进包。

## 8. 提交规范

- 提交信息用 Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:` / `test:` / `refactor:`）；
- 作者使用全局 git config（`Pony <205503242+jmaubay7@users.noreply.github.com>`），不写 AI 名称、不加 `Co-authored-by`；
- 只提交本次任务相关改动；不提交 `node_modules/`、`*.tgz`、`secrets.json`、真实凭据、真实会话截图、本机绝对路径；
- 提交前必须跑第 3 节的全部检查；改 UI 额外用 `test-render.html` 离线自查。
