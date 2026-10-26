# dsh-workbench · Host ⇄ Client API 契约（v0.1）

> 所有请求：`POST /workbench`，body `{ endpoint, payload }`。
> 响应：`{ ok: true, value }` 或 `{ ok: false, error: { code, message } }`。
> 认证：`ctx.connection.admit(req)`；写操作必须带 `x-dsh-workbench-client: 1`；body ≤ 1 MiB，仅 JSON。
> v0.1 只做「采集 / 规则 / 历史」，**不发送任何消息、不执行 review**。

## 读接口

### `state`

```jsonc
{
  "config": { /* 与 config.example.json 同构 */ },
  "status": {
    "lark": {
      "enabled": true,
      "identity": "user",
      "openId": "ou_xxx",              // 启动时从 lark-cli auth status 解析；失败为 ''
      "pollSeconds": 60,
      "lastPollAt": "2026-10-26T12:00:00.000Z",
      "nextPollAt": "2026-10-26T12:01:00.000Z",
      "lastError": "",
      "watchedChats": 3
    },
    "github": {
      "enabled": true,
      "user": "PonyDevAI",
      "pollSeconds": 180,
      "lastPollAt": "2026-10-26T12:00:00.000Z",
      "nextPollAt": "2026-10-26T12:03:00.000Z",
      "lastError": "",
      "watchedRepos": 2
    },
    "counters": {
      "larkMessages": 42,
      "larkMatched": 5,
      "githubPulls": 12,
      "githubMatched": 3
    }
  },
  "events": [ /* 最近 100 条，倒序，见下 */ ],
  "stats": { "today": { "events": 12, "matched": 3 } }
}
```

事件（v0.1 的“运行记录”）：

```jsonc
{
  "id": "ev_01",
  "at": "2026-10-26T12:00:00.000Z",
  "source": "lark",                 // lark | github
  "kind": "message",                // message | pr | commit | baseline
  "title": "群「研发-前端」· 看下这个 PR ...",
  "url": "https://github.com/acme/web-app/pull/128",  // 可空
  "chatId": "oc_xxx",               // lark 时
  "repo": "",                       // github 时
  "matched": true,
  "ruleId": "chat:oc_xxx",
  "reason": "mention",              // mention | keyword | all | command | pr-link | opened | commits | baseline
  "status": "matched"               // matched | ignored | baseline
}
```

### `lark.chats`

```jsonc
// value
{ "chats": [{ "chatId": "oc_xxx", "name": "研发-前端", "type": "group", "memberCount": 12 }] }
```

来自 `lark-cli im +chat-list --as user`；失败回 `{ ok:false, error:{ code:'lark/not-configured' } }`。

### `rules.test`

离线验证规则（不发请求、不落库）：

```jsonc
// payload
{ "source": "lark", "chatId": "oc_xxx", "text": "看下这个 https://github.com/a/b/pull/1", "mentions": ["ou_me"] }
// value
{ "matched": true, "ruleId": "chat:oc_xxx", "reason": "pr-link", "prs": [{ "repo": "a/b", "number": 1 }] }
```

### `health`

```jsonc
{ "lark": { "ok": true, "message": "user identity ready" }, "github": { "ok": true, "user": "PonyDevAI", "message": "logged in" } }
```

只回静态结论，不回 CLI 原始输出；结果缓存 60s。

## 写接口

| endpoint | payload | value |
|---|---|---|
| `config.save` | `{ config }` | `{ config }`（归一化后；保存后轮询器热重排、新监听建基线） |
| `lark.check` | `{}` | `{ started: true }`（立即跑一轮 Lark 轮询） |
| `github.check` | `{}` | `{ started: true }`（立即跑一轮 GitHub 轮询） |
| `history.clear` | `{}` | `{ ok: true }`（清 events/stats，不动游标与 seen） |

## 规则语义（v0.1）

**Lark**：只处理 `channels.lark.watchedChats` 中 `mode !== 'off'` 的会话。

```
matched =
  mode === 'all'
  || (mode === 'mention' && mentions 含我的 openId)
  || (mode === 'keyword' && 文本命中任一 keyword，忽略大小写)
  || (allowReviewCommand && 文本以 /review 开头)
```

matched 后再提取 GitHub PR 链接（`https://github.com/<owner>/<repo>/pull/<n>`），写入 `reason='pr-link'` 与 `prs`。同一会话首次轮询只建基线（`status='baseline'`），不产生 matched。

**GitHub**：只处理 `channels.github.watchedRepos` 中的仓库。

```
draft 且 skipDraft → 跳过
labels 非空且无交集 → 跳过
首次见到该 PR → 记 lastSeenSha，事件 status='baseline'
headSha !== lastSeenSha →
  有 onOpened && 之前无记录 → status='matched', reason='opened'
  否则有 onNewCommits → status='matched', reason='commits'
每次轮询后更新 lastSeenSha（v0.1 不推进 lastReviewedSha，留给 v0.2）
```

## 错误码

| code | 场景 |
|---|---|
| `auth/denied` | 未认证 / 缺客户端头 |
| `config/invalid` | 配置非法（保存被拒，附 message） |
| `lark/not-configured` | lark-cli 未登录 / user 身份不可用 |
| `github/not-configured` | gh 未登录 |
| `sync/busy` | 同类轮询正在跑 |
| `internal` | 其余异常（只回短文案） |

## 客户端轮询与写操作

- 挂载后 `state` 一次，随后每 8s；`document.visibilityState === 'hidden'` 时暂停。
- 写操作串行；成功后立即刷新一次 `state`。
- 前端永远不显示：CLI 原始输出、消息正文之外的隐私、token、diff。
