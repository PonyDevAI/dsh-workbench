// dsh-workbench · Client 半区（手写 ModuleLoader bundle，无构建步骤、零运行时依赖）
// - 设置 → 工作台：全局配置（Lark / GitHub / 默认 / 存储），本地草稿，点「保存」才提交
// - 主栏「工作台」面板：状态卡、监听规则、最近事件、手动检查、清空历史
// - 侧栏全局面板图标（sidebar.panellist）
// - 数据只来自同源 HTTP 契约：POST /workbench { endpoint, payload }；写操作带 x-dsh-workbench-client: 1
// - v0.1 边界：只采集与记录，不发送消息、不执行 review
window.__ModuleLoader__.load({
  id: '@ponydev/dsh-workbench',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-workbench'

    // ---------------------------------------------------------------- i18n 字典
    // 纯字面量对象：scripts/check-i18n.mjs 直接定位并静态求值，zh / en 键集合必须完全一致。
    const DICT_ZH = {
      'panel.label': '工作台',
      'panel.title': '工作台',
      'panel.desc': '以本人身份采集 Lark 与 GitHub 的增量，按规则记录为可回看的事件。',
      'boundary.note': 'v0.1 只采集与记录，不发送消息、不执行 review。',
      'settings.label': '工作台',
      'settings.title': '工作台',
      'settings.desc': '以本人身份接入 Lark 与 GitHub；只读采集，配置全部保存在本机 Host。',
      'status.running': '运行中',
      'status.paused': '已暂停',
      'action.refresh': '重新读取',
      'action.refreshing': '正在读取…',
      'action.checkLark': '立即检查 Lark',
      'action.checkingLark': '正在检查 Lark…',
      'action.checkGithub': '立即检查 GitHub',
      'action.checkingGithub': '正在检查 GitHub…',
      'action.clearHistory': '清空历史',
      'action.clearing': '正在清空…',
      'action.confirmClear': '确认清空',
      'action.cancelClear': '取消',
      'action.retry': '重试',
      'action.save': '保存',
      'action.saving': '保存中…',
      'action.discard': '放弃改动',
      'action.addChat': '添加群',
      'action.addRepo': '添加仓库',
      'action.remove': '删除',
      'action.close': '关闭',
      'action.cancel': '取消',
      'channel.disabledHint': '该渠道未启用，请到设置里开启。',
      'lark.title': 'Lark',
      'lark.poll': '轮询间隔',
      'lark.lastPoll': '最近轮询',
      'lark.watchedChats': '监听会话',
      'lark.lastError': '最近错误',
      'github.title': 'GitHub',
      'github.poll': '轮询间隔',
      'github.lastPoll': '最近轮询',
      'github.watchedRepos': '监听仓库',
      'github.lastError': '最近错误',
      'counters.title': '计数',
      'counters.larkMessages': 'Lark 消息',
      'counters.larkMatched': 'Lark 命中',
      'counters.githubPulls': 'GitHub PR',
      'counters.githubMatched': 'GitHub 命中',
      'counters.today': '今日 {events} 条事件 / {matched} 条命中',
      'rules.title': '监听规则',
      'rules.lark': '群 / 私聊',
      'rules.github': '仓库',
      'rules.larkEmpty': '还没有监听会话。',
      'rules.githubEmpty': '还没有监听仓库。',
      'rules.goSettings': '去设置里添加监听',
      'rules.col.chatId': '会话 ID',
      'rules.col.name': '名称',
      'rules.col.mode': '模式',
      'rules.col.keywords': '关键词',
      'rules.col.onOpened': '新 PR',
      'rules.col.onNewCommits': '新提交',
      'rules.col.skipDraft': '跳过草稿',
      'rules.noKeywords': '—',
      'rules.noPath': '—',
      'mode.mention': '仅 @ 我',
      'mode.keyword': '关键词',
      'mode.all': '全部',
      'mode.off': '关闭',
      'events.title': '最近事件',
      'events.count': '{n} 条',
      'events.empty': '还没有事件。开启监听并等待下一轮轮询后，命中记录会出现在这里。',
      'events.source.lark': 'Lark',
      'events.source.github': 'GitHub',
      'events.status.matched': '命中',
      'events.status.baseline': '基线',
      'events.status.ignored': '忽略',
      'events.openLink': '打开链接',
      'events.cleared': '已清空历史。',
      'events.clearConfirm': '清空最近事件与统计？游标与已读记录会保留。',
      'reason.mention': '被 @',
      'reason.keyword': '命中关键词',
      'reason.all': '全部消息',
      'reason.command': '命令',
      'reason.pr-link': 'PR 链接',
      'reason.opened': '新 PR',
      'reason.commits': '新提交',
      'reason.baseline': '基线',
      'settings.draftHint': '有未保存的改动',
      'settings.saved': '已保存',
      'settings.saveFailed': '保存失败',
      'settings.empty': '宿主没有返回配置。',
      'settings.loading': '正在读取配置…',
      'panel.loading': '加载中…',
      'settings.lark.section': 'Lark',
      'settings.lark.enabled': '启用 Lark 采集',
      'settings.lark.pollSeconds': '轮询间隔（秒）',
      'settings.lark.pollHint': '允许 {min}–{max} 秒；保存后立即生效。',
      'settings.lark.chats': '监听会话',
      'settings.lark.chatsEmpty': '还没有监听会话。先添加群，再选择匹配模式。',
      'settings.lark.chat.name': '名称',
      'settings.lark.chat.chatId': '会话 ID',
      'settings.lark.chat.mode': '模式',
      'settings.lark.chat.keywords': '关键词',
      'settings.lark.chat.keywordsPlaceholder': '多个关键词用逗号分隔',
      'settings.lark.chat.nameUnknown': '未命名会话',
      'settings.lark.chat.pickerTitle': '选择要监听的群',
      'settings.lark.chat.pickerDesc': '只列出你本人可见的群；v0.1 只读取，不会发送消息。',
      'settings.lark.chat.pickerLoading': '正在读取群列表…',
      'settings.lark.chat.pickerEmpty': '没有可添加的群。',
      'settings.lark.chat.pickerFailed': '读取群列表失败',
      'settings.lark.chat.added': '已加入 {n} 个会话。',
      'settings.lark.chat.alreadyAdded': '已添加',
      'settings.lark.chat.selectedCount': '已选 {n} 个',
      'settings.github.section': 'GitHub',
      'settings.github.enabled': '启用 GitHub 采集',
      'settings.github.pollSeconds': '轮询间隔（秒）',
      'settings.github.pollHint': '允许 {min}–{max} 秒。',
      'settings.github.repos': '监听仓库',
      'settings.github.reposEmpty': '还没有监听仓库。至少添加一个 owner/repo。',
      'settings.github.repo.repo': '仓库',
      'settings.github.repo.repoPlaceholder': 'owner/repo',
      'settings.github.repo.path': '路径（可选）',
      'settings.github.repo.pathPlaceholder': '例如 ~/repo 或 /abs/path',
      'settings.github.repo.onOpened': '新 PR 时记录',
      'settings.github.repo.onNewCommits': '有新提交时记录',
      'settings.github.repo.skipDraft': '跳过草稿 PR',
      'settings.github.repo.invalid': '请填写形如 owner/repo 的仓库',
      'settings.defaults.section': '默认设置',
      'settings.defaults.model': '模型',
      'settings.defaults.modelPlaceholder': '留空 = DSH 默认',
      'settings.defaults.modelHint': '形如 provider/model。',
      'settings.defaults.modelInvalid': '模型需填写 provider/model，或留空使用 DSH 默认。',
      'settings.defaults.workspace': '工作区',
      'settings.defaults.workspacePlaceholder': '绝对路径或 ~/…；留空使用 Host 默认',
      'settings.storage.section': '存储',
      'settings.storage.contentRetentionHours': '正文保留（小时）',
      'settings.storage.historyLimit': '历史条数上限',
      'settings.storage.logRetentionDays': '日志保留（天）',
      'settings.storage.retentionHint': '范围：正文 1–168 小时、历史 20–1000 条、日志 1–90 天；超出会被 Host 归一化。',
      'settings.safety.title': '安全边界',
      'settings.safety.draft': '默认草稿：改动先存在本地草稿里，点「保存」才提交给 Host。',
      'settings.safety.readonly': '只读：v0.1 不发送消息、不执行 review、不评论 PR。',
      'settings.safety.whitelist': '白名单：只处理你显式加入的会话与仓库。',
      'settings.safety.noOutbound': 'v0.1 没有任何出站动作。',
      'settings.accounts.section': '账号',
      'settings.accounts.desc': '飞书与 GitHub 账号与授权。凭据只存在 Host 凭据层，页面不回显。',
      'settings.accounts.empty': '还没有账号。先添加飞书或 GitHub 账号。',
      'settings.accounts.addFeishu': '添加飞书账号',
      'settings.accounts.addGithub': '添加 GitHub 账号',
      'settings.accounts.importGh': '从 gh 导入',
      'settings.accounts.importing': '导入中…',
      'settings.accounts.refresh': '刷新账号',
      'settings.accounts.refreshing': '刷新中…',
      'settings.accounts.loadFailed': '读取账号列表失败',
      'settings.accounts.removed': '账号已退出。',
      'account.status.ok': '已授权',
      'account.status.needsAuth': '需重新授权',
      'account.status.error': '异常',
      'account.status.disabled': '已退出',
      'account.status.pending': '授权中',
      'account.provider.feishu': '飞书',
      'account.provider.lark': 'Lark',
      'account.provider.github': 'GitHub',
      'account.identity': '身份',
      'account.identityUnknown': '未知身份',
      'account.scopes': 'Scope',
      'account.expires': '访问令牌过期',
      'account.refreshExpires': '刷新令牌过期',
      'account.expired': '已过期',
      'account.configuredKeys': '已配置凭据',
      'account.configuredKeysCount': '已配置 {n} 项',
      'account.lastChecked': '最近检查',
      'account.lastError': '最近错误',
      'account.never': '从未',
      'account.test': '测试',
      'account.testing': '测试中…',
      'account.testOk': '连接正常',
      'account.testFailed': '连接失败',
      'account.reauth': '重新授权',
      'account.remove': '退出',
      'account.removeConfirm': '退出该账号？凭据会被清除，账号保留为已退出。',
      'account.removeYes': '确认退出',
      'account.removeCancel': '取消',
      'account.channel.label': '使用账号',
      'account.channel.none': '未连接账号',
      'account.channel.missing': '账号已失效，请重新选择',
      'account.channel.emptyHint': '还没有可用账号，请先在「账号」区添加。',
      'account.needsAuthHint': '需要重新授权：请到「账号」区重新授权。',
      'account.notConnected': '未连接账号',
      'account.disabledHint': '账号已退出，请重新授权。',
      'account.feishu.title': '添加飞书账号',
      'account.feishu.appId': 'App ID',
      'account.feishu.appIdPlaceholder': 'cli_xxx',
      'account.feishu.appSecret': 'App Secret',
      'account.feishu.appSecretPlaceholder': '只提交给 Host，不回显',
      'account.feishu.brand': '品牌',
      'account.feishu.brandFeishu': '飞书',
      'account.feishu.brandLark': 'Lark',
      'account.feishu.scope': 'Scope',
      'account.feishu.scopeHint': '默认 im:message offline_access；只读采集用最小权限。',
      'account.feishu.start': '开始授权',
      'account.feishu.starting': '正在发起授权…',
      'account.feishu.missingFields': '请填写 App ID 与 App Secret。',
      'account.feishu.userCode': '验证码',
      'account.feishu.verifyUri': '打开授权页',
      'account.feishu.remaining': '剩余 {time}',
      'account.feishu.waiting': '等待你在飞书中确认…',
      'account.feishu.expired': '授权已超时，请重新发起。',
      'account.feishu.failed': '授权失败',
      'account.feishu.retry': '重新发起',
      'account.feishu.cancel': '取消授权',
      'account.feishu.done': '飞书账号已授权。',
      'account.github.title': '添加 GitHub 账号',
      'account.github.token': 'Personal Access Token',
      'account.github.tokenPlaceholder': '粘一次，只提交给 Host',
      'account.github.tokenHint': 'Classic token 需要 repo scope；只读采集用最小权限。',
      'account.github.connect': '连接',
      'account.github.connecting': '连接中…',
      'account.github.missingToken': '请粘贴 PAT。',
      'account.github.failed': '连接失败',
      'account.github.added': 'GitHub 账号已添加。',
      'account.github.imported': '已从 gh 导入账号。',
      'account.github.importFailed': '从 gh 导入失败',
      'panel.account': '账号',
      'panel.auth': '授权',
      'panel.accountMissing': '未连接账号，请到设置 → 工作台 → 账号添加。',
      'panel.channel': '渠道',
      'status.enabled': '已启用',
      'status.disabled': '已停用',
      'common.yes': '是',
      'common.no': '否',
      'common.none': '—',
      'common.seconds': '{n} 秒',
      'common.unknown': '未知',
      'time.never': '从未',
      'error.load': '读取工作台状态失败',
      'error.action': '操作失败',
      'error.configInvalid': '配置不合法',
    }
    const DICT_EN = {
      'panel.label': 'Workbench',
      'panel.title': 'Workbench',
      'panel.desc': 'Collect Lark and GitHub increments as your own identity, and record rule hits as reviewable events.',
      'boundary.note': 'v0.1 only collects and records: no messages are sent and no reviews are executed.',
      'settings.label': 'Workbench',
      'settings.title': 'Workbench',
      'settings.desc': 'Connect Lark and GitHub as your own identity. Read-only collection; configuration stays on the local host.',
      'status.running': 'Running',
      'status.paused': 'Paused',
      'action.refresh': 'Reload',
      'action.refreshing': 'Reloading…',
      'action.checkLark': 'Check Lark now',
      'action.checkingLark': 'Checking Lark…',
      'action.checkGithub': 'Check GitHub now',
      'action.checkingGithub': 'Checking GitHub…',
      'action.clearHistory': 'Clear history',
      'action.clearing': 'Clearing…',
      'action.confirmClear': 'Confirm clear',
      'action.cancelClear': 'Cancel',
      'action.retry': 'Retry',
      'action.save': 'Save',
      'action.saving': 'Saving…',
      'action.discard': 'Discard changes',
      'action.addChat': 'Add chat',
      'action.addRepo': 'Add repository',
      'action.remove': 'Remove',
      'action.close': 'Close',
      'action.cancel': 'Cancel',
      'channel.disabledHint': 'This channel is disabled. Enable it in settings.',
      'lark.title': 'Lark',
      'lark.poll': 'Poll interval',
      'lark.lastPoll': 'Last poll',
      'lark.watchedChats': 'Watched chats',
      'lark.lastError': 'Last error',
      'github.title': 'GitHub',
      'github.poll': 'Poll interval',
      'github.lastPoll': 'Last poll',
      'github.watchedRepos': 'Watched repositories',
      'github.lastError': 'Last error',
      'counters.title': 'Counters',
      'counters.larkMessages': 'Lark messages',
      'counters.larkMatched': 'Lark matches',
      'counters.githubPulls': 'GitHub PRs',
      'counters.githubMatched': 'GitHub matches',
      'counters.today': 'Today: {events} events / {matched} matches',
      'rules.title': 'Watch rules',
      'rules.lark': 'Chats',
      'rules.github': 'Repositories',
      'rules.larkEmpty': 'No watched chats yet.',
      'rules.githubEmpty': 'No watched repositories yet.',
      'rules.goSettings': 'Add watches in settings',
      'rules.col.chatId': 'Chat ID',
      'rules.col.name': 'Name',
      'rules.col.mode': 'Mode',
      'rules.col.keywords': 'Keywords',
      'rules.col.onOpened': 'New PR',
      'rules.col.onNewCommits': 'New commits',
      'rules.col.skipDraft': 'Skip draft',
      'rules.noKeywords': '—',
      'rules.noPath': '—',
      'mode.mention': 'Mentions only',
      'mode.keyword': 'Keywords',
      'mode.all': 'All messages',
      'mode.off': 'Off',
      'events.title': 'Recent events',
      'events.count': '{n}',
      'events.empty': 'No events yet. Turn on a channel and wait for the next poll; matches will show up here.',
      'events.source.lark': 'Lark',
      'events.source.github': 'GitHub',
      'events.status.matched': 'Matched',
      'events.status.baseline': 'Baseline',
      'events.status.ignored': 'Ignored',
      'events.openLink': 'Open link',
      'events.cleared': 'History cleared.',
      'events.clearConfirm': 'Clear recent events and counters? Cursors and seen records are kept.',
      'reason.mention': 'Mentioned',
      'reason.keyword': 'Keyword hit',
      'reason.all': 'All messages',
      'reason.command': 'Command',
      'reason.pr-link': 'PR link',
      'reason.opened': 'Opened',
      'reason.commits': 'New commits',
      'reason.baseline': 'Baseline',
      'settings.draftHint': 'Unsaved changes',
      'settings.saved': 'Saved',
      'settings.saveFailed': 'Save failed',
      'settings.empty': 'The host returned no configuration.',
      'settings.loading': 'Loading configuration…',
      'panel.loading': 'Loading…',
      'settings.lark.section': 'Lark',
      'settings.lark.enabled': 'Enable Lark collection',
      'settings.lark.pollSeconds': 'Poll interval (seconds)',
      'settings.lark.pollHint': 'Allowed {min}–{max} seconds; takes effect after saving.',
      'settings.lark.chats': 'Watched chats',
      'settings.lark.chatsEmpty': 'No watched chats yet. Add a chat first, then pick a match mode.',
      'settings.lark.chat.name': 'Name',
      'settings.lark.chat.chatId': 'Chat ID',
      'settings.lark.chat.mode': 'Mode',
      'settings.lark.chat.keywords': 'Keywords',
      'settings.lark.chat.keywordsPlaceholder': 'Separate keywords with commas',
      'settings.lark.chat.nameUnknown': 'Unnamed chat',
      'settings.lark.chat.pickerTitle': 'Choose chats to watch',
      'settings.lark.chat.pickerDesc': 'Only chats visible to your own account are listed; v0.1 is read-only and sends nothing.',
      'settings.lark.chat.pickerLoading': 'Loading chats…',
      'settings.lark.chat.pickerEmpty': 'No chats available to add.',
      'settings.lark.chat.pickerFailed': 'Failed to load chats',
      'settings.lark.chat.added': 'Added {n} chats.',
      'settings.lark.chat.alreadyAdded': 'Added',
      'settings.lark.chat.selectedCount': '{n} selected',
      'settings.github.section': 'GitHub',
      'settings.github.enabled': 'Enable GitHub collection',
      'settings.github.pollSeconds': 'Poll interval (seconds)',
      'settings.github.pollHint': 'Allowed {min}–{max} seconds.',
      'settings.github.repos': 'Watched repositories',
      'settings.github.reposEmpty': 'No watched repositories yet. Add at least one owner/repo.',
      'settings.github.repo.repo': 'Repository',
      'settings.github.repo.repoPlaceholder': 'owner/repo',
      'settings.github.repo.path': 'Path (optional)',
      'settings.github.repo.pathPlaceholder': 'e.g. ~/repo or /abs/path',
      'settings.github.repo.onOpened': 'Record new PRs',
      'settings.github.repo.onNewCommits': 'Record new commits',
      'settings.github.repo.skipDraft': 'Skip draft PRs',
      'settings.github.repo.invalid': 'Enter a repository as owner/repo',
      'settings.defaults.section': 'Defaults',
      'settings.defaults.model': 'Model',
      'settings.defaults.modelPlaceholder': 'Empty = DSH default',
      'settings.defaults.modelHint': 'Form: provider/model.',
      'settings.defaults.modelInvalid': 'Enter provider/model, or leave empty for the DSH default.',
      'settings.defaults.workspace': 'Workspace',
      'settings.defaults.workspacePlaceholder': 'Absolute path or ~/…; empty uses the host default',
      'settings.storage.section': 'Storage',
      'settings.storage.contentRetentionHours': 'Content retention (hours)',
      'settings.storage.historyLimit': 'History limit',
      'settings.storage.logRetentionDays': 'Log retention (days)',
      'settings.storage.retentionHint': 'Ranges: content 1–168h, history 20–1000, logs 1–90d; host normalizes out-of-range values.',
      'settings.safety.title': 'Safety boundary',
      'settings.safety.draft': 'Draft by default: changes stay local until you press Save.',
      'settings.safety.readonly': 'Read-only: v0.1 sends no messages, runs no reviews and posts no PR comments.',
      'settings.safety.whitelist': 'Allowlist: only chats and repositories you add explicitly are processed.',
      'settings.safety.noOutbound': 'v0.1 performs no outbound actions.',
      'settings.accounts.section': 'Accounts',
      'settings.accounts.desc': 'Feishu and GitHub accounts and authorizations. Credentials stay in the host credential store and are never echoed here.',
      'settings.accounts.empty': 'No accounts yet. Add a Feishu or GitHub account first.',
      'settings.accounts.addFeishu': 'Add Feishu account',
      'settings.accounts.addGithub': 'Add GitHub account',
      'settings.accounts.importGh': 'Import from gh',
      'settings.accounts.importing': 'Importing…',
      'settings.accounts.refresh': 'Refresh accounts',
      'settings.accounts.refreshing': 'Refreshing…',
      'settings.accounts.loadFailed': 'Failed to load accounts',
      'settings.accounts.removed': 'Account signed out.',
      'account.status.ok': 'Authorized',
      'account.status.needsAuth': 'Reauthorize',
      'account.status.error': 'Error',
      'account.status.disabled': 'Signed out',
      'account.status.pending': 'Authorizing',
      'account.provider.feishu': 'Feishu',
      'account.provider.lark': 'Lark',
      'account.provider.github': 'GitHub',
      'account.identity': 'Identity',
      'account.identityUnknown': 'Unknown identity',
      'account.scopes': 'Scopes',
      'account.expires': 'Access token expires',
      'account.refreshExpires': 'Refresh token expires',
      'account.expired': 'Expired',
      'account.configuredKeys': 'Configured credentials',
      'account.configuredKeysCount': '{n} configured',
      'account.lastChecked': 'Last checked',
      'account.lastError': 'Last error',
      'account.never': 'Never',
      'account.test': 'Test',
      'account.testing': 'Testing…',
      'account.testOk': 'Connection OK',
      'account.testFailed': 'Connection failed',
      'account.reauth': 'Reauthorize',
      'account.remove': 'Sign out',
      'account.removeConfirm': 'Sign out this account? Its credentials are cleared and the account is kept as signed out.',
      'account.removeYes': 'Confirm sign out',
      'account.removeCancel': 'Cancel',
      'account.channel.label': 'Account',
      'account.channel.none': 'No account',
      'account.channel.missing': 'Account is gone, choose another',
      'account.channel.emptyHint': 'No usable account yet. Add one in the Accounts section first.',
      'account.needsAuthHint': 'Reauthorization required: reauthorize in the Accounts section.',
      'account.notConnected': 'Not connected',
      'account.disabledHint': 'Account signed out; reauthorize it.',
      'account.feishu.title': 'Add Feishu account',
      'account.feishu.appId': 'App ID',
      'account.feishu.appIdPlaceholder': 'cli_xxx',
      'account.feishu.appSecret': 'App Secret',
      'account.feishu.appSecretPlaceholder': 'Sent to the host only, never echoed',
      'account.feishu.brand': 'Brand',
      'account.feishu.brandFeishu': 'Feishu',
      'account.feishu.brandLark': 'Lark',
      'account.feishu.scope': 'Scopes',
      'account.feishu.scopeHint': 'Default im:message offline_access; keep read-only scopes minimal.',
      'account.feishu.start': 'Start authorization',
      'account.feishu.starting': 'Starting…',
      'account.feishu.missingFields': 'Enter App ID and App Secret.',
      'account.feishu.userCode': 'Verification code',
      'account.feishu.verifyUri': 'Open authorization page',
      'account.feishu.remaining': '{time} left',
      'account.feishu.waiting': 'Waiting for your confirmation in Feishu…',
      'account.feishu.expired': 'Authorization timed out, start again.',
      'account.feishu.failed': 'Authorization failed',
      'account.feishu.retry': 'Start again',
      'account.feishu.cancel': 'Cancel',
      'account.feishu.done': 'Feishu account authorized.',
      'account.github.title': 'Add GitHub account',
      'account.github.token': 'Personal Access Token',
      'account.github.tokenPlaceholder': 'Paste once, sent to the host only',
      'account.github.tokenHint': 'Classic tokens need the repo scope; use minimal permissions for read-only collection.',
      'account.github.connect': 'Connect',
      'account.github.connecting': 'Connecting…',
      'account.github.missingToken': 'Paste a PAT.',
      'account.github.failed': 'Connection failed',
      'account.github.added': 'GitHub account added.',
      'account.github.imported': 'Imported an account from gh.',
      'account.github.importFailed': 'Failed to import from gh',
      'panel.account': 'Account',
      'panel.auth': 'Authorization',
      'panel.accountMissing': 'No account connected; add one in Settings → Workbench → Accounts.',
      'panel.channel': 'Channel',
      'status.enabled': 'Enabled',
      'status.disabled': 'Disabled',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.none': '—',
      'common.seconds': '{n}s',
      'common.unknown': 'Unknown',
      'time.never': 'Never',
      'error.load': 'Failed to read workbench state',
      'error.action': 'Action failed',
      'error.configInvalid': 'Invalid configuration',
    }
    const zh = DICT_ZH
    const en = DICT_EN

    // ---------------------------------------------------------------- 常量
    const ENDPOINT = '/workbench'
    const CLIENT_HEADER = 'x-dsh-workbench-client'
    const WRITE_ENDPOINTS = new Set([
      'config.save',
      'lark.check',
      'github.check',
      'history.clear',
      'accounts.feishu.start',
      'accounts.feishu.poll',
      'accounts.github.add',
      'accounts.test',
      'accounts.remove',
      'accounts.importGh',
    ])
    const FEISHU_DEFAULT_SCOPE = 'im:message offline_access'
    const POLL_BASE_MS = 8000
    const POLL_MAX_MS = 60000
    const LARK_POLL = { min: 30, max: 300, step: 10, fallback: 60 }
    const GITHUB_POLL = { min: 60, max: 3600, step: 60, fallback: 180 }
    const CHAT_MODES = ['mention', 'keyword', 'all', 'off']
    // 与 Host lib/config.js 的 int({ min, max }) 保持一致，避免保存后值被静默归一化。
    const STORAGE_LIMITS = {
      contentRetentionHours: { min: 1, max: 168, step: 1, fallback: 24 },
      historyLimit: { min: 20, max: 1000, step: 20, fallback: 200 },
      logRetentionDays: { min: 1, max: 90, step: 1, fallback: 7 },
    }
    const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

    // ---------------------------------------------------------------- locale tick
    const LOCALE_SUBS = new Set()
    function useLocaleTick() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const fn = () => bump((n) => n + 1)
        LOCALE_SUBS.add(fn)
        return () => { LOCALE_SUBS.delete(fn) }
      }, [])
    }
    function formatDict(dict, key, params) {
      let text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
      if (params) {
        for (const name of Object.keys(params)) text = text.split('{' + name + '}').join(String(params[name]))
      }
      return text
    }
    function makeT(dict) {
      return (key, params) => formatDict(dict, key, params)
    }
    /** 优先用宿主 locale.bind(NS)；不可用或返回 key 时回落到内联 DICT_ZH。 */
    function createT(bind) {
      return (key, params) => {
        let out = null
        try {
          if (typeof bind === 'function') {
            const fn = bind()
            if (typeof fn === 'function') out = params ? fn(key, params) : fn(key)
          }
        } catch (error) { out = null }
        if (out != null && out !== key && typeof out === 'string') return out
        return formatDict(DICT_ZH, key, params)
      }
    }

    // ---------------------------------------------------------------- 小工具
    function cn() {
      let out = ''
      for (let i = 0; i < arguments.length; i += 1) {
        const value = arguments[i]
        if (!value) continue
        out = out ? out + ' ' + value : String(value)
      }
      return out
    }
    function asObject(value) {
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    }
    function asArray(value) {
      return Array.isArray(value) ? value : []
    }
    function asString(value) {
      return value == null ? '' : String(value)
    }
    function asBool(value, fallback) {
      if (value === true || value === false) return value
      return fallback === true
    }
    function asNumber(value, fallback) {
      const numeric = Number(value)
      return Number.isFinite(numeric) ? numeric : fallback
    }
    function clone(value) {
      try {
        return JSON.parse(JSON.stringify(value == null ? {} : value))
      } catch (error) {
        return {}
      }
    }
    /** 只保留短文案，不把宿主/CLI 细节原样铺到 UI。 */
    function shortError(raw) {
      const text = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim()
      return text ? text.slice(0, 180) : ''
    }
    function pad2(value) {
      return value < 10 ? '0' + value : String(value)
    }
    function formatTime(iso) {
      const ts = Date.parse(String(iso || ''))
      if (!Number.isFinite(ts)) return ''
      const d = new Date(ts)
      return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    }
    function safeUrl(raw) {
      const text = asString(raw).trim()
      if (!/^https?:\/\//i.test(text)) return ''
      return text
    }
    function isConstructor(value) {
      return typeof value === 'function' && value.prototype != null
    }
    function withBoundary(Comp) {
      const Base = React.Component
      if (!isConstructor(Base)) return Comp
      class Boundary extends Base {
        constructor(props) {
          super(props)
          this.state = { failed: false }
        }
        static getDerivedStateFromError() { return { failed: true } }
        componentDidCatch(error) {
          try {
            if (typeof document !== 'undefined' && document.documentElement && typeof document.documentElement.setAttribute === 'function') {
              const text = String((error && (error.stack || error.message)) || error)
              document.documentElement.setAttribute('data-dsh-workbench-error', text.slice(0, 300))
            }
          } catch (ignored) { /* 边界自身不能再抛错 */ }
        }
        render() { return this.state.failed ? null : this.props.children }
      }
      return function Bounded(props) { return h(Boundary, null, h(Comp, props)) }
    }

    // ---------------------------------------------------------------- 配置归一化
    // 只归一化 UI 可编辑字段；聊天规则的 type / allowReviewCommand、仓库的 labels、
    // features / router / safety 等本页不编辑的字段必须原样带回，否则 config.save 会丢配置。
    function normalizeChatRule(raw) {
      const item = clone(asObject(raw))
      const mode = asString(item.mode)
      item.chatId = asString(item.chatId)
      item.name = asString(item.name)
      item.type = item.type === 'p2p' ? 'p2p' : 'group'
      item.mode = CHAT_MODES.indexOf(mode) >= 0 ? mode : 'mention'
      item.keywords = asArray(item.keywords).map(asString).filter(Boolean)
      item.allowReviewCommand = asBool(item.allowReviewCommand, true)
      return item
    }
    function normalizeRepoRule(raw) {
      const item = clone(asObject(raw))
      item.repo = asString(item.repo).trim()
      item.path = asString(item.path)
      item.onOpened = asBool(item.onOpened, true)
      item.onNewCommits = asBool(item.onNewCommits, true)
      item.skipDraft = asBool(item.skipDraft, true)
      item.labels = asArray(item.labels).map(asString).filter(Boolean)
      return item
    }
    /** state.config → 可编辑草稿：保留全部未知字段，只补齐/修正本页编辑的字段。 */
    function normalizeConfig(raw) {
      const src = clone(asObject(raw))
      if (typeof src.version !== 'number') src.version = 1
      src.channels = asObject(src.channels)
      src.channels.lark = asObject(src.channels.lark)
      src.channels.github = asObject(src.channels.github)
      const lark = src.channels.lark
      lark.enabled = asBool(lark.enabled, true)
      lark.accountId = asString(lark.accountId)
      lark.identity = asString(lark.identity) || 'user'
      lark.pollSeconds = asNumber(lark.pollSeconds, LARK_POLL.fallback)
      lark.watchedChats = asArray(lark.watchedChats).map(normalizeChatRule)
      lark.p2pWhitelist = asArray(lark.p2pWhitelist).map(asString).filter(Boolean)
      const github = src.channels.github
      github.enabled = asBool(github.enabled, true)
      github.accountId = asString(github.accountId)
      github.pollSeconds = asNumber(github.pollSeconds, GITHUB_POLL.fallback)
      github.watchedRepos = asArray(github.watchedRepos).map(normalizeRepoRule)
      src.defaults = asObject(src.defaults)
      if (!Object.prototype.hasOwnProperty.call(src.defaults, 'model')) src.defaults.model = null
      src.defaults.workspace = asString(src.defaults.workspace)
      src.storage = asObject(src.storage)
      for (const key of Object.keys(STORAGE_LIMITS)) {
        src.storage[key] = asNumber(src.storage[key], STORAGE_LIMITS[key].fallback)
      }
      return src
    }
    /** config.defaults.model：DSH 的形态是 { provider, model } | null；兼容旧字符串形态。 */
    function modelShape(raw) {
      return typeof raw === 'string' ? 'string' : 'object'
    }
    function modelToText(raw) {
      if (typeof raw === 'string') return raw
      const model = asObject(raw)
      const provider = asString(model.provider)
      const name = asString(model.model)
      if (provider && name) return provider + '/' + name
      return name || provider || ''
    }
    function composeModel(shape, text) {
      const value = asString(text).trim()
      if (shape !== 'object') return value
      if (!value) return null
      const index = value.indexOf('/')
      if (index < 0) return { provider: '', model: value }
      return { provider: value.slice(0, index).trim(), model: value.slice(index + 1).trim() }
    }
    function repoIsValid(rule) {
      return REPO_PATTERN.test(asString(rule && rule.repo).trim())
    }
    function chatKeywordsText(rule) {
      return asArray(rule && rule.keywords).join(', ')
    }
    function parseKeywords(text) {
      return asString(text)
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
    function firstInvalidRepoIndex(draft) {
      const repos = asArray(((asObject(draft).channels || {}).github || {}).watchedRepos)
      for (let i = 0; i < repos.length; i += 1) {
        if (!repoIsValid(repos[i])) return i
      }
      return -1
    }

    // ---------------------------------------------------------------- 账号视图
    // 账号对象只含身份 / 状态 / 过期时间 / configuredKeys，凭据明文永远不进入客户端状态。
    function accountStatusLabel(status, t) {
      if (status === 'needs_auth') return t('account.status.needsAuth')
      if (status === 'error') return t('account.status.error')
      if (status === 'disabled') return t('account.status.disabled')
      // Host 在 Device Flow 进行中把账号标为 pending_auth。
      if (status === 'pending' || status === 'pending_auth') return t('account.status.pending')
      return t('account.status.ok')
    }
    function accountStatusTone(status) {
      if (status === 'needs_auth') return 'warn'
      if (status === 'error') return 'danger'
      if (status === 'disabled') return 'neutral'
      if (status === 'pending' || status === 'pending_auth') return 'info'
      return 'success'
    }
    function accountProvider(account) {
      return asString((account || {}).provider) === 'github' ? 'github' : 'feishu'
    }
    function accountProviderLabel(account, t) {
      if (accountProvider(account) === 'github') return t('account.provider.github')
      return asString((account || {}).brand) === 'lark' ? t('account.provider.lark') : t('account.provider.feishu')
    }
    function accountMark(account) {
      if (accountProvider(account) === 'github') return 'G'
      return asString((account || {}).brand) === 'lark' ? 'L' : 'F'
    }
    function accountIdentityText(account) {
      const identity = asObject((account || {}).identity)
      return asString(identity.name) || asString(identity.login) || asString(identity.openId) || ''
    }
    function accountSecondaryText(account) {
      const identity = asObject((account || {}).identity)
      return asString(identity.login) || asString(identity.openId) || asString((account || {}).label)
    }
    /** 只展示 id 的首尾各 4 位，避免把完整 openId / accountId 铺在设置页。 */
    function maskId(value) {
      const text = asString(value)
      if (text.length <= 10) return text
      return text.slice(0, 4) + '…' + text.slice(-4)
    }
    function accountExpiryText(account, t) {
      const expiresAt = asString((account || {}).expiresAt)
      if (!expiresAt) return ''
      const ts = Date.parse(expiresAt)
      if (Number.isFinite(ts) && ts <= Date.now()) return t('account.expired')
      return formatTime(expiresAt) || ''
    }
    /** status.<channel>.account 是 AccountView | null；null 表示该渠道还没连接账号。 */
    function statusAccount(channelStatus) {
      const account = asObject(channelStatus).account
      return account && typeof account === 'object' && !Array.isArray(account) ? account : null
    }
    function accountById(accounts, accountId) {
      const id = asString(accountId)
      if (!id) return null
      for (const account of asArray(accounts)) {
        if (asString(account && account.id) === id) return account
      }
      return null
    }
    function accountsForChannel(accounts, channel) {
      const want = channel === 'github' ? 'github' : 'feishu'
      return asArray(accounts).filter((account) => accountProvider(account) === want)
    }
    function accountOptionLabel(account, t) {
      const identity = accountIdentityText(account)
      const head = identity ? accountProviderLabel(account, t) + ' · ' + identity : accountProviderLabel(account, t)
      return head + ' · ' + accountStatusLabel(asString((account || {}).status), t)
    }
    /** 「使用账号」下拉：空值 + 同 provider 账号；已失效的 accountId 单列一项避免静默丢失。 */
    function channelAccountOptions(accounts, current, t) {
      const options = [{ value: '', label: t('account.channel.none') }]
      const list = asArray(accounts)
      for (const account of list) options.push({ value: asString(account.id), label: accountOptionLabel(account, t) })
      const id = asString(current)
      if (id && !accountById(list, id)) options.push({ value: id, label: t('account.channel.missing') })
      return options
    }
    function upsertAccount(accounts, account) {
      const list = asArray(accounts).slice()
      const id = asString((account || {}).id)
      if (!id) return list
      const index = list.findIndex((item) => asString(item && item.id) === id)
      if (index >= 0) list[index] = account
      else list.push(account)
      return list
    }
    /** 毫秒 → m:ss（授权倒计时，只含数字与冒号）。 */
    function formatRemaining(ms) {
      const total = Math.max(0, Math.ceil(asNumber(ms, 0) / 1000))
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      return minutes + ':' + (seconds < 10 ? '0' + seconds : String(seconds))
    }

    // ---------------------------------------------------------------- 文案映射
    function modeLabel(mode, t) {
      if (mode === 'keyword') return t('mode.keyword')
      if (mode === 'all') return t('mode.all')
      if (mode === 'off') return t('mode.off')
      return t('mode.mention')
    }
    function modeOptions(t) {
      return [
        { value: 'mention', label: t('mode.mention') },
        { value: 'keyword', label: t('mode.keyword') },
        { value: 'all', label: t('mode.all') },
        { value: 'off', label: t('mode.off') },
      ]
    }
    function reasonLabel(reason, t) {
      if (reason === 'keyword') return t('reason.keyword')
      if (reason === 'all') return t('reason.all')
      if (reason === 'command') return t('reason.command')
      if (reason === 'pr-link') return t('reason.pr-link')
      if (reason === 'opened') return t('reason.opened')
      if (reason === 'commits') return t('reason.commits')
      if (reason === 'baseline') return t('reason.baseline')
      if (reason === 'mention') return t('reason.mention')
      return asString(reason)
    }
    function sourceLabel(source, t) {
      return source === 'github' ? t('events.source.github') : t('events.source.lark')
    }
    function statusLabel(status, t) {
      if (status === 'baseline') return t('events.status.baseline')
      if (status === 'ignored') return t('events.status.ignored')
      return t('events.status.matched')
    }
    function statusTone(status) {
      if (status === 'baseline') return 'neutral'
      if (status === 'ignored') return 'warn'
      return 'success'
    }
    function yesNo(value, t) {
      return value === true ? t('common.yes') : t('common.no')
    }

    // ---------------------------------------------------------------- Host API
    function createApi() {
      const unwrap = async (endpoint, payload, signal) => {
        const headers = { 'content-type': 'application/json' }
        if (WRITE_ENDPOINTS.has(endpoint)) headers[CLIENT_HEADER] = '1'
        const init = {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify({ endpoint, payload: payload || {} }),
        }
        if (signal) init.signal = signal
        let res
        try {
          res = await fetch(ENDPOINT, init)
        } catch (error) {
          if (error && error.name === 'AbortError') throw error
          throw new Error(shortError(error && error.message) || 'network error')
        }
        if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : 0))
        let json = null
        try {
          json = await res.json()
        } catch (error) {
          throw new Error('invalid JSON from ' + endpoint)
        }
        if (json && json.ok) return json.value
        const message = json && json.error && json.error.message ? String(json.error.message) : ''
        const code = json && json.error && json.error.code ? String(json.error.code) : ''
        const text = shortError(message) || shortError(code) || ('rpc failed: ' + endpoint)
        const failure = new Error(text)
        failure.code = code
        throw failure
      }
      return {
        state: (signal) => unwrap('state', {}, signal),
        larkChats: async (signal) => {
          const value = await unwrap('lark.chats', {}, signal)
          if (Array.isArray(value)) return value
          return asArray(asObject(value).chats)
        },
        saveConfig: (payload) => unwrap('config.save', payload),
        larkCheck: () => unwrap('lark.check', {}),
        githubCheck: () => unwrap('github.check', {}),
        clearHistory: () => unwrap('history.clear', {}),
        accountsList: async (signal) => {
          // Host 返回 { accounts: AccountView[] }；保留对象形态给调用方取 .accounts，
          // 同时兼容裸数组（契约早期写法）。
          const value = await unwrap('accounts.list', {}, signal)
          if (Array.isArray(value)) return { accounts: value }
          return { accounts: asArray(asObject(value).accounts) }
        },
        feishuStart: (payload) => unwrap('accounts.feishu.start', payload),
        feishuPoll: (payload) => unwrap('accounts.feishu.poll', payload),
        githubAdd: (payload) => unwrap('accounts.github.add', payload),
        accountTest: (payload) => unwrap('accounts.test', payload),
        accountRemove: (payload) => unwrap('accounts.remove', payload),
        importGh: () => unwrap('accounts.importGh', {}),
      }
    }

    // ---------------------------------------------------------------- state store
    // 挂载后取一次 state，之后每 8s 轮询；页面隐藏时暂停、切回时立刻刷新；最后一个订阅者退订时停止。
    function createStore(api) {
      const listeners = new Set()
      let current = { data: null, error: null, actionError: null, loading: false, fetchedAt: 0 }
      let timer = null
      let inflight = null
      let refreshPending = false
      let delay = POLL_BASE_MS
      let started = false

      function emit() {
        for (const listener of Array.from(listeners)) {
          try { listener() } catch (error) { /* 单个订阅失败不拖垮其他 */ }
        }
      }
      function patch(next) {
        current = Object.assign({}, current, next)
        emit()
      }
      function isHidden() {
        return typeof document !== 'undefined' && document.visibilityState === 'hidden'
      }
      function clearTimer() {
        if (timer == null) return
        try { clearTimeout(timer) } catch (error) { /* noop */ }
        timer = null
      }
      function abortInflight() {
        if (!inflight) return
        const token = inflight
        inflight = null
        if (token.controller) {
          try { token.controller.abort() } catch (error) { /* noop */ }
        }
      }
      function schedule(ms) {
        clearTimer()
        if (!started || isHidden()) return
        timer = setTimeout(() => {
          timer = null
          void tick()
        }, Math.max(250, ms))
      }
      async function tick() {
        if (!started || inflight) return
        let controller = null
        try { if (typeof AbortController === 'function') controller = new AbortController() } catch (error) { controller = null }
        const token = { controller }
        inflight = token
        if (!current.data) patch({ loading: true })
        try {
          const next = await api.state(controller ? controller.signal : undefined)
          if (!started || inflight !== token) return
          delay = POLL_BASE_MS
          patch({ data: next || null, error: null, loading: false, fetchedAt: Date.now() })
        } catch (error) {
          if (!started || inflight !== token) return
          if (error && error.name === 'AbortError') return
          delay = Math.min(delay * 2, POLL_MAX_MS)
          patch({ error: shortError(error && error.message) || 'state', loading: false })
        } finally {
          if (inflight === token) inflight = null
          if (started) {
            if (refreshPending) {
              refreshPending = false
              void tick()
            } else {
              schedule(delay)
            }
          }
        }
      }
      function onVisibility() {
        if (!started) return
        if (isHidden()) {
          clearTimer()
          abortInflight()
          return
        }
        delay = POLL_BASE_MS
        clearTimer()
        void tick()
      }
      function start() {
        if (started) return
        started = true
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('visibilitychange', onVisibility)
        }
        if (!isHidden()) void tick()
      }
      function stop() {
        started = false
        clearTimer()
        abortInflight()
        if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }
      return {
        subscribe(listener) {
          if (typeof listener !== 'function') return () => {}
          listeners.add(listener)
          if (listeners.size === 1) start()
          return () => {
            listeners.delete(listener)
            if (listeners.size === 0) stop()
          }
        },
        getState() { return current },
        retry() {
          delay = POLL_BASE_MS
          clearTimer()
          if (started && !isHidden()) void tick()
        },
        invalidate() {
          delay = POLL_BASE_MS
          if (!started) return
          if (inflight) { refreshPending = true; return }
          clearTimer()
          void tick()
        },
        setActionError(message) {
          patch({ actionError: shortError(message) || null })
        },
        clearActionError() {
          if (current.actionError) patch({ actionError: null })
        },
        dispose() {
          stop()
          listeners.clear()
        },
      }
    }
    const hasSyncExternalStore = typeof React.useSyncExternalStore === 'function'
    function useStoreState(store) {
      if (hasSyncExternalStore) {
        return React.useSyncExternalStore(store.subscribe, store.getState, store.getState)
      }
      const [, force] = React.useState(0)
      React.useEffect(() => store.subscribe(() => force((n) => n + 1)), [store])
      return store.getState()
    }

    // ---------------------------------------------------------------- actions
    function makeActions(api, store) {
      const run = (fn) => {
        store.clearActionError()
        let promise
        try { promise = Promise.resolve(fn()) } catch (error) { promise = Promise.reject(error) }
        return promise.then(
          (value) => {
            store.invalidate()
            return { ok: true, value }
          },
          (error) => {
            store.setActionError(shortError(error && error.message) || 'action')
            return { ok: false, error }
          },
        )
      }
      return {
        checkLark: () => run(() => api.larkCheck()),
        checkGithub: () => run(() => api.githubCheck()),
        clearHistory: () => run(() => api.clearHistory()),
        saveConfig: (payload) => run(() => api.saveConfig(payload)),
        uploadChats: () => api.larkChats(),
      }
    }

    // ---------------------------------------------------------------- 原子控件（自绘，不依赖 primitives）
    function Btn(props) {
      const variant = props.variant === 'primary'
        ? 'primary'
        : (props.variant === 'ghost' ? 'ghost' : (props.variant === 'danger' ? 'danger' : 'outline'))
      return h('button', {
        type: 'button',
        className: cn('wb-btn', 'wb-btn-' + variant, props.className),
        disabled: props.disabled === true,
        title: props.title || undefined,
        'aria-label': props.ariaLabel || undefined,
        onClick: props.disabled === true ? undefined : props.onClick,
      }, props.children)
    }
    function Tag(props) {
      return h('span', { className: cn('wb-tag', 'wb-tag-' + (props.tone || 'neutral')) }, props.children)
    }
    function Switch(props) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': props.checked === true ? 'true' : 'false',
        className: cn('wb-switch', props.checked === true && 'wb-switch-on'),
        disabled: props.disabled === true,
        title: props.title || undefined,
        'aria-label': props.ariaLabel || undefined,
        onClick: () => {
          if (typeof props.onChange === 'function') props.onChange(props.checked !== true)
        },
      }, h('span', { className: 'wb-switch-dot' }))
    }
    function Field(props) {
      return h('label', { className: cn('wb-field', props.className) },
        props.label ? h('span', { className: 'wb-flabel' }, props.label) : null,
        props.children,
        props.hint ? h('span', { className: 'wb-hint' }, props.hint) : null)
    }
    function TextInput(props) {
      return h('input', {
        type: props.secret === true ? 'password' : 'text',
        className: cn('wb-input', props.invalid === true && 'wb-input-bad'),
        value: props.value == null ? '' : String(props.value),
        placeholder: props.placeholder || '',
        disabled: props.disabled === true,
        autoComplete: props.secret === true ? 'new-password' : 'off',
        spellCheck: false,
        'aria-invalid': props.invalid === true ? 'true' : undefined,
        onChange: (event) => {
          if (typeof props.onChange === 'function') props.onChange(event.target.value)
        },
      })
    }
    function SelectInput(props) {
      return h('select', {
        className: 'wb-select',
        value: props.value == null ? '' : String(props.value),
        disabled: props.disabled === true,
        'aria-label': props.ariaLabel || undefined,
        onChange: (event) => {
          if (typeof props.onChange === 'function') props.onChange(event.target.value)
        },
      }, (props.options || []).map((option) => h('option', { key: option.value, value: option.value }, option.label)))
    }
    function NumberInput(props) {
      const [text, setText] = React.useState(props.value == null ? '' : String(props.value))
      const focused = React.useRef(false)
      React.useEffect(() => {
        if (!focused.current) setText(props.value == null ? '' : String(props.value))
      }, [props.value])
      const commit = () => {
        let next = Math.round(Number(text))
        if (!Number.isFinite(next)) next = asNumber(props.value, props.min != null ? props.min : 0)
        if (props.min != null && next < props.min) next = props.min
        if (props.max != null && next > props.max) next = props.max
        setText(String(next))
        if (typeof props.onChange === 'function' && next !== props.value) props.onChange(next)
      }
      return h('input', {
        type: 'number',
        className: 'wb-input wb-num',
        value: text,
        min: props.min,
        max: props.max,
        step: props.step || 1,
        disabled: props.disabled === true,
        'aria-label': props.ariaLabel || undefined,
        onFocus: () => { focused.current = true },
        onChange: (event) => setText(event.target.value),
        onBlur: () => {
          focused.current = false
          commit()
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
            if (event.target && typeof event.target.blur === 'function') event.target.blur()
          }
        },
      })
    }
    function ErrorBar(props) {
      if (!props.text) return null
      return h('div', { className: 'wb-errorbar', role: 'alert' },
        h('span', { className: 'wb-errorbar-label' }, props.label || ''),
        h('span', { className: 'wb-errorbar-text' }, props.text),
        props.onRetry ? h(Btn, { variant: 'ghost', onClick: props.onRetry }, props.retryLabel || '') : null)
    }
    function Section(props) {
      return h('section', { className: cn('wb-section', props.className) },
        h('div', { className: 'wb-section-head' },
          h('h2', { className: 'wb-section-title' }, props.title),
          props.desc ? h('span', { className: 'wb-section-desc' }, props.desc) : null,
          props.side ? h('div', { className: 'wb-section-side' }, props.side) : null),
        props.children)
    }
    function EmptyState(props) {
      return h('div', { className: 'wb-empty' },
        h('span', { className: 'wb-empty-text' }, props.text),
        props.action ? props.action : null)
    }
    function Kv(props) {
      return h('div', { className: 'wb-kv' },
        h('span', { className: 'wb-kn' }, props.label),
        h('span', { className: cn('wb-kd', props.mono && 'wb-mono') }, props.value))
    }

    // ---------------------------------------------------------------- 主面板
    function ChannelCard(props) {
      return h('div', { className: 'wb-card' },
        h('div', { className: 'wb-card-head' },
          h('span', { className: 'wb-card-title' }, props.title),
          h(Tag, { tone: props.statusTone || 'neutral' }, props.statusLabel)),
        h('div', { className: 'wb-kvs' }, props.rows.map((row) => h(Kv, {
          key: row.label,
          label: row.label,
          value: row.value,
          mono: row.mono === true,
        }))),
        props.note ? h('div', { className: 'wb-carderr' },
          h('span', { className: 'wb-carderr-text' }, props.note)) : null,
        props.lastError ? h('div', { className: 'wb-carderr' },
          h('span', { className: 'wb-carderr-label' }, props.errorLabel),
          h('span', { className: 'wb-carderr-text' }, props.lastError)) : null)
    }
    function CountersCard(props) {
      const stats = asObject(props.stats)
      const today = asObject(stats.today)
      const items = [
        { label: props.t('counters.larkMessages'), value: props.counters.larkMessages },
        { label: props.t('counters.larkMatched'), value: props.counters.larkMatched },
        { label: props.t('counters.githubPulls'), value: props.counters.githubPulls },
        { label: props.t('counters.githubMatched'), value: props.counters.githubMatched },
      ]
      return h('div', { className: 'wb-card wb-card-counters' },
        h('div', { className: 'wb-card-head' },
          h('span', { className: 'wb-card-title' }, props.t('counters.title')),
          h('span', { className: 'wb-card-note' },
            props.t('counters.today', {
              events: asNumber(today.events, 0),
              matched: asNumber(today.matched, 0),
            }))),
        h('div', { className: 'wb-counts' }, items.map((item) => h('div', { key: item.label, className: 'wb-count' },
          h('span', { className: 'wb-count-value' }, String(asNumber(item.value, 0))),
          h('span', { className: 'wb-count-label' }, item.label)))))
    }
    function LarkRules(props) {
      const rules = props.rules
      if (rules.length === 0) {
        return h('div', { className: 'wb-subsection' },
          h('div', { className: 'wb-subhead' }, h('span', { className: 'wb-subtitle' }, props.t('rules.lark'))),
          h(EmptyState, {
            text: props.t('rules.larkEmpty'),
            action: h('span', { className: 'wb-hint' }, props.t('rules.goSettings')),
          }))
      }
      const head = h('tr', null,
        h('th', null, props.t('rules.col.chatId')),
        h('th', null, props.t('rules.col.name')),
        h('th', null, props.t('rules.col.mode')),
        h('th', null, props.t('rules.col.keywords')))
      const body = rules.map((rule, index) => h('tr', { key: (rule.chatId || 'chat') + ':' + index },
        h('td', { className: 'wb-mono wb-nowrap' }, rule.chatId || props.t('common.none')),
        h('td', null, rule.name || props.t('settings.lark.chat.nameUnknown')),
        h('td', null, h('span', { className: 'wb-mode' }, modeLabel(rule.mode, props.t))),
        h('td', null, chatKeywordsText(rule) || props.t('rules.noKeywords'))))
      return h('div', { className: 'wb-subsection' },
        h('div', { className: 'wb-subhead' }, h('span', { className: 'wb-subtitle' }, props.t('rules.lark'))),
        h('div', { className: 'wb-tablewrap' },
          h('table', { className: 'wb-table' }, h('thead', null, head), h('tbody', null, body))))
    }
    function GithubRules(props) {
      const rules = props.rules
      if (rules.length === 0) {
        return h('div', { className: 'wb-subsection' },
          h('div', { className: 'wb-subhead' }, h('span', { className: 'wb-subtitle' }, props.t('rules.github'))),
          h(EmptyState, {
            text: props.t('rules.githubEmpty'),
            action: h('span', { className: 'wb-hint' }, props.t('rules.goSettings')),
          }))
      }
      const head = h('tr', null,
        h('th', null, props.t('rules.github')),
        h('th', null, props.t('settings.github.repo.path')),
        h('th', null, props.t('rules.col.onOpened')),
        h('th', null, props.t('rules.col.onNewCommits')),
        h('th', null, props.t('rules.col.skipDraft')))
      const body = rules.map((rule, index) => h('tr', { key: (rule.repo || 'repo') + ':' + index },
        h('td', { className: 'wb-mono wb-nowrap' }, rule.repo || props.t('common.none')),
        h('td', { className: 'wb-mono wb-nowrap' }, rule.path || props.t('rules.noPath')),
        h('td', null, yesNo(rule.onOpened, props.t)),
        h('td', null, yesNo(rule.onNewCommits, props.t)),
        h('td', null, yesNo(rule.skipDraft, props.t))))
      return h('div', { className: 'wb-subsection' },
        h('div', { className: 'wb-subhead' }, h('span', { className: 'wb-subtitle' }, props.t('rules.github'))),
        h('div', { className: 'wb-tablewrap' },
          h('table', { className: 'wb-table' }, h('thead', null, head), h('tbody', null, body))))
    }
    function EventRow(props) {
      const event = asObject(props.event)
      const url = safeUrl(event.url)
      return h('div', { className: 'wb-event' },
        h('span', { className: 'wb-event-time', title: asString(event.at) }, formatTime(event.at) || props.t('common.unknown')),
        h('div', { className: 'wb-event-body' },
          h('div', { className: 'wb-event-head' },
            h('span', { className: 'wb-event-source' }, sourceLabel(event.source, props.t)),
            h('span', { className: 'wb-event-title' }, asString(event.title) || props.t('common.none')),
            url ? h('a', {
              className: 'wb-link',
              href: url,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, props.t('events.openLink')) : null),
          h('div', { className: 'wb-event-meta' },
            h('span', null, reasonLabel(event.reason, props.t)),
            event.ruleId ? h('span', { className: 'wb-mono' }, asString(event.ruleId)) : null)),
        h(Tag, { tone: statusTone(event.status) }, statusLabel(event.status, props.t)))
    }

    /** 纯展示层：test-render.html 用它做离线静态预览（不做任何网络请求）。 */
    function PanelView(props) {
      const t = props.t
      const data = asObject(props.data)
      const status = asObject(data.status)
      const lark = asObject(status.lark)
      const github = asObject(status.github)
      const counters = asObject(status.counters)
      const config = asObject(data.config)
      const channels = asObject(config.channels)
      const chatRules = asArray(asObject(channels.lark).watchedChats)
      const repoRules = asArray(asObject(channels.github).watchedRepos)
      const events = asArray(data.events)
      const larkAccount = statusAccount(lark)
      const githubAccount = statusAccount(github)
      const larkReady = lark.account !== undefined && larkAccount !== null && asString(larkAccount.status) === 'ok'
      const githubReady = github.account !== undefined && githubAccount !== null && asString(githubAccount.status) === 'ok'
      const running = (lark.enabled === true && larkReady) || (github.enabled === true && githubReady)
      const busy = props.busy || ''
      const canClear = events.length > 0 && busy !== 'clear'
      const disabled = props.disabled === true
      const checkTitle = (enabled, account, ready) => {
        if (enabled !== true) return t('channel.disabledHint')
        if (!account) return t('panel.accountMissing')
        if (!ready) return t('account.needsAuthHint')
        return undefined
      }

      const head = h('div', { className: 'wb-head' },
        h('div', { className: 'wb-headmain' },
          h('h1', { className: 'wb-title' }, t('panel.title')),
          h('div', { className: 'wb-sub' }, t('panel.desc')),
          h('div', { className: 'wb-boundary' }, t('boundary.note'))),
        h('div', { className: 'wb-headside' },
          h('span', { className: cn('wb-pill', running ? 'wb-pill-on' : 'wb-pill-off') },
            h('span', { className: 'wb-dot' }),
            running ? t('status.running') : t('status.paused')),
          h('div', { className: 'wb-actions' },
            h(Btn, {
              variant: 'outline',
              disabled: disabled || busy === 'github' || github.enabled !== true || !githubReady,
              title: checkTitle(github.enabled, githubAccount, githubReady),
              onClick: props.onCheckGithub,
            }, busy === 'github' ? t('action.checkingGithub') : t('action.checkGithub')),
            h(Btn, {
              variant: 'outline',
              disabled: disabled || busy === 'lark' || lark.enabled !== true || !larkReady,
              title: checkTitle(lark.enabled, larkAccount, larkReady),
              onClick: props.onCheckLark,
            }, busy === 'lark' ? t('action.checkingLark') : t('action.checkLark')),
            h(Btn, {
              variant: 'ghost',
              disabled: disabled || busy === 'refresh',
              onClick: props.onRefresh,
            }, busy === 'refresh' ? t('action.refreshing') : t('action.refresh')))))

      const accountRows = (channel, account, extras) => {
        const rows = [
          {
            label: t('panel.account'),
            value: account
              ? accountProviderLabel(account, t) + ' · ' + (accountIdentityText(account) || t('account.identityUnknown'))
              : t('account.notConnected'),
          },
          { label: t('panel.auth'), value: account ? accountStatusLabel(asString(account.status), t) : t('account.channel.none') },
          { label: t('panel.channel'), value: channel.enabled === true ? t('status.enabled') : t('status.disabled') },
          { label: t('account.lastChecked'), value: account ? (formatTime(account.lastCheckedAt) || t('account.never')) : t('common.none'), mono: true },
        ]
        return rows.concat(extras)
      }
      const larkCard = h(ChannelCard, {
        key: 'lark',
        title: t('lark.title'),
        t,
        statusLabel: larkAccount ? accountStatusLabel(asString(larkAccount.status), t) : t('account.notConnected'),
        statusTone: larkAccount ? accountStatusTone(asString(larkAccount.status)) : 'neutral',
        note: !larkAccount ? t('panel.accountMissing') : (asString(larkAccount.status) === 'needs_auth' ? t('account.needsAuthHint') : ''),
        errorLabel: t('lark.lastError'),
        lastError: shortError(lark.lastError),
        rows: accountRows(lark, larkAccount, [
          { label: t('lark.poll'), value: t('common.seconds', { n: asNumber(lark.pollSeconds, 0) }) },
          { label: t('lark.lastPoll'), value: formatTime(lark.lastPollAt) || t('time.never'), mono: true },
          { label: t('lark.watchedChats'), value: String(asNumber(lark.watchedChats, 0)) },
        ]),
      })
      const githubCard = h(ChannelCard, {
        key: 'github',
        title: t('github.title'),
        t,
        statusLabel: githubAccount ? accountStatusLabel(asString(githubAccount.status), t) : t('account.notConnected'),
        statusTone: githubAccount ? accountStatusTone(asString(githubAccount.status)) : 'neutral',
        note: !githubAccount ? t('panel.accountMissing') : (asString(githubAccount.status) === 'needs_auth' ? t('account.needsAuthHint') : ''),
        errorLabel: t('github.lastError'),
        lastError: shortError(github.lastError),
        rows: accountRows(github, githubAccount, [
          { label: t('github.poll'), value: t('common.seconds', { n: asNumber(github.pollSeconds, 0) }) },
          { label: t('github.lastPoll'), value: formatTime(github.lastPollAt) || t('time.never'), mono: true },
          { label: t('github.watchedRepos'), value: String(asNumber(github.watchedRepos, 0)) },
        ]),
      })
      const countersCard = h(CountersCard, { key: 'counters', counters, stats: data.stats, t })

      const rulesSection = h(Section, { key: 'rules', title: t('rules.title') },
        h(LarkRules, { rules: chatRules, t }),
        h(GithubRules, { rules: repoRules, t }))

      const eventsHead = h('div', { className: 'wb-section-side' },
        h('span', { className: 'wb-count-chip' }, t('events.count', { n: events.length })))
      const clearArea = h('div', { className: 'wb-clear' },
        props.clearNotice ? h('span', { className: 'wb-clearhint wb-ok' }, props.clearNotice) : null,
        props.confirmClear
          ? h(React.Fragment, null,
            h('span', { className: 'wb-clearhint' }, t('events.clearConfirm')),
            h(Btn, { variant: 'danger', disabled: busy === 'clear', onClick: props.onConfirmClear },
              busy === 'clear' ? t('action.clearing') : t('action.confirmClear')),
            h(Btn, { variant: 'ghost', disabled: busy === 'clear', onClick: props.onCancelClear }, t('action.cancelClear')))
          : h(Btn, { variant: 'ghost', disabled: !canClear, onClick: props.onClearHistory }, t('action.clearHistory')))
      const eventsSection = h(Section, {
        key: 'events',
        title: t('events.title'),
        side: eventsHead,
        className: 'wb-events-section',
      },
        events.length === 0
          ? h(EmptyState, { text: t('events.empty') })
          : h('div', { className: 'wb-events' }, events.map((event, index) => h(EventRow, {
            key: asString(event && event.id) || String(index),
            event,
            t,
          }))),
        clearArea)

      return h('div', { className: 'wb-root wb-panel' },
        head,
        props.error ? h(ErrorBar, {
          text: props.error,
          label: t('error.load'),
          retryLabel: t('action.retry'),
          onRetry: props.onRetry,
        }) : null,
        props.actionError ? h(ErrorBar, { text: props.actionError, label: t('error.action') }) : null,
        props.loading && !props.data ? h('div', { className: 'wb-loading' }, t('panel.loading')) : null,
        h('div', { className: 'wb-cards' }, larkCard, githubCard, countersCard),
        rulesSection,
        eventsSection)
    }

    function Panel(props) {
      const { store, actions, t } = props
      useLocaleTick()
      const snap = useStoreState(store)
      const [busy, setBusy] = React.useState('')
      const [confirmClear, setConfirmClear] = React.useState(false)
      const [clearNotice, setClearNotice] = React.useState('')

      const run = async (name, fn) => {
        if (busy) return
        setBusy(name)
        try {
          await fn()
        } finally {
          setBusy('')
        }
      }
      return h(PanelView, {
        data: snap.data,
        loading: snap.loading === true,
        error: snap.error || '',
        actionError: snap.actionError || '',
        busy,
        confirmClear,
        clearNotice,
        disabled: props.disabled === true,
        onRefresh: () => { store.retry() },
        onRetry: () => { store.retry() },
        onCheckLark: () => run('lark', () => actions.checkLark()),
        onCheckGithub: () => run('github', () => actions.checkGithub()),
        onClearHistory: () => { setClearNotice(''); setConfirmClear(true) },
        onConfirmClear: () => run('clear', async () => {
          const result = await actions.clearHistory()
          setConfirmClear(false)
          if (result.ok) setClearNotice(t('events.cleared'))
        }),
        onCancelClear: () => setConfirmClear(false),
        t,
      })
    }

    // ---------------------------------------------------------------- 设置页
    function RepoRow(props) {
      const rule = props.rule
      return h('div', { className: 'wb-rule wb-rule-github' },
        h('div', { className: 'wb-rule-fields' },
          h(Field, { label: props.t('settings.github.repo.repo'), className: 'wb-rule-repo' },
            h(TextInput, {
              value: rule.repo,
              invalid: !repoIsValid(rule),
              placeholder: props.t('settings.github.repo.repoPlaceholder'),
              onChange: (value) => props.onField('repo', value),
            })),
          h(Field, { label: props.t('settings.github.repo.path'), className: 'wb-rule-path' },
            h(TextInput, {
              value: rule.path,
              placeholder: props.t('settings.github.repo.pathPlaceholder'),
              onChange: (value) => props.onField('path', value),
            }))),
        h('div', { className: 'wb-rule-switches' },
          h('span', { className: 'wb-inline-switch' },
            h(Switch, { checked: rule.onOpened === true, onChange: (value) => props.onField('onOpened', value) }),
            h('span', null, props.t('settings.github.repo.onOpened'))),
          h('span', { className: 'wb-inline-switch' },
            h(Switch, { checked: rule.onNewCommits === true, onChange: (value) => props.onField('onNewCommits', value) }),
            h('span', null, props.t('settings.github.repo.onNewCommits'))),
          h('span', { className: 'wb-inline-switch' },
            h(Switch, { checked: rule.skipDraft === true, onChange: (value) => props.onField('skipDraft', value) }),
            h('span', null, props.t('settings.github.repo.skipDraft')))),
        h('div', { className: 'wb-rule-actions' },
          !repoIsValid(rule) ? h('span', { className: 'wb-hint wb-hint-bad' }, props.t('settings.github.repo.invalid')) : null,
          h(Btn, { variant: 'ghost', onClick: props.onRemove }, props.t('action.remove'))))
    }
    function ChatRuleRow(props) {
      const rule = props.rule
      return h('div', { className: 'wb-rule wb-rule-lark' },
        h('div', { className: 'wb-rule-main' },
          h('span', { className: 'wb-rule-name', title: props.t('settings.lark.chat.name') }, rule.name || props.t('settings.lark.chat.nameUnknown')),
          h('span', { className: 'wb-rule-id wb-mono', title: props.t('settings.lark.chat.chatId') }, rule.chatId || props.t('common.none'))),
        h('div', { className: 'wb-rule-fields' },
          h(Field, { label: props.t('settings.lark.chat.mode') },
            h(SelectInput, {
              value: rule.mode,
              ariaLabel: props.t('settings.lark.chat.mode'),
              options: modeOptions(props.t),
              onChange: (value) => props.onField('mode', value),
            })),
          h(Field, { label: props.t('settings.lark.chat.keywords') },
            h(TextInput, {
              value: chatKeywordsText(rule),
              placeholder: props.t('settings.lark.chat.keywordsPlaceholder'),
              onChange: (value) => props.onField('keywords', parseKeywords(value)),
            }))),
        h('div', { className: 'wb-rule-actions' },
          h(Btn, { variant: 'ghost', onClick: props.onRemove }, props.t('action.remove'))))
    }
    function ChatPicker(props) {
      if (props.open !== true) return null
      const t = props.t
      const chats = asArray(props.chats)
      const selected = asArray(props.selected)
      const existing = asArray(props.existing)
      const isExisting = (chatId) => existing.indexOf(chatId) >= 0
      const isSelected = (chatId) => selected.indexOf(chatId) >= 0
      let body
      if (props.loading) body = h('div', { className: 'wb-modal-status' }, t('settings.lark.chat.pickerLoading'))
      else if (props.error) body = h('div', { className: 'wb-modal-status wb-hint-bad' }, props.error)
      else if (chats.length === 0) body = h('div', { className: 'wb-modal-status' }, t('settings.lark.chat.pickerEmpty'))
      else {
        body = h('div', { className: 'wb-chatlist' }, chats.map((chat, index) => {
          const chatId = asString(chat && chat.chatId)
          const added = isExisting(chatId)
          const checked = added || isSelected(chatId)
          return h('button', {
            key: chatId || String(index),
            type: 'button',
            className: cn('wb-chatrow', checked && 'wb-chatrow-on'),
            disabled: added || props.busy === true,
            onClick: () => { if (!added) props.onToggle(chatId) },
          },
          h('span', { className: cn('wb-check', checked && 'wb-check-on'), 'aria-hidden': 'true' }),
          h('span', { className: 'wb-chatrow-main' },
            h('span', { className: 'wb-chatrow-name' }, asString(chat && chat.name) || t('settings.lark.chat.nameUnknown')),
            h('span', { className: 'wb-chatrow-id wb-mono' }, chatId)),
          added ? h(Tag, { tone: 'neutral' }, t('settings.lark.chat.alreadyAdded')) : null)
        }))
      }
      return h('div', { className: 'wb-overlay', role: 'presentation' },
        h('div', { className: 'wb-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('settings.lark.chat.pickerTitle') },
          h('div', { className: 'wb-modal-head' },
            h('span', { className: 'wb-modal-title' }, t('settings.lark.chat.pickerTitle')),
            h(Btn, { variant: 'ghost', ariaLabel: t('action.close'), onClick: props.onClose }, t('action.close'))),
          h('div', { className: 'wb-modal-desc' }, t('settings.lark.chat.pickerDesc')),
          h('div', { className: 'wb-modal-body' }, body),
          h('div', { className: 'wb-modal-actions' },
            h('span', { className: 'wb-modal-count' }, t('settings.lark.chat.selectedCount', { n: selected.length })),
            h(Btn, { variant: 'ghost', onClick: props.onClose }, t('action.cancel')),
            h(Btn, {
              variant: 'primary',
              disabled: selected.length === 0 || props.busy === true || props.loading === true,
              onClick: props.onConfirm,
            }, props.busy === true ? t('action.saving') : t('action.addChat')))))
    }

    // ---------------------------------------------------------------- 账号区（v0.2.0）
    function AccountCard(props) {
      const { account, t } = props
      const id = asString(account.id)
      const status = asString(account.status)
      const identity = asObject(account.identity)
      const scopes = asArray(account.scopes).map(asString).filter(Boolean)
      const configured = asArray(account.configuredKeys).map(asString).filter(Boolean)
      const expires = accountExpiryText(account, t)
      const secondary = accountSecondaryText(account)
      const test = props.testResult
      const busy = props.busy || ''
      const testBusy = busy === 'test:' + id
      return h('div', { className: 'wb-account' },
        h('div', { className: 'wb-account-head' },
          h('span', { className: 'wb-account-mark', 'aria-hidden': 'true' }, accountMark(account)),
          h('div', { className: 'wb-account-main' },
            h('span', { className: 'wb-account-title' },
              accountProviderLabel(account, t) + ' · ' + (accountIdentityText(account) || t('account.identityUnknown'))),
            secondary ? h('span', { className: 'wb-account-sub wb-mono', title: t('account.identity') }, maskId(secondary)) : null),
          h(Tag, { tone: accountStatusTone(status) }, accountStatusLabel(status, t))),
        h('div', { className: 'wb-account-meta' },
          scopes.length > 0
            ? h('span', { className: 'wb-chips', title: t('account.scopes') },
              scopes.map((scope) => h('span', { key: scope, className: 'wb-chip' }, scope)))
            : null,
          h('span', { className: 'wb-account-line', title: t('account.configuredKeys') },
            t('account.configuredKeysCount', { n: configured.length }) + (configured.length > 0 ? ' · ' + configured.join(', ') : '')),
          expires
            ? h('span', {
              className: 'wb-account-line',
              title: t('account.refreshExpires') + ': ' + (formatTime(account.refreshExpiresAt) || t('account.never')),
            }, t('account.expires') + ': ' + expires)
            : null,
          h('span', { className: 'wb-account-line' },
            t('account.lastChecked') + ': ' + (formatTime(account.lastCheckedAt) || t('account.never')))),
        status === 'disabled' ? h('div', { className: 'wb-hint' }, t('account.disabledHint')) : null,
        account.lastError
          ? h('div', { className: 'wb-account-err', title: t('account.lastError') }, shortError(account.lastError))
          : null,
        test ? h('div', { className: cn('wb-account-test', test.ok ? 'wb-ok' : 'wb-hint-bad') }, test.text) : null,
        h('div', { className: 'wb-account-actions' },
          status !== 'disabled' && status !== 'pending_auth' && status !== 'pending'
            ? h(Btn, { variant: 'ghost', disabled: busy !== '', onClick: props.onTest }, testBusy ? t('account.testing') : t('account.test'))
            : null,
          h(Btn, { variant: 'ghost', disabled: busy !== '', onClick: props.onReauth }, t('account.reauth')),
          props.confirmRemove
            ? h(React.Fragment, null,
              h('span', { className: 'wb-clearhint' }, t('account.removeConfirm')),
              h(Btn, { variant: 'danger', disabled: busy !== '', onClick: props.onRemove }, t('account.removeYes')),
              h(Btn, { variant: 'ghost', disabled: busy !== '', onClick: props.onCancelRemove }, t('account.removeCancel')))
            : h(Btn, { variant: 'ghost', disabled: busy !== '', onClick: props.onAskRemove }, t('account.remove'))))
    }

    function FeishuForm(props) {
      const t = props.t
      const form = asObject(props.form)
      return h('div', { className: 'wb-form' },
        h('div', { className: 'wb-form-head' },
          h('span', { className: 'wb-subtitle' }, t('account.feishu.title')),
          h(Btn, { variant: 'ghost', disabled: props.busy === true, onClick: props.onClose }, t('action.close'))),
        h('div', { className: 'wb-grid' },
          h(Field, { label: t('account.feishu.appId') },
            h(TextInput, {
              value: form.appId,
              placeholder: t('account.feishu.appIdPlaceholder'),
              onChange: (value) => props.onField('appId', value),
            })),
          h(Field, { label: t('account.feishu.appSecret') },
            h(TextInput, {
              value: form.appSecret,
              secret: true,
              placeholder: t('account.feishu.appSecretPlaceholder'),
              onChange: (value) => props.onField('appSecret', value),
            })),
          h(Field, { label: t('account.feishu.brand') },
            h(SelectInput, {
              value: form.brand,
              ariaLabel: t('account.feishu.brand'),
              options: [
                { value: 'feishu', label: t('account.feishu.brandFeishu') },
                { value: 'lark', label: t('account.feishu.brandLark') },
              ],
              onChange: (value) => props.onField('brand', value),
            })),
          h(Field, { label: t('account.feishu.scope'), hint: t('account.feishu.scopeHint') },
            h(TextInput, {
              value: form.scope,
              placeholder: FEISHU_DEFAULT_SCOPE,
              onChange: (value) => props.onField('scope', value),
            }))),
        form.error ? h('div', { className: 'wb-hint-bad' }, form.error) : null,
        h('div', { className: 'wb-form-actions' },
          h(Btn, { variant: 'primary', disabled: props.busy === true, onClick: props.onStart },
            props.busy === true ? t('account.feishu.starting') : t('account.feishu.start'))))
    }

    function GithubForm(props) {
      const t = props.t
      const form = asObject(props.form)
      return h('div', { className: 'wb-form' },
        h('div', { className: 'wb-form-head' },
          h('span', { className: 'wb-subtitle' }, t('account.github.title')),
          h(Btn, { variant: 'ghost', disabled: props.busy === true, onClick: props.onClose }, t('action.close'))),
        h(Field, { label: t('account.github.token'), hint: t('account.github.tokenHint') },
          h(TextInput, {
            value: form.token,
            secret: true,
            placeholder: t('account.github.tokenPlaceholder'),
            onChange: (value) => props.onField('token', value),
          })),
        form.error ? h('div', { className: 'wb-hint-bad' }, form.error) : null,
        h('div', { className: 'wb-form-actions' },
          h(Btn, { variant: 'primary', disabled: props.busy === true, onClick: props.onConnect },
            props.busy === true ? t('account.github.connecting') : t('account.github.connect'))))
    }

    function FeishuFlowPanel(props) {
      const t = props.t
      const flow = asObject(props.flow)
      const uri = safeUrl(flow.verificationUri)
      const code = asString(flow.userCode)
      const error = asString(flow.error)
      return h('div', { className: 'wb-device' },
        h('div', { className: 'wb-device-head' },
          h('span', { className: 'wb-subtitle' }, t('account.feishu.title')),
          error ? null : h('span', { className: 'wb-device-timer' },
            t('account.feishu.remaining', { time: formatRemaining(flow.remainingMs) }))),
        h('div', { className: 'wb-device-body' },
          h('div', { className: 'wb-device-codewrap' },
            h('span', { className: 'wb-flabel' }, t('account.feishu.userCode')),
            h('span', { className: 'wb-device-code' }, code || t('common.none'))),
          uri ? h('a', {
            className: 'wb-link',
            href: uri,
            target: '_blank',
            rel: 'noreferrer noopener',
          }, t('account.feishu.verifyUri')) : null),
        error ? h('div', { className: 'wb-hint-bad' }, error) : h('div', { className: 'wb-hint' }, t('account.feishu.waiting')),
        h('div', { className: 'wb-form-actions' },
          error
            ? h(React.Fragment, null,
              h(Btn, { variant: 'outline', onClick: props.onRetry }, t('account.feishu.retry')),
              h(Btn, { variant: 'ghost', onClick: props.onCancel }, t('action.close')))
            : h(Btn, { variant: 'ghost', onClick: props.onCancel }, t('account.feishu.cancel'))))
    }

    function AccountsView(props) {
      const t = props.t
      const accounts = asArray(props.accounts)
      const busy = asString(props.busy)
      const flow = asObject(props.flow)
      const tests = asObject(props.tests)
      const handlers = asObject(props.handlers)
      const feishuForm = asObject(props.feishuForm)
      const githubForm = asObject(props.githubForm)
      return h(Section, {
        title: t('settings.accounts.section'),
        desc: t('settings.accounts.desc'),
        className: 'wb-accounts-section',
        side: h('div', { className: 'wb-actions' },
          h(Btn, {
            variant: 'ghost',
            disabled: busy !== '',
            onClick: handlers.onRefreshAccounts,
          }, busy === 'refresh' ? t('settings.accounts.refreshing') : t('settings.accounts.refresh'))),
      },
        props.error
          ? h(ErrorBar, {
            text: props.error,
            label: t('settings.accounts.loadFailed'),
            retryLabel: t('action.retry'),
            onRetry: handlers.onRefreshAccounts,
          })
          : null,
        props.notice && props.notice.text
          ? h('div', { className: cn('wb-notice', props.notice.ok ? 'wb-notice-ok' : 'wb-notice-bad') }, props.notice.text)
          : null,
        h('div', { className: 'wb-actions wb-accounts-actions' },
          h(Btn, { variant: 'outline', disabled: busy !== '', onClick: handlers.onAddFeishu }, t('settings.accounts.addFeishu')),
          h(Btn, { variant: 'outline', disabled: busy !== '', onClick: handlers.onAddGithub }, t('settings.accounts.addGithub')),
          h(Btn, {
            variant: 'ghost',
            disabled: busy !== '',
            onClick: handlers.onImportGh,
          }, busy === 'import' ? t('settings.accounts.importing') : t('settings.accounts.importGh'))),
        flow.visible
          ? h(FeishuFlowPanel, { flow, t, onCancel: handlers.onFlowCancel, onRetry: handlers.onFlowRetry })
          : null,
        feishuForm.open
          ? h(FeishuForm, {
            form: feishuForm,
            t,
            busy: busy === 'feishu',
            onField: handlers.onFeishuField,
            onStart: handlers.onFeishuStart,
            onClose: handlers.onCloseAccountsForm,
          })
          : null,
        githubForm.open
          ? h(GithubForm, {
            form: githubForm,
            t,
            busy: busy === 'github',
            onField: handlers.onGithubField,
            onConnect: handlers.onGithubConnect,
            onClose: handlers.onCloseAccountsForm,
          })
          : null,
        accounts.length === 0
          ? h(EmptyState, { text: t('settings.accounts.empty') })
          : h('div', { className: 'wb-account-list' }, accounts.map((account) => h(AccountCard, {
            key: asString(account.id),
            account,
            t,
            busy,
            testResult: tests[asString(account.id)] || null,
            confirmRemove: asString(props.confirmRemoveId) === asString(account.id),
            onTest: () => handlers.onTestAccount(account),
            onReauth: () => handlers.onReauthAccount(account),
            onAskRemove: () => handlers.onAskRemoveAccount(account),
            onRemove: () => handlers.onRemoveAccount(account),
            onCancelRemove: handlers.onCancelRemoveAccount,
          }))))
    }

    function SafetySection(props) {
      const t = props.t
      const items = [t('settings.safety.draft'), t('settings.safety.readonly'), t('settings.safety.whitelist'), t('settings.safety.noOutbound')]
      return h(Section, { title: t('settings.safety.title'), className: 'wb-safety' },
        h('ul', { className: 'wb-safety-list' }, items.map((text, index) => h('li', { key: 'safety-' + index }, text))))
    }

    /** 纯展示层：设置页（草稿由容器持有）。 */
    function SettingsView(props) {
      const t = props.t
      const draft = props.draft
      if (!draft) {
        return h('div', { className: 'wb-root wb-settings' },
          h('div', { className: 'wb-head' },
            h('div', { className: 'wb-headmain' },
              h('h1', { className: 'wb-title' }, t('settings.title')),
              h('div', { className: 'wb-sub' }, t('settings.desc')),
              h('div', { className: 'wb-boundary' }, t('boundary.note')))),
          props.loading
            ? h('div', { className: 'wb-loading' }, t('settings.loading'))
            : h(EmptyState, { text: t('settings.empty') }),
          props.error ? h(ErrorBar, { text: props.error, label: t('error.load'), retryLabel: t('action.retry'), onRetry: props.onRetry }) : null)
      }
      const channels = asObject(draft.channels)
      const lark = asObject(channels.lark)
      const github = asObject(channels.github)
      const defaults = asObject(draft.defaults)
      const storage = asObject(draft.storage)
      const chatRules = asArray(lark.watchedChats)
      const repoRules = asArray(github.watchedRepos)
      const handlers = asObject(props.handlers)
      const picker = asObject(props.picker)
      const accounts = asArray(props.accounts)
      const larkAccounts = accountsForChannel(accounts, 'lark')
      const githubAccounts = accountsForChannel(accounts, 'github')

      const head = h('div', { className: 'wb-head' },
        h('div', { className: 'wb-headmain' },
          h('h1', { className: 'wb-title' }, t('settings.title')),
          h('div', { className: 'wb-sub' }, t('settings.desc')),
          h('div', { className: 'wb-boundary' }, t('boundary.note'))),
        h('div', { className: 'wb-headside' },
          props.dirty ? h('span', { className: 'wb-dirty' }, t('settings.draftHint')) : null,
          h('div', { className: 'wb-actions' },
            h(Btn, {
              variant: 'ghost',
              disabled: props.saving === true || props.dirty !== true,
              onClick: handlers.onDiscard,
            }, t('action.discard')),
            h(Btn, {
              variant: 'primary',
              disabled: props.saving === true || props.dirty !== true,
              onClick: handlers.onSave,
            }, props.saving === true ? t('action.saving') : t('action.save'))),
          props.notice && props.notice.text
            ? h('div', { className: cn('wb-notice', props.notice.ok ? 'wb-notice-ok' : 'wb-notice-bad') }, props.notice.text)
            : null))

      const accountsSection = h(AccountsView, {
        key: 'accounts',
        t,
        accounts,
        busy: props.accountBusy || '',
        error: props.accountsError || '',
        notice: props.accountsNotice || null,
        flow: props.flow,
        feishuForm: props.feishuForm,
        githubForm: props.githubForm,
        tests: props.accountTests,
        confirmRemoveId: props.confirmRemoveId,
        handlers,
      })

      const larkSection = h(Section, {
        key: 'lark',
        title: t('settings.lark.section'),
        side: h('span', { className: 'wb-inline-switch' },
          h(Switch, {
            checked: lark.enabled === true,
            ariaLabel: t('settings.lark.enabled'),
            onChange: (value) => handlers.onToggleLark(value),
          }),
          h('span', null, t('settings.lark.enabled'))),
      },
        h('div', { className: 'wb-grid' },
          h(Field, {
            label: t('account.channel.label'),
            hint: larkAccounts.length === 0 ? t('account.channel.emptyHint') : undefined,
          }, h(SelectInput, {
            value: asString(lark.accountId),
            ariaLabel: t('account.channel.label'),
            options: channelAccountOptions(larkAccounts, asString(lark.accountId), t),
            onChange: (value) => handlers.onChannelAccount('lark', value),
          })),
          h(Field, { label: t('settings.lark.pollSeconds'), hint: t('settings.lark.pollHint', { min: LARK_POLL.min, max: LARK_POLL.max }) },
            h(NumberInput, {
              value: lark.pollSeconds,
              min: LARK_POLL.min,
              max: LARK_POLL.max,
              step: LARK_POLL.step,
              ariaLabel: t('settings.lark.pollSeconds'),
              onChange: (value) => handlers.onLarkPoll(value),
            }))),
        h('div', { className: 'wb-subhead' },
          h('span', { className: 'wb-subtitle' }, t('settings.lark.chats')),
          h(Btn, { variant: 'outline', onClick: handlers.onOpenPicker }, t('action.addChat'))),
        chatRules.length === 0
          ? h(EmptyState, { text: t('settings.lark.chatsEmpty') })
          : h('div', { className: 'wb-rules' }, chatRules.map((rule, index) => h(ChatRuleRow, {
            key: (rule.chatId || 'chat') + ':' + index,
            rule,
            t,
            onField: (field, value) => handlers.onChatField(index, field, value),
            onRemove: () => handlers.onRemoveChat(index),
          }))))

      const githubSection = h(Section, {
        key: 'github',
        title: t('settings.github.section'),
        side: h('span', { className: 'wb-inline-switch' },
          h(Switch, {
            checked: github.enabled === true,
            ariaLabel: t('settings.github.enabled'),
            onChange: (value) => handlers.onToggleGithub(value),
          }),
          h('span', null, t('settings.github.enabled'))),
      },
        h('div', { className: 'wb-grid' },
          h(Field, {
            label: t('account.channel.label'),
            hint: githubAccounts.length === 0 ? t('account.channel.emptyHint') : undefined,
          }, h(SelectInput, {
            value: asString(github.accountId),
            ariaLabel: t('account.channel.label'),
            options: channelAccountOptions(githubAccounts, asString(github.accountId), t),
            onChange: (value) => handlers.onChannelAccount('github', value),
          })),
          h(Field, { label: t('settings.github.pollSeconds'), hint: t('settings.github.pollHint', { min: GITHUB_POLL.min, max: GITHUB_POLL.max }) },
            h(NumberInput, {
              value: github.pollSeconds,
              min: GITHUB_POLL.min,
              max: GITHUB_POLL.max,
              step: GITHUB_POLL.step,
              ariaLabel: t('settings.github.pollSeconds'),
              onChange: (value) => handlers.onGithubPoll(value),
            }))),
        h('div', { className: 'wb-subhead' },
          h('span', { className: 'wb-subtitle' }, t('settings.github.repos')),
          h(Btn, { variant: 'outline', onClick: handlers.onAddRepo }, t('action.addRepo'))),
        repoRules.length === 0
          ? h(EmptyState, { text: t('settings.github.reposEmpty') })
          : h('div', { className: 'wb-rules' }, repoRules.map((rule, index) => h(RepoRow, {
            key: 'repo:' + index,
            rule,
            t,
            onField: (field, value) => handlers.onRepoField(index, field, value),
            onRemove: () => handlers.onRemoveRepo(index),
          }))))

      const defaultsSection = h(Section, { key: 'defaults', title: t('settings.defaults.section') },
        h('div', { className: 'wb-grid' },
          h(Field, {
            label: t('settings.defaults.model'),
            hint: t('settings.defaults.modelHint'),
          }, h(TextInput, {
            value: props.modelText,
            placeholder: t('settings.defaults.modelPlaceholder'),
            onChange: handlers.onModelText,
          })),
          h(Field, { label: t('settings.defaults.workspace') },
            h(TextInput, {
              value: defaults.workspace,
              placeholder: t('settings.defaults.workspacePlaceholder'),
              onChange: handlers.onWorkspace,
            }))))

      const storageSection = h(Section, {
        key: 'storage',
        title: t('settings.storage.section'),
        desc: t('settings.storage.retentionHint'),
      },
        h('div', { className: 'wb-grid' },
          h(Field, { label: t('settings.storage.contentRetentionHours') },
            h(NumberInput, {
              value: storage.contentRetentionHours,
              min: STORAGE_LIMITS.contentRetentionHours.min,
              max: STORAGE_LIMITS.contentRetentionHours.max,
              step: STORAGE_LIMITS.contentRetentionHours.step,
              ariaLabel: t('settings.storage.contentRetentionHours'),
              onChange: (value) => handlers.onStorage('contentRetentionHours', value),
            })),
          h(Field, { label: t('settings.storage.historyLimit') },
            h(NumberInput, {
              value: storage.historyLimit,
              min: STORAGE_LIMITS.historyLimit.min,
              max: STORAGE_LIMITS.historyLimit.max,
              step: STORAGE_LIMITS.historyLimit.step,
              ariaLabel: t('settings.storage.historyLimit'),
              onChange: (value) => handlers.onStorage('historyLimit', value),
            })),
          h(Field, { label: t('settings.storage.logRetentionDays') },
            h(NumberInput, {
              value: storage.logRetentionDays,
              min: STORAGE_LIMITS.logRetentionDays.min,
              max: STORAGE_LIMITS.logRetentionDays.max,
              step: STORAGE_LIMITS.logRetentionDays.step,
              ariaLabel: t('settings.storage.logRetentionDays'),
              onChange: (value) => handlers.onStorage('logRetentionDays', value),
            }))))

      return h('div', { className: 'wb-root wb-settings' },
        head,
        props.error ? h(ErrorBar, { text: props.error, label: t('error.load'), retryLabel: t('action.retry'), onRetry: props.onRetry }) : null,
        props.actionError ? h(ErrorBar, { text: props.actionError, label: t('error.action') }) : null,
        accountsSection,
        larkSection,
        githubSection,
        defaultsSection,
        storageSection,
        h(SafetySection, { key: 'safety', t }),
        h(ChatPicker, {
          open: picker.open === true,
          loading: picker.loading === true,
          error: picker.error || '',
          chats: picker.chats,
          selected: picker.selected,
          existing: picker.existing,
          busy: picker.busy === true,
          t,
          onToggle: handlers.onPickerToggle,
          onConfirm: handlers.onPickerConfirm,
          onClose: handlers.onPickerClose,
        }))
    }

    function SettingsSection(props) {
      const { store, api, actions, t } = props
      useLocaleTick()
      const snap = useStoreState(store)
      const data = snap.data
      const [draft, setDraft] = React.useState(null)
      const [modelText, setModelText] = React.useState('')
      const [dirty, setDirty] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [picker, setPicker] = React.useState({ open: false, loading: false, error: '', chats: [], selected: [], existing: [], busy: false })
      const [accounts, setAccounts] = React.useState([])
      const [accountsError, setAccountsError] = React.useState('')
      const [accountBusy, setAccountBusy] = React.useState('')
      const [accountsNotice, setAccountsNotice] = React.useState(null)
      const [accountTests, setAccountTests] = React.useState({})
      const [confirmRemoveId, setConfirmRemoveId] = React.useState('')
      const [feishuForm, setFeishuForm] = React.useState({ open: false, appId: '', appSecret: '', brand: 'feishu', scope: FEISHU_DEFAULT_SCOPE, error: '' })
      const [githubForm, setGithubForm] = React.useState({ open: false, token: '', error: '' })
      const [flow, setFlow] = React.useState({ visible: false, accountId: '', userCode: '', verificationUri: '', expiresAt: 0, remainingMs: 0, error: '' })
      const dirtyRef = React.useRef(false)
      const shapeRef = React.useRef('object')
      const modelTextRef = React.useRef('')

      const hostConfig = data ? data.config : null
      React.useEffect(() => {
        if (!hostConfig) return
        if (dirtyRef.current) return
        const config = asObject(hostConfig)
        const defaults = asObject(config.defaults)
        shapeRef.current = modelShape(defaults.model)
        const text = modelToText(defaults.model)
        modelTextRef.current = text
        setDraft(normalizeConfig(config))
        setModelText(text)
        setDirty(false)
      }, [hostConfig])

      const hostAccounts = data ? data.accounts : null
      React.useEffect(() => {
        if (!Array.isArray(hostAccounts)) return
        setAccounts(hostAccounts)
      }, [hostAccounts])

      React.useEffect(() => {
        let alive = true
        Promise.resolve(api.accountsList()).then((list) => {
          if (alive) {
            setAccounts(asArray(list && list.accounts))
            setAccountsError('')
          }
        }, (error) => {
          if (alive) setAccountsError(shortError(error && error.message) || t('settings.accounts.loadFailed'))
        })
        return () => { alive = false }
      }, [])

      // 飞书 Device Flow：页面在时每 2s 拉一次；ok/error/超时即停。页面关闭后 Host 继续，重开用 accounts.list 续看。
      React.useEffect(() => {
        if (flow.visible !== true || flow.error || !flow.accountId) return undefined
        let cancelled = false
        const finish = (patchFlow) => {
          cancelled = true
          clearInterval(timer)
          setFlow((prev) => Object.assign({}, prev, patchFlow))
        }
        const timer = setInterval(() => {
          if (cancelled) return
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          Promise.resolve(api.feishuPoll({ accountId: flow.accountId })).then((value) => {
            if (cancelled) return
            const status = asString(value && value.status)
            if (status === 'ok') {
              cancelled = true
              clearInterval(timer)
              const account = value && value.account ? value.account : null
              if (account) setAccounts((prev) => upsertAccount(prev, account))
              setFlow({ visible: false, accountId: '', userCode: '', verificationUri: '', expiresAt: 0, remainingMs: 0, error: '' })
              setFeishuForm({ open: false, appId: '', appSecret: '', brand: 'feishu', scope: FEISHU_DEFAULT_SCOPE, error: '' })
              setAccountsNotice({ ok: true, text: t('account.feishu.done') })
              store.invalidate()
            } else if (status === 'error') {
              finish({ error: shortError(value && value.error) || t('account.feishu.failed') })
            }
          }, (error) => {
            if (cancelled) return
            finish({ error: shortError(error && error.message) || t('account.feishu.failed') })
          })
        }, 2000)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [flow.visible, flow.accountId, flow.error])

      React.useEffect(() => {
        if (flow.visible !== true || flow.error || !flow.expiresAt) return undefined
        const timer = setInterval(() => {
          const remaining = flow.expiresAt - Date.now()
          if (remaining <= 0) {
            clearInterval(timer)
            setFlow((prev) => Object.assign({}, prev, { remainingMs: 0, error: t('account.feishu.expired') }))
            return
          }
          setFlow((prev) => Object.assign({}, prev, { remainingMs: remaining }))
        }, 1000)
        return () => clearInterval(timer)
      }, [flow.visible, flow.expiresAt, flow.error])

      const markDirty = () => {
        dirtyRef.current = true
        setDirty(true)
      }
      const patch = (mutator) => {
        setDraft((prev) => {
          if (!prev) return prev
          const next = clone(prev)
          try { mutator(next) } catch (error) { /* 保持原草稿 */ }
          return next
        })
        markDirty()
      }
      const existingChatIds = () => {
        const channels = asObject(asObject(draft).channels)
        return asArray(asObject(channels.lark).watchedChats).map((rule) => asString(rule && rule.chatId))
      }

      const handlers = {
        onToggleLark: (value) => patch((next) => { next.channels.lark.enabled = value === true }),
        onLarkPoll: (value) => patch((next) => { next.channels.lark.pollSeconds = value }),
        onToggleGithub: (value) => patch((next) => { next.channels.github.enabled = value === true }),
        onGithubPoll: (value) => patch((next) => { next.channels.github.pollSeconds = value }),
        onChatField: (index, field, value) => patch((next) => {
          const rule = next.channels.lark.watchedChats[index]
          if (!rule) return
          if (field === 'mode') rule.mode = CHAT_MODES.indexOf(value) >= 0 ? value : 'mention'
          else if (field === 'keywords') rule.keywords = asArray(value)
          else rule[field] = value
        }),
        onRemoveChat: (index) => patch((next) => { next.channels.lark.watchedChats.splice(index, 1) }),
        onAddRepo: () => patch((next) => {
          next.channels.github.watchedRepos.push({ repo: '', path: '', onOpened: true, onNewCommits: true, skipDraft: true, labels: [] })
        }),
        onRemoveRepo: (index) => patch((next) => { next.channels.github.watchedRepos.splice(index, 1) }),
        onRepoField: (index, field, value) => patch((next) => {
          const rule = next.channels.github.watchedRepos[index]
          if (!rule) return
          if (field === 'repo' || field === 'path') rule[field] = asString(value)
          else rule[field] = value === true
        }),
        onModelText: (value) => {
          modelTextRef.current = asString(value)
          setModelText(modelTextRef.current)
          markDirty()
        },
        onWorkspace: (value) => patch((next) => { next.defaults.workspace = asString(value) }),
        onStorage: (key, value) => patch((next) => { next.storage[key] = value }),
        onOpenPicker: async () => {
          setPicker({ open: true, loading: true, error: '', chats: [], selected: [], existing: existingChatIds(), busy: false })
          try {
            const result = await api.larkChats()
            setPicker((prev) => Object.assign({}, prev, {
              loading: false,
              chats: Array.isArray(result) ? result : asArray(result && result.chats),
            }))
          } catch (error) {
            setPicker((prev) => Object.assign({}, prev, {
              loading: false,
              error: shortError(error && error.message) || t('settings.lark.chat.pickerFailed'),
            }))
          }
        },
        onPickerToggle: (chatId) => {
          setPicker((prev) => {
            const selected = asArray(prev.selected).slice()
            const index = selected.indexOf(chatId)
            if (index >= 0) selected.splice(index, 1)
            else selected.push(chatId)
            return Object.assign({}, prev, { selected })
          })
        },
        onPickerConfirm: () => {
          const picked = asArray(picker.selected)
          if (picked.length === 0) return
          const chats = asArray(picker.chats)
          patch((next) => {
            const list = next.channels.lark.watchedChats
            const seen = list.map((rule) => asString(rule.chatId))
            for (const chatId of picked) {
              if (seen.indexOf(chatId) >= 0) continue
              const chat = chats.find((item) => asString(item && item.chatId) === chatId) || {}
              list.push({
                chatId,
                name: asString(chat.name),
                type: asString(chat.type) === 'p2p' ? 'p2p' : 'group',
                mode: 'mention',
                keywords: [],
                allowReviewCommand: true,
              })
            }
          })
          setPicker({ open: false, loading: false, error: '', chats: [], selected: [], existing: [], busy: false })
          setNotice({ ok: true, text: t('settings.lark.chat.added', { n: picked.length }) })
        },
        onPickerClose: () => {
          if (picker.busy) return
          setPicker({ open: false, loading: false, error: '', chats: [], selected: [], existing: [], busy: false })
        },
        onDiscard: () => {
          if (!hostConfig) return
          const config = asObject(hostConfig)
          const defaults = asObject(config.defaults)
          shapeRef.current = modelShape(defaults.model)
          const text = modelToText(defaults.model)
          modelTextRef.current = text
          setModelText(text)
          setDraft(normalizeConfig(config))
          dirtyRef.current = false
          setDirty(false)
          setNotice(null)
        },
        onSave: async () => {
          if (!draft || saving) return
          const invalid = firstInvalidRepoIndex(draft)
          if (invalid >= 0) {
            setNotice({ ok: false, text: t('settings.github.repo.invalid') })
            return
          }
          const modelValue = asString(modelTextRef.current).trim()
          if (modelValue && !/^[^/\s]+\/[^/\s]+$/.test(modelValue)) {
            setNotice({ ok: false, text: t('settings.defaults.modelInvalid') })
            return
          }
          const payload = clone(draft)
          payload.defaults = asObject(payload.defaults)
          payload.defaults.model = composeModel(shapeRef.current, modelTextRef.current)
          setSaving(true)
          const result = await actions.saveConfig({ config: payload })
          setSaving(false)
          if (result.ok) {
            const raw = result.value && result.value.config ? result.value.config : payload
            const config = asObject(raw)
            const defaults = asObject(config.defaults)
            shapeRef.current = modelShape(defaults.model)
            const text = modelToText(defaults.model)
            modelTextRef.current = text
            setModelText(text)
            setDraft(normalizeConfig(config))
            dirtyRef.current = false
            setDirty(false)
            setNotice({ ok: true, text: t('settings.saved') })
          } else {
            const code = result.error && result.error.code ? String(result.error.code) : ''
            const message = result.error && result.error.message ? shortError(result.error.message) : ''
            const fallback = code === 'config/invalid' ? t('error.configInvalid') : t('settings.saveFailed')
            setNotice({ ok: false, text: message || fallback })
          }
        },
        onChannelAccount: (channel, value) => patch((next) => {
          const target = channel === 'github' ? next.channels.github : next.channels.lark
          target.accountId = asString(value)
        }),
        onRefreshAccounts: async () => {
          if (accountBusy) return
          setAccountBusy('refresh')
          setAccountsError('')
          try {
            const list = await api.accountsList()
            setAccounts(asArray(list && list.accounts))
          } catch (error) {
            setAccountsError(shortError(error && error.message) || t('settings.accounts.loadFailed'))
          } finally {
            setAccountBusy('')
          }
        },
        onAddFeishu: () => {
          setGithubForm({ open: false, token: '', error: '' })
          setFeishuForm({ open: true, appId: '', appSecret: '', brand: 'feishu', scope: FEISHU_DEFAULT_SCOPE, error: '' })
          setAccountsNotice(null)
        },
        onAddGithub: () => {
          setFeishuForm({ open: false, appId: '', appSecret: '', brand: 'feishu', scope: FEISHU_DEFAULT_SCOPE, error: '' })
          setGithubForm({ open: true, token: '', error: '' })
          setAccountsNotice(null)
        },
        onCloseAccountsForm: () => {
          setFeishuForm({ open: false, appId: '', appSecret: '', brand: 'feishu', scope: FEISHU_DEFAULT_SCOPE, error: '' })
          setGithubForm({ open: false, token: '', error: '' })
        },
        onFeishuField: (field, value) => {
          setFeishuForm((prev) => Object.assign({}, prev, { [field]: asString(value), error: '' }))
        },
        onFeishuStart: async () => {
          if (accountBusy) return
          const appId = asString(feishuForm.appId).trim()
          const appSecret = asString(feishuForm.appSecret)
          if (!appId || !appSecret) {
            setFeishuForm((prev) => Object.assign({}, prev, { error: t('account.feishu.missingFields') }))
            return
          }
          setAccountBusy('feishu')
          setFeishuForm((prev) => Object.assign({}, prev, { error: '' }))
          try {
            const value = await api.feishuStart({
              appId,
              appSecret,
              brand: asString(feishuForm.brand) === 'lark' ? 'lark' : 'feishu',
              scope: asString(feishuForm.scope).trim() || FEISHU_DEFAULT_SCOPE,
            })
            const expiresIn = Math.max(30, asNumber(value && value.expiresIn, 240))
            setFlow({
              visible: true,
              accountId: asString(value && value.accountId),
              userCode: asString(value && value.userCode),
              verificationUri: asString(value && value.verificationUri),
              expiresAt: Date.now() + expiresIn * 1000,
              remainingMs: expiresIn * 1000,
              error: '',
            })
            // appSecret 提交后立刻从本地状态清空，避免回显/残留。
            setFeishuForm({ open: false, appId: '', appSecret: '', brand: asString(feishuForm.brand), scope: FEISHU_DEFAULT_SCOPE, error: '' })
            if (asString(value && value.accountId)) {
              try {
                const list = await api.accountsList()
                setAccounts(asArray(list && list.accounts))
              } catch (ignored) { /* 账号列表稍后由 state 轮询补齐 */ }
            }
          } catch (error) {
            setFeishuForm((prev) => Object.assign({}, prev, {
              appSecret: '',
              error: shortError(error && error.message) || t('account.feishu.failed'),
            }))
          } finally {
            setAccountBusy('')
          }
        },
        onFlowCancel: () => {
          setFlow({ visible: false, accountId: '', userCode: '', verificationUri: '', expiresAt: 0, remainingMs: 0, error: '' })
          Promise.resolve(api.accountsList()).then((list) => setAccounts(asArray(list && list.accounts)), () => {})
        },
        onFlowRetry: () => {
          setFlow({ visible: false, accountId: '', userCode: '', verificationUri: '', expiresAt: 0, remainingMs: 0, error: '' })
          setFeishuForm((prev) => Object.assign({}, prev, { open: true, appSecret: '', error: '' }))
        },
        onGithubField: (value) => {
          setGithubForm((prev) => Object.assign({}, prev, { token: asString(value), error: '' }))
        },
        onGithubConnect: async () => {
          if (accountBusy) return
          const token = asString(githubForm.token).trim()
          if (!token) {
            setGithubForm((prev) => Object.assign({}, prev, { error: t('account.github.missingToken') }))
            return
          }
          setAccountBusy('github')
          setGithubForm((prev) => Object.assign({}, prev, { error: '' }))
          try {
            const value = await api.githubAdd({ token })
            const account = value && value.account ? value.account : null
            if (account) setAccounts((prev) => upsertAccount(prev, account))
            setGithubForm({ open: false, token: '', error: '' })
            setAccountsNotice({ ok: true, text: t('account.github.added') })
            store.invalidate()
            try {
              const list = await api.accountsList()
              setAccounts(asArray(list && list.accounts))
            } catch (ignored) { /* 稍后由 state 轮询补齐 */ }
          } catch (error) {
            setGithubForm((prev) => Object.assign({}, prev, {
              token: '',
              error: shortError(error && error.message) || t('account.github.failed'),
            }))
          } finally {
            setAccountBusy('')
          }
        },
        onImportGh: async () => {
          if (accountBusy) return
          setAccountBusy('import')
          setAccountsNotice(null)
          try {
            const value = await api.importGh()
            const account = value && value.account ? value.account : null
            if (account) setAccounts((prev) => upsertAccount(prev, account))
            setAccountsNotice({ ok: true, text: t('account.github.imported') })
            store.invalidate()
          } catch (error) {
            setAccountsNotice({
              ok: false,
              text: t('account.github.importFailed') + ': ' + (shortError(error && error.message) || t('error.action')),
            })
          } finally {
            setAccountBusy('')
          }
        },
        onTestAccount: async (account) => {
          const accountId = asString(account && account.id)
          if (!accountId || accountBusy) return
          setAccountBusy('test:' + accountId)
          try {
            const value = await api.accountTest({ accountId })
            const status = asString(value && value.status)
            const ok = value && value.ok !== false && status !== 'needs_auth' && status !== 'error'
            const message = shortError(value && value.error)
            setAccountTests((prev) => Object.assign({}, prev, {
              [accountId]: { ok, text: ok ? t('account.testOk') : (message || t('account.testFailed')) },
            }))
            if (status) {
              setAccounts((prev) => prev.map((item) => (asString(item.id) === accountId
                ? Object.assign({}, item, { status, identity: (value && value.identity) || item.identity })
                : item)))
            }
            store.invalidate()
          } catch (error) {
            setAccountTests((prev) => Object.assign({}, prev, {
              [accountId]: { ok: false, text: shortError(error && error.message) || t('account.testFailed') },
            }))
          } finally {
            setAccountBusy('')
          }
        },
        onAskRemoveAccount: (account) => {
          setConfirmRemoveId(asString(account && account.id))
        },
        onCancelRemoveAccount: () => { setConfirmRemoveId('') },
        onRemoveAccount: async (account) => {
          const accountId = asString(account && account.id)
          if (!accountId || accountBusy) return
          setAccountBusy('remove:' + accountId)
          try {
            await api.accountRemove({ accountId })
            setAccounts((prev) => prev.filter((item) => asString(item.id) !== accountId))
            setConfirmRemoveId('')
            setAccountsNotice({ ok: true, text: t('settings.accounts.removed') })
            store.invalidate()
          } catch (error) {
            setAccountsNotice({ ok: false, text: shortError(error && error.message) || t('error.action') })
          } finally {
            setAccountBusy('')
          }
        },
        onReauthAccount: (account) => {
          setAccountsNotice(null)
          if (accountProvider(account) === 'github') {
            setFeishuForm({ open: false, appId: '', appSecret: '', brand: 'feishu', scope: FEISHU_DEFAULT_SCOPE, error: '' })
            setGithubForm({ open: true, token: '', error: '' })
          } else {
            setGithubForm({ open: false, token: '', error: '' })
            setFeishuForm({
              open: true,
              // Host 的 AccountView 会带 appId（不含密文）；重新授权时预填，减少重复输入。
              appId: asString(account && account.appId),
              appSecret: '',
              brand: asString(account && account.brand) === 'lark' ? 'lark' : 'feishu',
              scope: FEISHU_DEFAULT_SCOPE,
              error: '',
            })
          }
        },
      }

      return h(SettingsView, {
        draft,
        modelText,
        dirty,
        saving,
        notice,
        picker,
        accounts,
        accountsError,
        accountBusy,
        accountsNotice,
        accountTests,
        confirmRemoveId,
        feishuForm,
        githubForm,
        flow,
        loading: snap.loading === true,
        error: snap.error || '',
        actionError: snap.actionError || '',
        t,
        handlers,
        onRetry: () => { store.retry() },
      })
    }

    // ---------------------------------------------------------------- 侧栏图标
    function PanelIcon(props) {
      // Host 的 panellist 行会传 { size, active }：窄栏 18px、宽栏 16px。
      const size = props && (props.size === 16 || props.size === 18) ? props.size : 18
      return h('span', { className: 'wb-icon', 'aria-hidden': 'true' },
        h('svg', {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          focusable: 'false',
        },
          h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 2 }),
          h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 2 }),
          h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 2 }),
          h('path', { d: 'M14 17.5h7M17.5 14v7' })))
    }

    // ---------------------------------------------------------------- 样式
    const CSS = `
.wb-root{display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary,#191f28);font-family:inherit}
.wb-panel{padding:16px 24px 24px;max-width:960px;margin:0 auto;width:100%}
.wb-settings{padding:4px 0 8px;max-width:760px;width:100%}
.wb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.wb-headmain{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.wb-title{margin:0;font-size:16px;font-weight:600;line-height:1.4}
.wb-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#637182);line-height:1.5}
.wb-boundary{font-size:11px;color:var(--dsw-alias-state-warn-primary,#f79009);line-height:1.5}
.wb-headside{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex:none;max-width:100%}
.wb-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.wb-pill{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;font-size:11px;line-height:1.6;border:1px solid transparent}
.wb-pill-on{color:var(--dsw-alias-state-success-primary,#12b76a);background:var(--dsw-alias-state-success-tertiary,#e7f8f0);border-color:var(--dsw-alias-state-success-primary,#12b76a)}
.wb-pill-off{color:var(--dsw-alias-label-secondary,#637182);background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));border-color:var(--dsw-alias-border-l2,#edf0f4)}
.wb-dot{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block}
.wb-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,#edf0f4);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#191f28);border-radius:12px;min-height:28px;padding:4px 12px;font-size:12px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.wb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.wb-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}
.wb-btn:disabled{opacity:.55;cursor:default}
.wb-btn-primary{border-color:transparent;background:var(--dsw-alias-state-business-primary,#4176e6);color:var(--dsw-alias-bg-layer-1,#fff);font-weight:600}
.wb-btn-ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary,#637182)}
.wb-btn-danger{border-color:var(--dsw-alias-state-error-primary,#f04438);color:var(--dsw-alias-state-error-primary,#f04438);background:transparent}
.wb-tag{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:11px;line-height:1.6;border:1px solid transparent;white-space:nowrap}
.wb-tag-success{color:var(--dsw-alias-state-success-primary,#12b76a);background:var(--dsw-alias-state-success-tertiary,#e7f8f0)}
.wb-tag-neutral{color:var(--dsw-alias-label-secondary,#637182);background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.wb-tag-warn{color:var(--dsw-alias-state-warn-primary,#f79009);background:var(--dsw-alias-state-warn-tertiary,#fdf2e3)}
.wb-tag-danger{color:var(--dsw-alias-state-error-primary,#f04438);background:var(--dsw-alias-state-error-tertiary,rgba(240,68,56,.12))}
.wb-tag-info{color:var(--dsw-alias-state-business-primary,#4176e6);background:var(--dsw-alias-state-business-tertiary,#e8effd)}
.wb-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.wb-card{border:1px solid var(--dsw-alias-border-l2,#edf0f4);border-radius:16px;background:var(--dsw-alias-bg-layer-1,#fff);padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0}
.wb-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:space-between}
.wb-card-title{font-size:13px;font-weight:600}
.wb-card-note{font-size:11px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.wb-kvs{display:flex;flex-direction:column;gap:4px}
.wb-kv{display:flex;align-items:baseline;gap:8px;min-width:0}
.wb-kn{flex:none;width:76px;font-size:11px;color:var(--dsw-alias-label-secondary,#637182)}
.wb-kd{font-size:12px;color:var(--dsw-alias-label-primary,#191f28);overflow-wrap:anywhere;min-width:0}
.wb-carderr{display:flex;flex-direction:column;gap:2px;border-top:1px solid var(--dsw-alias-border-l2,#edf0f4);padding-top:6px}
.wb-carderr-label{font-size:11px;color:var(--dsw-alias-state-error-primary,#f04438)}
.wb-carderr-text{font-size:11px;color:var(--dsw-alias-label-secondary,#637182);overflow-wrap:anywhere}
.wb-counts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wb-count{display:flex;flex-direction:column;gap:1px;min-width:0}
.wb-count-value{font-size:16px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums}
.wb-count-label{font-size:11px;color:var(--dsw-alias-label-secondary,#637182)}
.wb-section{border:1px solid var(--dsw-alias-border-l2,#edf0f4);border-radius:16px;background:var(--dsw-alias-bg-layer-1,#fff);padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px}
.wb-section-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wb-section-title{margin:0;font-size:13px;font-weight:600}
.wb-section-desc{font-size:11px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.wb-section-side{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wb-subsection{display:flex;flex-direction:column;gap:6px}
.wb-subhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wb-subtitle{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#637182)}
.wb-tablewrap{overflow-x:auto;border:1px solid var(--dsw-alias-border-l2,#edf0f4);border-radius:12px}
.wb-table{width:100%;border-collapse:collapse;font-size:12px}
.wb-table th{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#637182);text-align:left;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,#edf0f4);background:var(--dsw-alias-bg-layer-2,#fff);white-space:nowrap}
.wb-table td{padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,#edf0f4);vertical-align:top}
.wb-table tr:last-child td{border-bottom:none}
.wb-mono{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px}
.wb-nowrap{white-space:nowrap}
.wb-mode{font-size:12px}
.wb-events{display:flex;flex-direction:column;max-height:420px;overflow-y:auto}
.wb-event{display:flex;align-items:flex-start;gap:10px;padding:8px 2px;border-bottom:1px solid var(--dsw-alias-border-l2,#edf0f4);min-height:40px}
.wb-event:last-child{border-bottom:none}
.wb-event-time{flex:none;width:86px;font-size:11px;color:var(--dsw-alias-label-tertiary,#98a2b3);font-variant-numeric:tabular-nums;padding-top:2px}
.wb-event-body{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.wb-event-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}
.wb-event-source{flex:none;font-size:11px;font-weight:600;color:var(--dsw-alias-state-business-primary,#4176e6)}
.wb-event-title{font-size:12px;overflow-wrap:anywhere;min-width:0}
.wb-event-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary,#637182)}
.wb-link{font-size:11px;color:var(--dsw-alias-state-business-primary,#4176e6);text-decoration:none;white-space:nowrap}
.wb-link:hover{text-decoration:underline}
.wb-count-chip{font-size:11px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.wb-clear{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid var(--dsw-alias-border-l2,#edf0f4);padding-top:8px}
.wb-clearhint{font-size:11px;color:var(--dsw-alias-label-secondary,#637182)}
.wb-ok{color:var(--dsw-alias-state-success-primary,#12b76a)}
.wb-dirty{font-size:11px;color:var(--dsw-alias-state-warn-primary,#f79009)}
.wb-notice{font-size:11px;line-height:1.5}
.wb-notice-ok{color:var(--dsw-alias-state-success-primary,#12b76a)}
.wb-notice-bad{color:var(--dsw-alias-state-error-primary,#f04438)}
.wb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.wb-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.wb-flabel{font-size:11px;color:var(--dsw-alias-label-secondary,#637182)}
.wb-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#98a2b3);line-height:1.4}
.wb-hint-bad{color:var(--dsw-alias-state-error-primary,#f04438)}
.wb-input{appearance:none;width:100%;border:1px solid var(--dsw-alias-border-l2,#edf0f4);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#191f28);border-radius:12px;min-height:30px;padding:4px 10px;font-size:12px;font-family:inherit}
.wb-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px;border-color:transparent}
.wb-input-bad{border-color:var(--dsw-alias-state-error-primary,#f04438)}
.wb-num{width:120px}
.wb-select{appearance:none;border:1px solid var(--dsw-alias-border-l2,#edf0f4);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#191f28);border-radius:12px;min-height:30px;padding:4px 10px;font-size:12px;font-family:inherit}
.wb-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}
.wb-switch{appearance:none;flex:none;width:34px;height:20px;border-radius:999px;border:1px solid var(--dsw-alias-border-l3,#d5dae2);background:var(--dsw-alias-bg-layer-2,#fff);position:relative;cursor:pointer;padding:0}
.wb-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}
.wb-switch-dot{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:999px;background:var(--dsw-alias-label-tertiary,#98a2b3);transition:left .14s ease}
.wb-switch-on{border-color:var(--dsw-alias-state-business-primary,#4176e6);background:var(--dsw-alias-state-business-tertiary,#e8effd)}
.wb-switch-on .wb-switch-dot{left:16px;background:var(--dsw-alias-state-business-primary,#4176e6)}
.wb-inline-switch{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary,#637182)}
.wb-rules{display:flex;flex-direction:column;gap:8px}
.wb-rule{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l2,#edf0f4);border-radius:12px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2,#fff);min-width:0}
.wb-rule-main{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}
.wb-rule-name{font-size:12px;font-weight:600;overflow-wrap:anywhere}
.wb-rule-id{color:var(--dsw-alias-label-tertiary,#98a2b3);overflow-wrap:anywhere;font-size:11px}
.wb-rule-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end}
.wb-rule-switches{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.wb-rule-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.wb-rule-repo{grid-column:span 1}
.wb-empty{padding:14px;border:1px dashed var(--dsw-alias-border-l2,#edf0f4);border-radius:16px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.wb-empty-text{font-size:12px;color:var(--dsw-alias-label-secondary,#637182)}
.wb-errorbar{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-state-error-primary,#f04438);border-radius:12px;background:var(--dsw-alias-state-error-tertiary,rgba(240,68,56,.12));color:var(--dsw-alias-state-error-primary,#f04438);font-size:12px;flex-wrap:wrap}
.wb-errorbar-label{font-weight:600;flex:none}
.wb-errorbar-text{flex:1;min-width:0;overflow-wrap:anywhere}
.wb-loading{font-size:12px;color:var(--dsw-alias-label-secondary,#637182);padding:6px 2px}
.wb-accounts-section{min-width:0}
.wb-accounts-actions{justify-content:flex-start;flex-wrap:wrap}
.wb-account-list{display:flex;flex-direction:column;gap:8px}
.wb-account{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l2,#edf0f4);border-radius:12px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2,#fff);min-width:0}
.wb-account-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.wb-account-mark{display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;border-radius:4px;background:var(--dsw-alias-state-business-tertiary,#e8effd);color:var(--dsw-alias-state-business-primary,#4176e6);font-size:11px;font-weight:600;line-height:1}
.wb-account-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.wb-account-title{font-size:13px;font-weight:600;overflow-wrap:anywhere}
.wb-account-sub{font-size:11px;color:var(--dsw-alias-label-tertiary,#98a2b3);overflow-wrap:anywhere}
.wb-account-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
.wb-account-line{font-size:11px;color:var(--dsw-alias-label-secondary,#637182);overflow-wrap:anywhere}
.wb-account-err{font-size:11px;color:var(--dsw-alias-state-error-primary,#f04438);overflow-wrap:anywhere}
.wb-account-test{font-size:11px;overflow-wrap:anywhere}
.wb-account-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.wb-chips{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
.wb-chip{font-size:11px;line-height:1.6;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-secondary,#637182);white-space:nowrap}
.wb-form{display:flex;flex-direction:column;gap:10px;border:1px dashed var(--dsw-alias-border-l3,#d5dae2);border-radius:12px;padding:12px;background:var(--dsw-alias-bg-layer-2,#fff);min-width:0}
.wb-form-head{display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap}
.wb-form-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.wb-device{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-state-business-primary,#4176e6);border-radius:12px;padding:12px;background:var(--dsw-alias-state-business-tertiary,#e8effd);min-width:0}
.wb-device-head{display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap}
.wb-device-timer{font-size:11px;color:var(--dsw-alias-label-secondary,#637182);font-variant-numeric:tabular-nums}
.wb-device-body{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.wb-device-codewrap{display:flex;flex-direction:column;gap:2px}
.wb-device-code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:16px;font-weight:600;letter-spacing:1px;color:var(--dsw-alias-label-primary,#191f28)}
.wb-safety-list{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dsw-alias-label-secondary,#637182);line-height:1.5}
.wb-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--dsw-alias-overlay-bg,rgba(16,24,40,.32))}
.wb-modal{width:min(520px,100%);max-height:min(80vh,640px);display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l1,#e3e7ed);border-radius:16px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(16,24,40,.18));padding:14px 16px}
.wb-modal-head{display:flex;align-items:center;gap:8px;justify-content:space-between}
.wb-modal-title{font-size:14px;font-weight:600}
.wb-modal-desc{font-size:11px;color:var(--dsw-alias-label-secondary,#637182);line-height:1.5}
.wb-modal-body{display:flex;flex-direction:column;gap:6px;min-height:120px;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2,#edf0f4);border-radius:12px;padding:6px}
.wb-modal-status{font-size:12px;color:var(--dsw-alias-label-secondary,#637182);padding:12px;text-align:center}
.wb-modal-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.wb-modal-count{font-size:11px;color:var(--dsw-alias-label-tertiary,#98a2b3);margin-right:auto}
.wb-chatlist{display:flex;flex-direction:column;gap:2px}
.wb-chatrow{appearance:none;display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:1px solid transparent;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary,#191f28);font-family:inherit;font-size:12px;padding:6px 8px;cursor:pointer;min-height:36px}
.wb-chatrow:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.wb-chatrow-on{background:var(--dsw-alias-state-business-tertiary,#e8effd);border-color:var(--dsw-alias-state-business-primary,#4176e6)}
.wb-chatrow:disabled{cursor:default;opacity:.7}
.wb-check{flex:none;width:14px;height:14px;border-radius:4px;border:1px solid var(--dsw-alias-border-l3,#d5dae2);background:var(--dsw-alias-bg-layer-1,#fff);display:inline-block;position:relative}
.wb-check-on{border-color:var(--dsw-alias-state-business-primary,#4176e6);background:var(--dsw-alias-state-business-primary,#4176e6)}
.wb-chatrow-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.wb-chatrow-name{font-size:12px;overflow-wrap:anywhere}
.wb-chatrow-id{color:var(--dsw-alias-label-tertiary,#98a2b3);overflow-wrap:anywhere;font-size:11px}
.wb-icon{display:inline-flex;align-items:center;justify-content:center;line-height:1;color:inherit}
`

    // ---------------------------------------------------------------- apply
    return {
      inject: ['slots', 'locale'],
      // 离线测试钩子：test-render.html 直接调用纯展示层，不经过真实 store。
      __test: {
        DICT_ZH,
        DICT_EN,
        createT,
        createApi,
        createStore,
        makeActions,
        normalizeConfig,
        modelToText,
        composeModel,
        repoIsValid,
        parseKeywords,
        modeLabel,
        reasonLabel,
        formatTime,
        safeUrl,
        components: {
          PanelView,
          SettingsView,
          ChatPicker,
          PanelIcon,
          ChannelCard,
          CountersCard,
          AccountsView,
          AccountCard,
          FeishuForm,
          GithubForm,
          FeishuFlowPanel,
        },
        accountStatusLabel,
        accountStatusTone,
        accountProviderLabel,
        accountIdentityText,
        accountExpiryText,
        accountsForChannel,
        channelAccountOptions,
        upsertAccount,
        formatRemaining,
      },
      apply(ctx) {
        const api = createApi()
        const store = createStore(api)
        const actions = makeActions(api, store)
        const bindLocale = () => {
          try {
            if (ctx.locale && typeof ctx.locale.bind === 'function') {
              const bound = ctx.locale.bind(NS)
              if (typeof bound === 'function') return bound
            }
          } catch (error) { /* 回落到内联字典 */ }
          return null
        }
        const t = createT(bindLocale)
        const styleTagId = 'dsh-workbench-style'

        ctx.effect(() => ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN }), 'dsh-workbench: locale')
        ctx.effect(() => {
          let off = null
          try {
            if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
              off = ctx.locale.subscribe(() => {
                for (const fn of Array.from(LOCALE_SUBS)) {
                  try { fn() } catch (error) { /* 单个组件失败不拖垮语言切换 */ }
                }
              })
            }
          } catch (error) { off = null }
          return () => {
            if (typeof off === 'function') {
              try { off() } catch (error) { /* noop */ }
            }
          }
        }, 'dsh-workbench: locale-change')
        ctx.effect(() => {
          if (typeof document === 'undefined' || !document.head || typeof document.createElement !== 'function') return () => {}
          const tag = document.createElement('style')
          try {
            tag.id = styleTagId
            tag.setAttribute('data-plugin', '@ponydev/dsh-workbench')
            tag.textContent = CSS
            document.head.appendChild(tag)
          } catch (error) { /* 样式注入失败不影响功能 */ }
          return () => {
            try {
              if (typeof tag.remove === 'function') tag.remove()
              else if (document.head && typeof document.head.removeChild === 'function') document.head.removeChild(tag)
            } catch (error) { /* noop */ }
          }
        }, 'dsh-workbench: styles')
        ctx.effect(() => () => store.dispose(), 'dsh-workbench: store')

        const panelLabel = () => t('panel.label')
        const settingsLabel = () => t('settings.label')

        // ① 设置 → 工作台
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'workbench',
          order: 44,
          label: settingsLabel,
          locale: 'dsh-workbench',
          inject: () => ({ store, api, actions, t }),
        }, withBoundary(SettingsSection)))

        // ② 主栏「工作台」面板（key 与侧栏 panellist 的 id 对应）
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'workbench',
          locale: 'dsh-workbench',
          inject: () => ({ store, api, actions, t }),
        }, withBoundary(Panel)))

        // ③ 侧栏全局面板图标
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'workbench',
          order: 5,
          label: panelLabel,
          locale: 'dsh-workbench',
        }, PanelIcon))
      },
    }
  },
})
