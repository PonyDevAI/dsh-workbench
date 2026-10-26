# dsh-workbench · 设计 v1

> 个人工作台：以 **Pony 本人身份**接入 Lark / 飞书 与 GitHub，按配置的规则接收**增量消息/事件**，分流给各功能模块（v1 只有 PR Review），结果以本人身份回写。
>
> 本文只写设计与契约，**不含实现**。账号与独立授权（v0.2.0）见 [accounts-auth.md](accounts-auth.md)。图见 [architecture.png](architecture.png)、[flow.png](flow.png)、[layout-v2.png](layout-v2.png)、[feature-config.png](feature-config.png)。

---

## 0. 结论

| 项 | 决定 |
|---|---|
| npm 包名 | `@ponydev/dsh-workbench` |
| 插件 `name` | `dsh-workbench`（对齐 dsh-im / dsh-phone / dsh-system-hud / dsh-model-usage） |
| profile patch insert id | `workbench` |
| 路由前缀 | `/workbench`（写操作要求 `x-dsh-workbench-client: 1`） |
| 状态目录 | `$DSH_HOME/workbench`（`config.json` / `state.json` / `workbench.log`） |
| i18n NS | `dsh-workbench` |
| engines | `dsh >=0.2.1-rc.2 <0.3.0`，`node >=22.5` |
| 身份 | **全域 Pony 本人**：插件独立账号（飞书 user OAuth Device Flow / GitHub PAT），运行时直连 OpenAPI/REST，不依赖 lark-cli/gh |
| 不启用 | bot（ClawX）、`lark-mcp`、事件订阅、公网 webhook、新端口、独立服务；v0.2.0 起也不在运行时调用 lark-cli/gh |
| 入口 | 左栏「工作台」= `sidebar.panellist` id `workbench` order `5`（插件 0 → 工作台 5 → 自动化任务 10） |
| 主界面 | `main` key `workbench`（右侧主面板，**非全屏**） |
| 设置页 | `settings.section` id `workbench`（仅全局配置） |
| v1 功能 | PR Review（唯一内置 Feature；配置 schema 从第一天按多功能设计） |

---

## 1. 定位与边界

**是**：单人、本机、以本人身份运行的「渠道 → 规则 → 功能 → 回写」控制台。
**不是**：机器人平台、团队 SaaS、IM 客户端、公网服务、独立全屏应用。

### 1.1 典型场景

1. 群里有人贴 PR 链接 → 工作台在下一次轮询命中 → review → 先草稿、确认后以你身份发 GitHub 评论 + Lark 回复。
2. 自己 repo 有新 PR / 新 commit → 自动 review → 结果进工作台历史。
3. 以后：自动回复（草稿确认）、日报、任务提取——都作为新 Feature 挂进来，内核不变。

### 1.2 非目标

- 不做 bot / 事件推送（用户态没有消息推送事件）；
- 不做公网 webhook、不做多租户；
- 不做自动 approve / 自动合并 / 自动改代码；
- 不做每个功能独立设置页（设置树会膨胀）；
- 不把 Lark 消息流搬进 DSH Web 阅读（那是 dsh-im 的领域）。

---

## 2. 入口与槽位（已核对 DSH 0.2.1-rc.2）

| 入口 | 槽位 | id / key | order | 行为 |
|---|---|---|---|---|
| 左栏「工作台」 | `sidebar.panellist` | `workbench` | **5** | 点击 `ctx.layout.selectPanel('workbench')` |
| 右侧主面板 | `main` | `workbench` | — | 概览 / 渠道 / 监听规则 / 功能 / 运行记录 / 待确认 |
| 设置 → 工作台 | `settings.section` | `workbench` | 44 | 全局配置：渠道、默认模型、默认工作区、安全、存储 |
| review 会话徽标（可选） | `sidebar.session.row.leading` | `wb-review` | 10 | 只给 `workbench:review:*` 会话打标 |
| 完成/失败轻提示（可选） | `shell.overlay` | `wb-toast` | 10 | review 完成 / 失败 |
| 会话头部（可选） | `conversation.session.header.utilities` | `wb-actions` | 100 | 「回工作台 / 重跑」 |

