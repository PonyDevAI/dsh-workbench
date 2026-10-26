# dsh-workbench · 账号与独立授权（v0.2.0 设计/契约）

> 目标：把 v0.1「复用 lark-cli / gh 登录态」换成**插件自己的账号体系与独立授权**。
> 位置：所有账号配置都在 **设置 → 工作台 → 账号**；飞书的 `appId / appSecret` 就是该表单的字段，不需要单独找地方配置。
> 运行时不再 spawn `lark-cli` / `gh`；插件直连飞书 OpenAPI 与 GitHub REST。CLI 只保留为「一次性导入」向导（可选）。

---

## 0. 结论

| 项 | 决定 |
|---|---|
| 账号模型 | 顶层 `accounts[]`（独立于 `channels`）；账号 id `acc_<12hex>` |
| 飞书 | **user OAuth（Device Flow）**；appId/appSecret 在账号表单填写；token 由插件管理并自动刷新 |
| GitHub | **PAT**（`repo` scope，粘一次）；Device Flow 留 v0.3+ |
| 凭据 | `ctx.credentials`（key `dsh-workbench/<accountId>/<field>`）；无该服务时 `$DSH_HOME/workbench/secrets.json`（0600） |
| 依赖 | 不再依赖 `lark-cli` / `gh` 运行时；只用 `fetch`（Node 内置） |
| 配置 | `channels.lark.accountId` / `channels.github.accountId` 引用账号；未配置账号 = 不轮询 |
| 迁移 | 旧 v0.1 配置自动升级（`config.version` 1→2）；提供「从 gh 导入 token / 手填飞书应用」向导 |
| 版本 | v0.2.0（授权层）→ v0.3.0（PR Review） |

---

## 1. 账号模型（`accounts.json`，0600）

```jsonc
{
  "version": 1,
  "accounts": [
    {
      "id": "acc_9f3c1a7b2d4e",
      "provider": "feishu",              // feishu | github
      "label": "飞书",
      "appId": "cli_xxx",                 // feishu：用户填写的应用 id
      "brand": "feishu",                  // feishu | lark
      "identity": { "name": "Pony", "openId": "ou_xxx", "avatarUrl": "" },
      "status": "ok",                     // ok | pending_auth | needs_auth | error
      "scopes": ["im:message", "offline_access", "..."],
      "expiresAt": "2026-10-26T14:50:11.000Z",        // access token 过期
      "refreshExpiresAt": "2026-11-02T12:50:11.000Z", // refresh token 过期
      "lastCheckedAt": "2026-10-26T14:00:00.000Z",
      "lastError": "",
      "createdAt": "2026-10-26T13:00:00.000Z"
    },
    {
      "id": "acc_1b7d2e9a0c33",
      "provider": "github",
      "label": "GitHub",
      "identity": { "login": "PonyDevAI", "name": "Pony", "avatarUrl": "" },
      "status": "ok",
      "scopes": ["repo"],
      "lastCheckedAt": "2026-10-26T14:00:00.000Z",
      "lastError": "",
      "createdAt": "2026-10-26T13:00:00.000Z"
    }
  ]
}
```

- 账号 id：`acc_` + 12 位 hex（随机，稳定不变；删除即作废）。
- `accounts.json` 只存身份/状态/过期时间等**非机密**字段；token 全在凭据层。
- 多账号：同 provider 可建多个；`channels.*.accountId` 决定用哪个。
- **不存明文 token / appSecret / PAT** 到 `accounts.json`。

### 1.1 凭据键（`ctx.credentials`）

| key | 值 | 说明 |
|---|---|---|
| `dsh-workbench/<accountId>/appSecret` | 飞书应用 secret | 仅创建/重新授权时写入 |
| `dsh-workbench/<accountId>/accessToken` | 飞书 user_access_token | 运行时读 |
| `dsh-workbench/<accountId>/refreshToken` | 飞书 refresh_token | 刷新时读 |
| `dsh-workbench/<accountId>/token` | GitHub PAT | 运行时读 |

