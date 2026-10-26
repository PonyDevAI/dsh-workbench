# dsh-workbench

[![npm](https://img.shields.io/npm/v/@ponydev/dsh-workbench)](https://www.npmjs.com/package/@ponydev/dsh-workbench)
[![license](https://img.shields.io/npm/l/@ponydev/dsh-workbench)](LICENSE)

**DeepSeek Harness（DSH）Web 插件：个人工作台——以 Pony 本人身份接入 Lark / 飞书与 GitHub，按白名单规则采集增量消息与 PR 动态，只做「采集 / 规则 / 历史」。**

不是 bot、不是团队 SaaS、不是 IM 客户端：没有机器人身份、没有公网入口、没有事件订阅。数据来自本机已登录的 `lark-cli`（`--as user`）与 `gh`，凭据不由插件保管。

v0.1 是**骨架版**：装进 profile 后能看到「哪些消息 / PR 命中了哪条规则」，并保留可回看的运行记录；**不发送任何消息、不执行 review、不写 PR 评论**（后续版本才接 PR Review Feature 与草稿确认）。

## 安装

要求：

- DSH `>=0.2.1-rc.2 <0.3.0`
- Node.js `>=22.5`（宿主自带，一般无需单独安装）
- 本机已安装并登录 [lark-cli](https://github.com/PonyDevAI)（需 user 身份）与 [GitHub CLI `gh`](https://cli.github.com/)

```bash
# 本机开发：link 安装（<repo> 换成本仓库路径）
dsh plugin --profile web add link:<repo>

# 或从 npm 安装
dsh plugin --profile web add @ponydev/dsh-workbench
```

装完重启 DSH Web 宿主并刷新页面（macOS 示例：`launchctl kickstart -k gui/$(id -u)/local.deepseek-harness.web`），然后打开左栏「工作台」。

先确认两个本机身份可用（插件不接管登录）：

```bash
lark-cli auth status   # identities.user.available 应为 true
gh auth status         # 已登录 PonyDevAI
```

## 快速开始

1. **安装并重启**宿主，左栏出现「工作台」，右侧主面板显示状态卡。
2. **添加监听会话**：设置 → 工作台 → Lark，点「添加群」会读取 `lark-cli` 的可见会话列表供选择，再设置模式（`mention` / `keyword` / `all` / `off`）与关键词。
3. **添加监听仓库**：GitHub 里填 `owner/repo`，可选本地 `path`（为后续 review 预留）、是否响应新 PR / 新 commit、是否跳过 draft、label 过滤。
4. **保存后看历史**：Host 按配置轮询；首次监听只建基线，下一次轮询起只处理增量，命中项进「最近事件」。

配置只在 Host 侧归一化并持久化，设置页只是编辑器；`watchedChats` / `watchedRepos` 为空时插件**不读不写**。

## v0.1 能力边界

| 做 | 不做 |
|---|---|
| 以本人身份轮询 Lark 会话消息与 GitHub open PR（只读） | 发送 / 回复 Lark 消息 |
| 白名单 + 规则匹配（@我 / 关键词 / 全部 / `/review` 命令；draft / labels / opened / new-commits） | 执行 review、评论 PR、approve / request changes / 合并 |
| 提取消息里的 GitHub PR 链接 | 修改代码、写工作区 |
| 运行记录与当天统计（`state.json`），可在主面板回看 | bot 身份、公网 webhook、事件订阅、新端口 |
| 设置页编辑 channels / defaults / storage（安全边界只读展示） | 模型分类器（配置位保留）、自动回复、日报 |

> `features['pr-review']` 与 `router.classifier` 的配置从第一天就存在，但 v0.1 **只读写配置、不消费**；PR Review 在 v0.2 落地。

## 配置

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

日常配置在 **设置 → 工作台** 编辑 `channels.lark` / `channels.github` / `defaults` / `storage`（安全边界只做只读展示，不提供开关）；完整 schema 见 [`docs/DESIGN.md`](docs/DESIGN.md) §8，可直接参考 [`docs/config.example.json`](docs/config.example.json)：

- `channels.lark`：`enabled`、`identity`（固定 `user`）、`pollSeconds`、`watchedChats[]`（`chatId` / `name` / `type` / `mode` / `keywords` / `allowReviewCommand`）、`p2pWhitelist`（私聊 open_id 白名单，schema 预留；v0.1 只处理显式加入 `watchedChats` 的会话）。
- `channels.github`：`enabled`、`pollSeconds`、`watchedRepos[]`（`repo` / `path` / `onOpened` / `onNewCommits` / `skipDraft` / `labels`）。
- `features['pr-review']`：模型、工作区、sinks、预算、权限（v0.1 预留）。
- `router.classifier`：模型分类器开关与预算（v0.1 预留，默认关闭）。
- `defaults`：默认模型、默认工作区。
- `safety`：`outbound`（默认 `draft`）、`rateLimitPerHour`、`allowApprove`（恒 `false`）。
- `storage`：日志保留天数、正文保留时长、历史条数（v0.1 实际生效的是历史条数上限，其余为配置位）。

轮询按游标增量 + `message_id` 去重；配置保存后 Host 热重排轮询，新监听的会话 / 仓库先建基线。

## 数据目录

默认 `$DSH_HOME/workbench`（即 `~/.dsh/workbench`，可用 `stateDir` 覆盖），目录 `0700`、文件 `0600`、原子写：

```
$DSH_HOME/workbench/
├── config.json     # 归一化后的全局配置（设置页保存写入）
├── state.json      # 游标 / 去重集合 / GitHub 已见 sha / 事件历史 / 当天统计
└── workbench.log   # 运行日志（脱敏；超过 1 MiB 轮转到 workbench.log.1）
```

`state.json` 损坏时先备份 `.corrupt-<ts>-<pid>` 再回落空状态，不覆盖唯一副本。

## 安全

- **管理面**：`POST /workbench` 全部经宿主 `ctx.connection.admit` 认证；写操作要求 `x-dsh-workbench-client: 1`；请求体 ≤1 MiB、只收 JSON。
- **身份**：Lark / 飞书固定 `lark-cli --as user`，GitHub 用 `gh` 的 PonyDevAI 身份；不切 bot、不伪装机器人。
- **白名单零监听**：只处理 `watchedChats` / `watchedRepos` 里配置的会话与仓库；入口为空 = 不读不写。
- **只读**：v0.1 不产生任何出站动作；`safety.outbound` 默认 `draft`，`safety.allowApprove` 设计上恒为 `false`。
- **凭据**：复用本机 `lark-cli` / `gh` 登录态，插件不落盘 token、不回显凭据；token 失效只在状态卡提示重新登录。
- **日志与保留**：不打印消息正文 / diff 全文 / token；消息正文不落盘（只进内存与截断后的事件标题），历史默认 200 条可配，日志按 1 MiB 轮转；「清空历史」只清事件 / 统计，不动游标与去重集合。
- **仓库门禁**：禁止真实凭据、真实 Lark 会话 ID、本机绝对路径、私有主机名、私钥进入版本库（`scripts/check-privacy.mjs`）。

## 开发与门禁

```bash
npm run check        # 语法 + i18n + 隐私 + 插件标识一致性（四道门禁）
npm run smoke        # Host 侧离线冒烟（不触网）
node scripts/check-syntax.mjs    # lib/**/*.js 逐个 node --check
node scripts/check-i18n.mjs      # DICT_ZH/DICT_EN 键一致 + t('key') + locale 元数据 + NS
node scripts/check-privacy.mjs   # 本机路径 / 真实 token / 真实 Lark ID / 私有主机名
node scripts/verify-plugin.mjs   # package.json exports / engines / manifestVersion / patch / client id
node scripts/release-notes.mjs   # 从 CHANGELOG 抽取当前版本（可带输出路径参数）
node --check scripts/*.mjs       # 门禁脚本自身的语法
```

`lib/client.js` 由 Client 半区手写（无构建、零运行时依赖），用 `test-render.html` 的假数据离线自测 UI，不需要重启宿主。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | 定位、入口槽位、数据流、Feature 契约、config / state schema、安全不变量、里程碑 |
| [docs/api-contract.md](docs/api-contract.md) | Host ⇄ Client `POST /workbench` 契约与错误码 |
| [docs/config.example.json](docs/config.example.json) | 完整的 `config.json` 示例 |
| [AGENTS.md](AGENTS.md) | 项目规范（目录职责、门禁、代码 / 安全 / UI / 发布 / 提交规范） |
| [CHANGELOG.md](CHANGELOG.md) | 版本说明（GitHub Release 正文来源） |

## 结构

```
lib/index.js       Host 入口：/workbench 路由、认证围栏、轮询器装配、状态目录
lib/config.js      配置默认值 / 归一化 / 保存
lib/lark.js        Lark / 飞书渠道（lark-cli user 身份轮询，只读）
lib/github.js      GitHub 渠道（gh api 只读 open PR）
lib/rules.js       规则匹配（纯函数，可离线测试）
lib/state.js       运行时状态（游标 / 去重 / 事件历史 / 统计）
lib/store.js       私有目录 + 原子 JSON 存储
lib/shell.js       子进程封装（execFile，不拼 shell）
lib/log.js         脱敏日志
lib/client.js      手写 ModuleLoader bundle：工作台面板 + 设置页 + i18n
cordis.patch.yml   bundle patch（插入 id: workbench + 默认配置）
locale/            zh / en 元数据（title / description）
scripts/           门禁与离线测试（check-syntax / check-i18n / check-privacy / verify-plugin / release-notes / smoke）
docs/              DESIGN、api-contract、config.example.json
test-render.html   离线 UI 渲染页（假数据）
```

## License

MIT