排序依据：`sidebar.panellist` 按 `order` 升序；宿主自带「插件」`order: 0`、「自动化任务」`order: 10`（id `schedules`），所以 **5 正好在二者之间**。

```js
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
  name: 'sidebar.panellist', id: 'workbench', order: 5,
  label: () => t('panel.label'), locale: 'dsh-workbench',
}, WorkbenchIcon))

ctx.slots.inject('main', () => ctx.slots.register({
  name: 'main', key: 'workbench', locale: 'dsh-workbench',
}, WorkbenchPanel))
```

> 非全屏：工作台替换的是 DSH 的主内容区；左栏与会话切换保持原样。刷新后由宿主记忆当前 panel。

---

## 3. 进程与执行边界

```
DSH Web（浏览器）
  └─ Client bundle：只渲染 UI、发 /workbench 请求、8s 轮询 state
DSH Host 进程（与 dsh web 同进程）
  ├─ workbench Host 插件
  │   ├─ 账号/凭据层（accounts.json + ctx.credentials）
  │   ├─ Lark 轮询器（setInterval，60s）→ 飞书 OpenAPI（user token）
  │   ├─ GitHub 轮询器（setInterval，180s）→ GitHub REST（PAT）
  │   ├─ 规则匹配 + 串行队列（纯 JS，不占模型）
  │   └─ v0.2.0 无 Sinks（只读），状态写 $DSH_HOME/workbench
  └─ DSH Agent 运行时
      └─ review 会话：workbench:review:<owner>-<repo>:pr-<n>（只读沙箱）
```

- **执行不在浏览器、不在独立服务、不在 Lark**。
- review 是普通 DSH 会话：可在会话列表回看、可继续追问；工作台历史里的每条记录指向它。
- Host 重启：轮询从游标续跑；运行中的 review 标记失败，下一轮按 sha 自然重试。

---

## 4. 数据流

```
ChannelAdapter(lark user / github user)
  → MessageEnvelope（渠道无关）
  → 去重 + 游标（每渠道 × 每会话）
  → 订阅过滤（群白名单 × 模式：@我 / 关键词 / 全部；私聊白名单）
  → 规则路由（群 / 关键词 / 正则 PR 链接 / /review / @我）
  → Feature（pr-review）
  → 模型解析链 → DSH Agent 会话（只读）
  → Result → Sinks（GitHub 评论 / Lark 回复 / 群摘要 / 工作台历史）
  → 审计 + 预算统计
```

规则优先；模型分类（v0.4）只作为“规则未命中但可能相关”的兜底，用便宜模型 + 每日预算。

---

## 5. 渠道适配器契约

每个渠道实现同一份契约，核心只依赖它：

```ts
interface ChannelAdapter {
  id: 'lark' | 'github'          // 可扩展：dingtalk / wecom
  label: string
  identity: 'user' | 'bot'       // v1 全部 user
  transport: 'poll' | 'push'     // v1 全部 poll
  capabilities: {
    chatTypes: ('p2p' | 'group')[]
    threads: boolean
    media: boolean
    sendAs: ('user' | 'bot')[]
  }
  start(ctx), stop()
  status(): { ok, lastError?, lastAt? }
  listChats?(): Promise<Chat[]>
  poll(cursor): Promise<{ messages: MessageEnvelope[], cursor }>
  send(target, content, opts): Promise<{ messageId }>
  reply?(message, content): Promise<{ messageId }>
}
```

- **lark**：插件账号（飞书 user OAuth）→ OpenAPI 轮询消息（时间游标 + 升序 + 分页）；发送留到 v0.3。
- **github**：`gh api` 轮询 open PR；增量 `compare/{lastReviewedSha}...{headSha}`；发送 issue comment。
- 新增渠道 = 一个 adapter 文件 + registry 元数据；不加内核分支。
- 后续：钉钉 Stream（push）、企业微信（callback，需公网，放最后）。