- key 形如 `dsh-workbench/acc_xxx/accessToken`，与 dsh-im 的 `dsh-im/<accountId>/<field>` 同构。
- 无 `ctx.credentials` 时回落 `$DSH_HOME/workbench/secrets.json`：目录 0700、文件 0600、原子写；`accounts.json` 只存 `appSecretRef` 等引用名。
- API 回包只给 `configuredKeys: ["appSecret", "accessToken", "refreshToken"]`，**永不回明文**；前端只用掩码/状态。
- 日志经 `redact()`：token、appSecret、Authorization 头一律替换。

---

## 2. 飞书授权（Device Flow，已按 lark-cli 源码核对）

品牌域：

| brand | Accounts 域 | Open 域 |
|---|---|---|
| `feishu` | `https://accounts.feishu.cn` | `https://open.feishu.cn` |
| `lark` | `https://accounts.larksuite.com` | `https://open.larksuite.com` |

### 2.1 发起授权

```
POST {accounts}/oauth/v1/device_authorization
Authorization: Basic base64(appId:appSecret)
Content-Type: application/x-www-form-urlencoded

client_id=<appId>&scope=<scopes> offline_access
```

返回：`device_code` / `user_code` / `verification_uri` / `verification_uri_complete` / `expires_in`(默认 240s) / `interval`(默认 5s)。

UI 展示 `verification_uri_complete`（或二维码）与 `user_code`，告诉用户去飞书确认；`device_code` 只留在 Host。

### 2.2 轮询换 token

```
POST {open}/open-apis/authen/v2/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=<device_code>&client_id=<appId>&client_secret=<appSecret>
```

- `error=authorization_pending` → 继续按 `interval` 轮询；
- `error=slow_down` → interval +5s（上限 60s）；
- 成功：`access_token`（expires_in 默认 7200s）、`refresh_token`（`refresh_token_expires_in` 默认 604800s=7d）、`scope`；
- `access_denied` / `expired_token` / `invalid_grant` → 终止并提示重新发起。

### 2.3 刷新 token（提前 5 分钟）

```
POST {open}/open-apis/authen/v2/oauth/token
Content-Type: application/json

{ "grant_type": "refresh_token", "refresh_token": "<refresh>", "client_id": "<appId>", "client_secret": "<appSecret>" }
```

- 成功：替换 access/refresh token 与过期时间（refresh token 轮换，必须持久化新值）；
- 失败重试 1 次；仍失败且 `refresh_token` 过期 → 清 token，账号标 `needs_auth`；
- 并发单飞：同一账号同一时刻只允许一个刷新请求（Promise 锁）。

### 2.4 取身份

```
GET {open}/open-apis/authen/v1/user_info
Authorization: Bearer <access_token>
```

返回 `open_id / name / avatar_url / union_id / tenant_key`，写入 `accounts[].identity`。
刷新后调一次（用于更新头像/名称与校验 token）；失败但未 401 时保留旧身份。

### 2.5 状态机

```
needs_auth --发起并完成授权--> ok
ok --access 过期--> refreshing --> ok
refreshing --refresh 失败/过期--> needs_auth
任何 API 401 --> needs_auth（清 access，保留 refresh 以便重试）
```

`status=needs_auth` 时轮询跳过该账号并在面板状态卡提示「重新授权」，不自动弹浏览器。

---

## 3. GitHub 授权（PAT，v0.2.0）

- 账号表单：粘贴 PAT（classic，`repo` scope；或 fine-grained `Pull requests: read` + `Issues: write` 用于 v0.3 评论）。
- 校验：`GET https://api.github.com/user`（`Authorization: Bearer <token>`）→ `login / name / avatar_url`。
- 401 → `needs_auth`；403 且 `x-ratelimit-remaining: 0` → `error`（限流，退避）。
- token 只写凭据层，不写 `accounts.json`。
- 「从 gh 导入」向导（可选）：`gh auth token` 读出一次，直接写入凭据层；**运行时仍不依赖 gh**。

### 3.1 GitHub Device Flow（v0.3+ 增强，预留）

- 需要注册 OAuth App（client_id 公开）；流程：`POST https://github.com/login/device/code` → 用户输入 8 位码 → 轮询 `POST https://github.com/login/oauth/access_token`。
- 字段与 API 在 v0.2.0 只预留 `authMethod: 'pat' | 'device'`，默认 `pat`。

