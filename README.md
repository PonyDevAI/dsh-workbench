# dsh-workbench

[![npm](https://img.shields.io/npm/v/@ponydev/dsh-workbench)](https://www.npmjs.com/package/@ponydev/dsh-workbench)
[![license](https://img.shields.io/npm/l/@ponydev/dsh-workbench)](LICENSE)

**DeepSeek Harness（DSH）Web 插件：个人工作台——以 Pony 本人身份接入 Lark / 飞书与 GitHub，按白名单规则采集增量消息与 PR 动态，只做「采集 / 规则 / 历史」。**

不是 bot、不是团队 SaaS、不是 IM 客户端：没有机器人身份、没有公网入口、没有事件订阅。

**v0.2.0 起插件自己管理账号与凭据**：飞书走 user OAuth **Device Flow**（粘贴 appId / appSecret → 链接 / 二维码 + `user_code` 确认 → token 由插件刷新），GitHub 粘贴 **PAT**；运行时**不再依赖 `lark-cli` / `gh`**，只保留一次性导入向导（可选）。采集仍是**只读**：v0.2.0 不发送消息、不评论、不执行 review（出站能力留给 v0.3）。

## 安装

要求：

- DSH `>=0.2.1-rc.2 <0.3.0`
- Node.js `>=22.5`（宿主自带，一般无需单独安装）

不需要预装或登录 `lark-cli` / `gh`；已有 `gh` 登录态的用户可以用「从 gh 导入」一次性取 PAT（可选）。

```bash
# 本机开发：link 安装（<repo> 换成本仓库路径）
dsh plugin --profile web add link:<repo>

# 或从 npm 安装
dsh plugin --profile web add @ponydev/dsh-workbench
```

装完重启 DSH Web 宿主并刷新页面（macOS 示例：`launchctl kickstart -k gui/$(id -u)/local.deepseek-harness.web`），然后打开 **设置 → 工作台 → 账号**。

## 快速开始

1. **添加飞书账号**：设置 → 工作台 → 账号 → 「添加飞书账号」，填 `appId` / `appSecret`、选 `brand`（飞书 / Lark）与 scope（默认 `im:message offline_access`）→ 点「授权」。
2. **完成 Device Flow**：面板显示授权链接（本地二维码）与 `user_code`，在飞书里打开链接、确认授权并输入 `user_code`。Host 会在后台按返回的 `interval` 轮询，页面可以关掉；授权成功后账号卡显示身份（name / open_id）。
3. **添加 GitHub 账号**：粘贴 PAT（classic `repo`；或 fine-grained 的 `Pull requests: read`）→ 「连接」，成功后显示 `login`（如 `PonyDevAI`）。可选「从 gh 导入」。
4. **配置监听**：Lark 群 / 私聊与 GitHub 仓库分别选择「使用账号」（写入 `channels.lark.accountId` / `channels.github.accountId`），设置匹配模式与关键词。
5. **保存后看历史**：Host 按配置轮询；首次监听只建基线，下一次轮询起只处理增量，命中项进「最近事件」。

没有配置账号的渠道不轮询，状态卡提示「未连接账号」；`watchedChats` / `watchedRepos` 为空时同样**不读不写**。

## 账号与授权（v0.2.0）

账号独立于监听配置，存在 `$DSH_HOME/workbench/accounts.json`；**只存非机密元数据**（provider / 身份 / 状态 / scope / 过期时间），token 与 appSecret 全在凭据层。

| 平台 | 授权方式 | 说明 |
|---|---|---|
| 飞书 / Lark | user OAuth **Device Flow** | `appId` / `appSecret` 在账号表单填写；Device Flow 无回调地址，不新增公网入口 |
| GitHub | **PAT**（v0.2.0） | 校验 `GET /user`；GitHub Device Flow 留 v0.3+ |

- **凭据层**：优先宿主 `ctx.credentials`（key `dsh-workbench/<accountId>/<field>`）；宿主没有该服务时回落 `$DSH_HOME/workbench/secrets.json`（目录 0700、文件 0600、原子写）。API 只回 `configuredKeys`（字段名），**永不回明文**。
- **token 生命周期**：飞书 access token 提前 5 分钟刷新，refresh token 轮换并持久化；同一账号同一时刻只有一个刷新请求（单飞）。
- **401 / 刷新失败**：账号标 `needs_auth`，**不重试、不风暴**，等你在账号页点「重新授权」；不会静默续授、不会自动弹浏览器。
- **状态**：`ok` / `pending_auth`（授权中）/ `needs_auth`（需重新授权）/ `error`；退出会删除账号与凭据。
- **退出**：清空该账号的全部凭据并移除账号记录；重新使用需要重新授权。

## v0.2.0 能力边界

| 做 | 不做 |
|---|---|
| 插件自己的账号体系（`accounts[]`，`acc_<12hex>`）与凭据桥 | bot 身份、公网 webhook、事件订阅、新端口 |
| 飞书 user OAuth Device Flow + token 自动刷新；GitHub PAT | GitHub Device Flow（v0.3+）、组织级 App 安装 |
| 以账号身份只读轮询飞书消息与 GitHub open PR（原生 HTTP，`fetch`） | 发送 / 回复飞书消息、评论 PR、approve / request changes / 合并 |
| 白名单 + 规则匹配（@我 / 关键词 / 全部 / `/review`；draft / labels / opened / new-commits） | 执行 review、修改代码、写工作区（review 留 v0.3） |
| 运行记录与当天统计，可在主面板回看 | 模型分类器（配置位保留）、自动回复、日报 |
| 设置页：账号 / 监听 / 默认 / 存储 | 每功能独立设置页 |

> `features['pr-review']` 与 `router.classifier` 的配置从第一天就存在，但 v0.2.0 **只读写配置、不消费**；PR Review 在 v0.3 落地。

## 配置（config v2）

`cordis.patch.yml` 插入插件行（插件 insert id `workbench`）：

```yaml
- insert:
    - id: workbench
      name: '@ponydev/dsh-workbench'
      config:
        stateDir: ''            # 空 = $DSH_HOME/workbench
        larkPollSeconds: 60     # 频道默认轮询秒数（设置页可覆盖，30–300）
        githubPollSeconds: 180  # 60–3600
```

日常配置在 **设置 → 工作台** 编辑（安全边界只做只读展示）；`config.json` 为 **v2**，在 v0.1 结构上新增账号引用：

- `channels.lark`：`enabled`、`accountId`、`pollSeconds`、`watchedChats[]`（`chatId` / `name` / `type` / `mode` / `keywords` / `allowReviewCommand`）、`p2pWhitelist`（schema 预留；v0.2.0 只处理显式加入 `watchedChats` 的会话）。
- `channels.github`：`enabled`、`accountId`、`pollSeconds`、`watchedRepos[]`（`repo` / `path` / `onOpened` / `onNewCommits` / `skipDraft` / `labels`）。
- `features['pr-review']`、`router.classifier`：v0.3+ 预留。
- `defaults` / `safety` / `storage`：默认模型与工作区、出站策略（`draft`，`allowApprove` 恒 `false`）、保留策略。

**迁移**：v0.1 的 `config.json` 读入后自动升级为 `version: 2`，`accountId` 为空；账号需要用户在 UI 里授权（不会自动创建、不会静默沿用旧 CLI 登录态）。未配置 `accountId` = 该渠道不轮询。

完整 schema 见 [`docs/DESIGN.md`](docs/DESIGN.md) §8 与 [`docs/accounts-auth.md`](docs/accounts-auth.md) §5，结构示例见 [`docs/config.example.json`](docs/config.example.json)（v2）；Host ⇄ Client 协议见 [`docs/api-contract.md`](docs/api-contract.md)。

## 数据目录

默认 `$DSH_HOME/workbench`（即 `~/.dsh/workbench`，可用 `stateDir` 覆盖），目录 `0700`、文件 `0600`、原子写：

```
$DSH_HOME/workbench/
├── config.json     # 归一化后的全局配置（v2；设置页保存写入）
├── accounts.json   # 账号元数据：provider / 身份 / 状态 / scope / 过期时间（无明文凭据）
├── secrets.json    # 仅当宿主没有 ctx.credentials 时存在的凭据兜底（0600）
├── state.json      # 游标 / 去重集合 / GitHub 已见 sha / 事件历史 / 当天统计
└── workbench.log   # 运行日志（脱敏；超过 1 MiB 轮转到 workbench.log.1）
```

`state.json` / `accounts.json` 损坏时先备份 `.corrupt-<ts>-<pid>` 再回落，不覆盖唯一副本。

## 安全

- **管理面**：`POST /workbench` 全部经宿主 `ctx.connection.admit` 认证；写操作要求 `x-dsh-workbench-client: 1`；请求体 ≤1 MiB、只收 JSON。
- **凭据只进凭据层**：token / appSecret / PAT 只在 `ctx.credentials`（或 0600 fallback），`accounts.json`、日志、API 回包、事件历史都不含明文；API 只回 `configuredKeys`。
- **最小 scope**：飞书默认只申请 `im:message`（读）+ `offline_access`；发送类 scope 留到 v0.3 且显式提示。GitHub PAT 提示 `repo` 即可。
- **401 不重试**：标 `needs_auth` 等用户重新授权；刷新失败不风暴，不静默续授。
- **退出即删凭据**：账号退出会清空凭据层字段并移除账号记录。
- **运行时零 CLI 依赖**：轮询与采集只用 `fetch` 直连飞书 OpenAPI / GitHub REST；`lark-cli` / `gh` 只在一次性导入向导里可选调用。
- **白名单零监听**：只处理 `watchedChats` / `watchedRepos` 里配置的会话与仓库；入口为空 = 不读不写。
- **只读**：v0.2.0 不产生任何出站动作；`safety.outbound` 默认 `draft`，`safety.allowApprove` 设计上恒为 `false`。
- **日志与保留**：不打印消息正文 / diff 全文 / token / Authorization 头；消息正文不落盘（只进内存与截断后的事件标题），历史默认 200 条可配，日志按 1 MiB 轮转；「清空历史」只清事件 / 统计，不动游标与去重集合。
- **仓库门禁**：禁止真实凭据、真实飞书会话 ID、本机绝对路径、私有主机名、私钥进入版本库（`scripts/check-privacy.mjs`）。

## 开发与门禁

```bash
npm run check        # 语法 + i18n + 隐私 + 插件标识一致性（四道门禁）
npm run smoke        # Host 侧离线冒烟（mock fetch，不触网）
npm run test-ui      # 离线渲染 test-render.html（假数据，含账号区状态）
node scripts/check-syntax.mjs    # lib/**/*.js 逐个 node --check
node scripts/check-i18n.mjs      # DICT_ZH/DICT_EN 键一致 + t('key') + locale 元数据 + NS
node scripts/check-privacy.mjs   # 本机路径 / 真实 token / 真实会话 ID / 私有主机名
node scripts/verify-plugin.mjs   # package.json exports / engines / manifestVersion / patch / client id
node scripts/release-notes.mjs   # 从 CHANGELOG 抽取当前版本（可带输出路径参数）
for f in scripts/*.mjs; do node --check "$f"; done   # 门禁脚本自身语法
```

`lib/client.js` 由 Client 半区手写（无构建、零运行时依赖），用 `test-render.html` 的假数据离线自测 UI，不需要重启宿主。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | 定位、入口槽位、数据流、Feature 契约、config / state schema、安全不变量、里程碑 |
| [docs/accounts-auth.md](docs/accounts-auth.md) | v0.2.0 账号模型、凭据键、飞书 Device Flow、GitHub PAT、配置迁移、API 契约 |
| [docs/api-contract.md](docs/api-contract.md) | Host ⇄ Client `POST /workbench` 契约与错误码 |
| [docs/config.example.json](docs/config.example.json) | `config.json` v2 结构示例（账号引用 + 监听规则） |
| [AGENTS.md](AGENTS.md) | 项目规范（目录职责、门禁、代码 / 安全 / UI / 发布 / 提交规范） |
| [CHANGELOG.md](CHANGELOG.md) | 版本说明（GitHub Release 正文来源） |

## 结构

```
lib/index.js          Host 入口：/workbench 路由、认证围栏、轮询器装配、状态目录
lib/config.js         配置默认值 / 归一化 / 保存（v1 → v2 迁移）
lib/accounts.js       账号存储与视图（accounts.json，只存非机密元数据）
lib/account-auth.js   账号授权与 token 生命周期（飞书 Device Flow / 刷新 / PAT）
lib/credentials.js    凭据桥（ctx.credentials 优先，0600 secrets.json 兜底）
lib/http.js           轻量 HTTP 客户端（fetch + 超时 + 错误分类 + 退避）
lib/clients/feishu.js 飞书 OpenAPI 客户端（device / token / user / chats / messages）
lib/clients/github.js GitHub REST 客户端（/user、pulls，只读）
lib/channels/lark.js  飞书渠道适配器（账号 user token + 原生 API 轮询，只读）
lib/channels/github.js GitHub 渠道适配器（账号 PAT + REST 轮询，只读）
lib/api.js            管理面端点（state / accounts.* / config.save / 轮询 / 历史）
lib/poller.js         采集引擎（轮询 + 规则 + 事件历史）
lib/rules.js          规则匹配（纯函数，可离线测试）
lib/state.js          运行时状态（游标 / 去重 / 事件历史 / 统计）
lib/store.js          私有目录 + 原子 JSON 存储
lib/shell.js          子进程封装（execFile；仅一次性导入 gh token 时使用）
lib/log.js            脱敏日志
lib/client.js         手写 ModuleLoader bundle：工作台面板 + 设置页（账号 / 监听 / 默认 / 存储）+ i18n
cordis.patch.yml      bundle patch（插入 id: workbench + 默认配置）
locale/               zh / en 元数据（title / description）
scripts/              门禁与离线测试（check-syntax / check-i18n / check-privacy / verify-plugin / release-notes / smoke / render-test）
docs/                 DESIGN、accounts-auth、api-contract
test-render.html      离线 UI 渲染页（假数据；含账号状态）
```

## License

MIT