---

## 6. 增量、幂等与保留

| 场景 | 机制 |
|---|---|
| Lark 重复/重投 | `seen` LRU（5000）按 `message_id` 去重，先写后处理 |
| Lark 重启漏消息 | 启动时按 chat 游标 `lastMessageTs` 补拉（`--start` 升序），再进同一管线 |
| GitHub 轮询重复 | 是否 review 只看 `prs[n].lastReviewedSha !== headSha` |
| PR 新 commit | 有旧 sha 时只取增量 diff；无 repo path 时退回 `gh pr diff` 全量 |
| 失败重试 | 失败不推进 `lastReviewedSha`；每 sha 最多 3 次，超过标记 `needs-human` |
| 出站重复 | GitHub 评论带 `<!-- dsh-workbench -->` 标记；同 `(repo, pr, sha, sink)` 只发一次 |
| 内容保留 | 消息正文滚动 **24h**；命中消息的 review 结果进 history（200 条上限）；日志 7 天 |

---

## 7. Feature 契约

```ts
interface Feature {
  id: string                    // 'pr-review'
  name: string
  config: FeatureConfig
  // 可选：在规则路由之后再做功能级过滤
  matches?(env: MessageEnvelope, ctx: FeatureContext): boolean
  run(env: MessageEnvelope, ctx: FeatureContext): Promise<FeatureResult>
  cancel?(runId: string): void
}

interface FeatureConfig {
  enabled: boolean
  model: { provider: string; model: string } | null      // null = 继承
  workspace: {
    mode: 'default' | 'repo' | 'custom'
    cwd?: string                                            // custom 时必填
  }
  sinks: {
    githubComment: boolean
    larkReply: boolean
    summaryChatId?: string
    draftConfirm: boolean                                   // true = 先草稿，人工确认再发
  }
  budget: {
    timeoutSeconds: number                                  // 默认 900
    maxFindings: number                                     // 默认 8
    maxDiffBytes: number                                    // 默认 120000
    dailyRuns: number                                       // 默认 50
  }
  permission: 'read-only' | 'workspace-write'               // review 固定 read-only
}

interface FeatureResult {
  summary: string          // 一句话结论
  markdown: string         // 完整 review 正文
  findings?: { severity: 'blocker'|'major'|'minor'|'nit'; file?: string; line?: number; text: string }[]
  sessionId: string
  actions: OutboundAction[]   // 待发 / 已发
}
```

### 7.1 模型解析链（单一优先级）

```
Feature.config.model  →  features.pr-review.model（功能默认，设置页）  →  defaults.model  →  DSH 默认模型
```

分类器（v0.4）单独：`router.classifier.model` → `defaults.model` → DSH 默认；默认用便宜模型 + `dailyBudget`。

### 7.2 工作区策略

| 模式 | 用于 | 值 |
|---|---|---|
| `default` | 日报 / 提取 / 自动回复 | `defaults.workspace`（默认 `~/deepseek/workbench`） |
| `repo` | PR Review | `channels.github.watchedRepos[].path`（repo 的本地 checkout） |
| `custom` | 特殊功能 | `features[id].workspace.cwd` |

review 会话固定 `sandbox=read-only`、`approval=never`；只有未来明确需要写文件的功能才允许 `workspace-write`。

### 7.3 注册

```js
workbench.registerFeature({
  id: 'pr-review', name: 'PR Review',
  defaultConfig: { ... },
  create: (ctx) => new PrReviewFeature(ctx),
})
```

v1 只注册 `pr-review`；自动回复、日报等后续新增，不改内核。

---

## 8. `config.json`（完整 schema）