---

## 4. 采集层（替换 CLI）

| 能力 | 飞书（user token） | GitHub（PAT） |
|---|---|---|
| 列会话 | `GET /open-apis/im/v1/chats`（user_access_token） | — |
| 拉增量消息 | `GET /open-apis/im/v1/messages?container_id_type=chat&container_id=<chat>&start_time=<ms>&sort_type=ByCreateTimeAsc` | — |
| 列 open PR | — | `GET /repos/{repo}/pulls?state=open&sort=updated&per_page=50` |
| 按 PR 增量 | 留到 v0.3（compare API） | `GET /repos/{repo}/compare/{base}...{head}`（v0.3） |
| 发消息 | 留到 v0.3 | `POST /repos/{repo}/issues/{n}/comments`（v0.3） |

- HTTP 客户端：`lib/http.js`（`fetch` + 超时 + JSON + 统一错误分类 + 401/403/429 处理 + 退避）。
- 限流：读接口加最小间隔（飞书 ~3 req/s、GitHub 5000/h），429 读 `Retry-After`；多账号独立计数。
- 失败归类：`auth`（401→needs_auth，不重试）/ `rate-limit`（退避，不推进游标）/ `network`（退避重试 2 次）/ `unknown`。
- 消息/PR 归一化逻辑不变（envelope / rules 复用）。

---

## 5. 配置迁移（config v1 → v2）

```jsonc
// v2 顶层新增
"accounts": { "lark": "acc_9f3c…", "github": "acc_1b7d…" }   // 或写在 channels 下，见下
```

采用更直观的形式（写入 `config.json`）：

```jsonc
"channels": {
  "lark":   { "enabled": true, "accountId": "acc_9f3c…", "pollSeconds": 60, "watchedChats": [...] },
  "github": { "enabled": true, "accountId": "acc_1b7d…", "pollSeconds": 180, "watchedRepos": [...] }
}
```

- 迁移：v1 配置读入时自动写 `version: 2`，`accountId` 为空；不自动创建账号（需要用户授权）。
- 未配置 `accountId`：该渠道不轮询，状态卡提示「未连接账号」。
- `accounts.json` 与 `config.json` 分离：账号是凭据/身份，配置是监听规则。

---

## 6. UI（设置 → 工作台 → 账号）

```
设置 → 工作台
├─ 账号
│  ├─ 飞书 / 飞书账号  [ + 添加账号 ]
│  │   ✓ Pony（ou_…）  已授权 · 22:50 过期
│  │   [重新授权] [测试] [退出]
│  └─ GitHub  [ + 添加账号 ]
│      ✓ PonyDevAI  已授权 · repo
│      [重新授权] [测试] [退出]
├─ 监听（现有 v0.1 部分，增加"使用账号"下拉）
└─ 默认 / 存储 / 安全（现有）
```

添加飞书账号流程：

1. 表单：`appId`、`appSecret`、`brand`（飞书 / Lark）、`scope`（默认 `im:message offline_access`，可加）；
2. 点「授权」→ Host 请求 device authorization → 返回 `verification_uri_complete` + `user_code`；
3. 面板展示链接/二维码（本地生成）+ 倒计时，用户去飞书确认；
4. Host 轮询 token（页面可以关，Host 后台继续；重新打开账号页看到状态变化）；
5. 成功 → 显示 `Pony` 身份，状态 `ok`；失败/超时 → 提示重试。

添加 GitHub 账号：表单粘贴 PAT → 「连接」→ 成功显示 `login`；失败显示 401 原因。

安全提示：每个账号卡显示 scope 与最近使用时间；「退出」= 二次确认后删除凭据与账号记录；如需再用请重新添加/授权。

---

## 7. API 契约新增（`POST /workbench`）