```jsonc
{
  "version": 2,

  "channels": {
    "lark": {
      "enabled": true,
      "accountId": "acc_xxx",              // 引用 accounts.json 里的飞书账号
      "pollSeconds": 60,                  // 30–300
      "watchedChats": [
        {
          "chatId": "oc_xxx",
          "name": "研发-前端",
          "type": "group",                // group | p2p
          "mode": "mention",              // mention | keyword | all | off
          "keywords": ["review", "看下这个"],
          "allowReviewCommand": true
        }
      ],
      "p2pWhitelist": []                  // 私聊 open_id 白名单；空 = 不收私聊
    },
    "github": {
      "enabled": true,
      "accountId": "acc_yyy",             // 引用 accounts.json 里的 GitHub 账号
      "pollSeconds": 180,                 // 60–3600
      "watchedRepos": [
        {
          "repo": "PonyDevAI/dsh-workbench",
          "path": "~/deepseek/plugins/dsh-workbench",  // 可选；review 工作区
          "onOpened": true,
          "onNewCommits": true,
          "skipDraft": true,
          "labels": []
        }
      ]
    }
  },

  "features": {
    "pr-review": {
      "enabled": true,
      "model": null,                      // null = 继承 defaults.model
      "workspace": { "mode": "repo" },
      "sinks": {
        "githubComment": true,
        "larkReply": true,
        "summaryChatId": "",
        "draftConfirm": true
      },
      "budget": { "timeoutSeconds": 900, "maxFindings": 8, "maxDiffBytes": 120000, "dailyRuns": 50 },
      "permission": "read-only"
    }
  },

  "router": {
    "classifier": { "enabled": false, "model": null, "dailyBudget": 200 }
  },

  "defaults": {
    "model": null,                        // null = DSH 默认
    "workspace": "~/deepseek/workbench"
  },

  "safety": {
    "outbound": "draft",                  // draft | auto
    "rateLimitPerHour": 10,
    "allowApprove": false                  // 永不 true（保留字段，review 只评论）
  },

  "storage": {
    "contentRetentionHours": 24,
    "historyLimit": 200,
    "logRetentionDays": 7
  }
}
```

校验规则：秒数范围、`workspace.mode=custom` 必须给 `cwd`、`watchRepos[].repo` 必须 `owner/repo`、`summaryChatId` 必须在已监听群里、任何入口为空 = 不监听；v1 配置读入自动升级为 v2（`accountId` 为空）。

---

## 9. `state.json`（运行时状态）

```jsonc
{
  "version": 1,

  "cursors": {
    "lark:oc_xxx": { "lastMessageTs": "1761400000000", "lastMessageId": "om_xxx" },
    "lark:ou_xxx": { "lastMessageTs": "1761400000000", "lastMessageId": "om_yyy" }
  },

  "seen": ["om_a", "om_b"],                     // LRU 5000

  "github": {
    "repos": {
      "PonyDevAI/dsh-workbench": {
        "lastPolledAt": "2026-10-26T12:00:00Z",
        "prs": {
          "128": { "lastReviewedSha": "abc123", "lastReviewedAt": "2026-10-26T11:58:00Z", "attempts": 0 }
        }
      }
    }
  },

  "queue": { "running": null, "pending": ["run_01"] },

  "runs": {
    "run_01": {
      "id": "run_01",
      "featureId": "pr-review",
      "source": "lark",                         // lark | github | manual
      "title": "acme/web-app#128 · 修复登录态丢失",
      "url": "https://github.com/acme/web-app/pull/128",
      "status": "draft",                        // queued | running | draft | sent | skipped | failed | timeout
      "sessionId": "workbench:review:acme-web-app:pr-128",
      "summary": "2 条建议：并发登录态覆盖、错误分支未清理",
      "draft": { "markdown": "...", "sinks": ["github", "lark"] },
      "createdAt": "2026-10-26T12:00:00Z",
      "error": ""
    }
  },

  "history": ["run_01"],                        // 最近 200

  "stats": { "today": { "runs": 6, "failures": 0, "drafts": 1 } }
}
```

持久化：目录 `0700`、文件 `0600`、`tmp + fsync + rename`；解析失败备份 `.corrupt-<ts>-<pid>` 后回落空表；`seen`/`history`/`runs` 定期裁剪。

---

## 10. Host API（Client ⇄ Host）

`POST /workbench`，body `{ endpoint, payload }`；写操作带 `x-dsh-workbench-client: 1`；全部经 `connection.admit`。

| endpoint | 作用 |
|---|---|
| `state` | config + status + runs + 待确认草稿 |
| `config.save` | 整体保存全局配置（热生效） |
| `feature.save` | 保存单个功能配置 |
| `review.run` | 手动触发（repo+pr 或 lark 消息） |
| `review.cancel` | 取消排队/运行 |
| `draft.confirm` / `draft.discard` | 确认发送 / 丢弃草稿 |
| `github.check` / `lark.reconnect` | 立即轮询 / 重连 |
| `history.clear` | 清空历史（不动游标） |

错误码：`auth/denied`、`config/invalid`、`lark/not-configured`、`github/not-configured`、`review/busy`、`internal`。

---

## 11. 安全不变量

1. **身份**：Lark 与 GitHub 全部以 Pony 本人身份操作；不切 bot、不伪装机器人。
2. **默认草稿**：`safety.outbound` 默认 `draft`；确认后才真正发 GitHub 评论 / Lark 消息。
3. **白名单**：只处理配置的会话与仓库；入口为空 = 不读不写。
4. **只读 review**：`sandbox=read-only`、`approval=never`；不 approve / request changes / 合并 / 改代码。
5. **凭据**：token / appSecret / PAT 只进 `ctx.credentials`（0600 fallback）；`accounts.json` 不含明文；API 只回 `configuredKeys`；日志脱敏（不打印正文、token、Authorization）。
6. **频控**：轮询按游标增量 + 出站每小时上限；失败退避，不风暴。
7. **保留**：正文 24h、历史 200 条、日志 7 天；可一键清空。
8. **token 生命周期**：access token 提前 5 分钟刷新、refresh token 轮换落库；401 / 刷新失败 → `needs_auth`，状态卡给「重新授权」，不自动重试、不静默续授。

---

## 12. 里程碑

| 版本 | 内容 | 验收 |
|---|---|---|
| v0.1 | 骨架：Lark/GitHub 轮询、游标、规则配置、消息/运行历史；**不自动动作** | 装进 profile，能看到增量与命中 |
| **v0.2.0（当前）** | 账号与独立授权：账号模型 + 凭据桥 + 飞书 Device Flow + GitHub PAT + 原生 HTTP 客户端；运行时不再依赖 lark-cli/gh | 设置页能添加/授权/退出账号，轮询改用账号直连 |
| v0.3 | PR Review Feature + 只读会话 + 工作台历史 | 手动触发能出 review |
| v0.3 | Sinks + 草稿确认 + 自动触发 | 群里贴链接 → 草稿 → 确认 → GitHub 评论 + Lark 回复 |
| v0.4 | 模型分类器 + 每功能模型/工作区配置 UI + 预算 | 设置页/抽屉可配 |
| v0.5 | 自动回复 Feature（草稿优先） | 命中后可确认发送 |
| 后续 | 钉钉 / 企业微信 adapter、更多 Feature | 按需 |

---

## 13. 附：为什么这样取舍

- **不做全屏**：工作台是控制台，执行现场是普通会话；两套 UI 会分裂。
- **不做 bot**：用户态能看到“你可见的会话”，且发送即本人；bot 视角反而窄，还要拉群、配事件、维护长连接。
- **不做 webhook**：本机无公网入口；轮询 + 游标足够，最坏延迟 = 轮询间隔。
- **规则优先**：每条消息都过模型不可控；规则确定性分流，模型只在 v0.4 做兜底。
- **配置分两面**：全局放设置页（低频），单功能放卡片抽屉（高频、上下文相关），避免设置树膨胀。