| endpoint | payload | value |
|---|---|---|
| `accounts.list` | `{}` | `{ accounts: AccountView[] }`（无明文凭据） |
| `accounts.feishu.start` | `{ appId, appSecret, brand?, scope? }` | `{ accountId, userCode, verificationUri, expiresIn, interval }`（credential 已暂存） |
| `accounts.feishu.poll` | `{ accountId }` | `{ status: 'pending'\|'ok'\|'error', account?: AccountView, error?: string }`（Host 内部也继续轮询，页面可重复调） |
| `accounts.github.add` | `{ token }` | `{ account: AccountView }` |
| `accounts.test` | `{ accountId }` | `{ ok, status, identity?, error? }` |
| `accounts.remove` | `{ accountId }` | `{ ok: true }`（清凭据 + 删除账号记录） |
| `accounts.importGh` | `{}` | `{ account: AccountView }`（可选：`gh auth token` 只读一次） |

`AccountView`：

```jsonc
{ "id": "acc_x", "provider": "feishu", "label": "飞书",
  "identity": { "name": "Pony", "openId": "ou_…", "login": "" },
  "status": "ok", "scopes": [], "expiresAt": "", "refreshExpiresAt": "",
  "configuredKeys": ["appSecret", "accessToken", "refreshToken"],
  "lastCheckedAt": "", "lastError": "" }
```

错误码新增：`account/not-found`、`account/needs-auth`、`account/invalid-token`、`account/device-pending`、`account/rate-limited`、`credential/store-failed`。

---

## 8. 安全不变量（新增/调整）

1. **凭据只进凭据层**：`accounts.json`、日志、API 回包、事件历史都不含明文 token/appSecret；只读 `configuredKeys`。
2. **最小 scope**：飞书默认只申请 `im:message`（读）+ `offline_access`；发送类 scope 留到 v0.3 且显式提示。GitHub PAT 提示 `repo` 即可。
3. **不自动授权**：authorization 必须由用户在 UI 点击发起；无「静默续授」。
4. **401 不重试**：标 `needs_auth`，等用户重新授权；刷新失败不风暴。
5. **退出即删凭据**：`accounts.remove` 同时清 `ctx.credentials` 与 fallback，并移除账号记录（不保留占位、不复用账号 id）。
6. **旧 CLI 模式移除**：v0.2.0 运行时不再调用 `lark-cli` / `gh`；导入向导是唯一接触点，且只执行一次。
7. **本地回环 redirect 不需要**：Device Flow 无回调地址，不新增公网入口。

---

## 9. 测试与验收

**离线（mock fetch）**
- device authorization 请求：method/path/Basic auth/form 字段正确；
- 轮询：pending → slow_down → 成功；`access_denied`/`expired_token` 终止；
- 刷新：成功轮换 refresh token；失败一次后成功；refresh 过期 → needs_auth；
- 401 处理：不重试、状态变 needs_auth、不推进游标；
- PAT 校验 401/403/ok；限流退避；
- 凭据桥：`ctx.credentials` 有/无两条路径；`accounts.json` 不含 token；fallback 文件权限 0600；
- 配置迁移 v1→v2；未配 accountId = 不轮询。

**验收（真实环境）**
- 添加飞书账号 → 扫码/链接 → 显示 Pony → 轮询能拉到会话与增量；
- 添加 GitHub 账号（PAT）→ 显示 PonyDevAI → 能拉到 open PR；
- 重新授权 / 测试 / 退出 / 401 提示 / 限流提示都有 UI；
- `npm run check` + `npm run smoke` + `render-test` + 新账号 mock 测试全绿。

---

## 10. 版本与工作量

| 版本 | 内容 |
|---|---|
| v0.2.0 | 账号模型 + 凭据桥 + 飞书 Device Flow + GitHub PAT + HTTP 客户端 + 设置页账号区 + 配置迁移 + mock 测试 |
| v0.2.1（可选） | `accounts.importGh` 向导、账号健康巡检与限流计数展示 |
| v0.3.0 | PR Review Feature（复用账号的只读 HTTP 客户端 + 草稿确认 + GitHub 评论 + Lark 回复） |

预计 v0.2.0 改动：Host 新增/改 `lib/credentials.js`、`lib/accounts.js`、`lib/http.js`、`lib/clients/feishu.js`、`lib/clients/github.js`，替换 `lib/lark.js`/`lib/github.js` 的连接层；Client 设置页新增账号区；config/state schema + 文档同步。
