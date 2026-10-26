// dsh-workbench · 采集引擎（轮询 + 规则 + 事件历史）
//
// v0.1 边界：只采集、匹配、记录；不发送消息、不创建 review 会话。
// 并发：同一渠道同一时间只跑一轮；手动触发撞上正在跑 → sync/busy。
// 增量：Lark 用每会话 lastMessageTs 游标；GitHub 用每 PR lastSeenSha。

import { matchLark, matchGithub, larkTitle, githubTitle } from './rules.js'
import { WorkbenchError, messageOf } from './errors.js'

const INITIAL_DELAY_MS = 1500

export class WorkbenchEngine {
  constructor ({
    config, state, log,
    lark, github,
    now = () => Date.now(),
    schedule = (fn, ms) => setTimeout(fn, ms),
    interval = (fn, ms) => setInterval(fn, ms),
    clearSchedule = (handle) => clearTimeout(handle),
    clearIntervalFn = (handle) => clearInterval(handle),
  }) {
    this.config = config
    this.state = state
    this.log = log || (() => {})
    this.lark = lark
    this.github = github
    this.now = now
    this.schedule = schedule
    this.interval = interval
    this.clearSchedule = clearSchedule
    this.clearIntervalFn = clearIntervalFn

    this.timers = []
    this.larkBusy = false
    this.githubBusy = false
    this.disposed = false
    this.counters = { larkMessages: 0, larkMatched: 0, githubPulls: 0, githubMatched: 0 }
    this.auth = { lark: { ok: false, openId: '', message: '' }, github: { ok: false, user: '', message: '' } }
    this.nextRun = { lark: 0, github: 0 }
  }

  // ---------------------------------------------------------------- 生命周期

  async start () {
    this.disposed = false
    await this.refreshAuth()
    this.arm()
    this.log('[engine] 采集引擎已启动')
  }

  async refreshAuth () {
    try {
      const lark = await this.lark.authStatus()
      this.auth.lark = { ok: Boolean(lark.ok), openId: lark.userOpenId || '', message: lark.message || '' }
    } catch (error) {
      this.auth.lark = { ok: false, openId: '', message: messageOf(error) }
    }
    try {
      const github = await this.github.authStatus()
      this.auth.github = { ok: Boolean(github.ok), user: github.user || '', message: github.message || '' }
    } catch (error) {
      this.auth.github = { ok: false, user: '', message: messageOf(error) }
    }
  }

  disarm () {
    for (const handle of this.timers) {
      try { this.clearIntervalFn(handle) } catch { /* 忽略 */ }
      try { this.clearSchedule(handle) } catch { /* 忽略 */ }
    }
    this.timers = []
  }

  arm () {
    this.disarm()
    if (this.disposed) return
    const lark = this.config.channels.lark
    if (lark.enabled && lark.watchedChats.length) {
      const ms = Math.max(30, Number(lark.pollSeconds) || 60) * 1000
      this.nextRun.lark = this.now() + Math.min(INITIAL_DELAY_MS, ms)
      this.timers.push(this.interval(() => { void this.runLarkOnce({ manual: false }) }, ms))
      this.timers.push(this.schedule(() => { void this.runLarkOnce({ manual: false }) }, Math.min(INITIAL_DELAY_MS, ms)))
    } else {
      this.nextRun.lark = 0
    }
    const github = this.config.channels.github
    if (github.enabled && github.watchedRepos.length) {
      const ms = Math.max(60, Number(github.pollSeconds) || 180) * 1000
      this.nextRun.github = this.now() + Math.min(INITIAL_DELAY_MS, ms)
      this.timers.push(this.interval(() => { void this.runGithubOnce({ manual: false }) }, ms))
      this.timers.push(this.schedule(() => { void this.runGithubOnce({ manual: false }) }, Math.min(INITIAL_DELAY_MS, ms)))
    } else {
      this.nextRun.github = 0
    }
    for (const handle of this.timers) {
      if (handle && typeof handle.unref === 'function') handle.unref()
    }
  }

  applyConfig (config) {
    this.config = config
    this.arm()
    this.log('[engine] 配置已热更新，轮询已重排')
  }

  dispose () {
    this.disposed = true
    this.disarm()
    this.log('[engine] 采集引擎已停止')
  }

  // ---------------------------------------------------------------- 手动触发

  async runLarkOnce ({ manual = false } = {}) {
    if (this.disposed && manual) throw new WorkbenchError('internal', '工作台已停止')
    if (this.larkBusy) {
      if (manual) throw new WorkbenchError('sync/busy', 'Lark 轮询正在进行')
      return { skipped: true }
    }
    this.larkBusy = true
    this.nextRun.lark = this.now() + Math.max(30, Number(this.config.channels.lark.pollSeconds) || 60) * 1000
    if (!this.auth.lark.ok || !this.auth.lark.openId) {
      await this.refreshAuth()
    }
    try {
      const chats = this.config.channels.lark.watchedChats.filter((chat) => chat.mode !== 'off')
      let lastError = ''
      for (const chat of chats) {
        try {
          await this.pollLarkChat(chat)
        } catch (error) {
          lastError = messageOf(error, 120)
          this.log(`[engine] Lark 轮询失败 chat=${chat.chatId}：${lastError}`)
        }
      }
      const at = new Date().toISOString()
      this.state.setPoll('lark', { lastPollAt: at, lastError })
      return { ok: true, lastError }
    } finally {
      this.larkBusy = false
    }
  }

  async pollLarkChat (chat) {
    const key = `lark:${chat.chatId}`
    const cursor = this.state.cursor(key)
    if (!cursor) {
      const baseline = await this.lark.baseline(chat.chatId)
      if (baseline.cursor) this.state.setCursor(key, baseline.cursor)
      this.state.pushEvent({
        source: 'lark',
        kind: 'baseline',
        title: baseline.message ? larkTitle(baseline.message, chat) : `建立基线：${chat.name || chat.chatId}`,
        chatId: chat.chatId,
        matched: false,
        ruleId: `chat:${chat.chatId}`,
        reason: 'baseline',
        status: 'baseline',
      })
      this.log(`[engine] Lark 建立基线 chat=${chat.chatId}`)
      return
    }

    const result = await this.lark.since(chat, cursor)
    for (const message of result.messages) {
      if (!this.state.markSeen(message.messageId)) continue
      this.counters.larkMessages += 1
      const match = matchLark(message, chat, { myOpenId: this.auth.lark.openId })
      if (match.matched) this.counters.larkMatched += 1
      this.state.pushEvent({
        source: 'lark',
        kind: 'message',
        title: larkTitle(message, chat),
        url: match.prs[0]?.url || '',
        chatId: chat.chatId,
        matched: match.matched,
        ruleId: match.ruleId,
        reason: match.reason,
        status: match.matched ? 'matched' : 'ignored',
      })
    }
    if (result.nextCursor) this.state.setCursor(key, result.nextCursor)
  }

  async runGithubOnce ({ manual = false } = {}) {
    if (this.disposed && manual) throw new WorkbenchError('internal', '工作台已停止')
    if (this.githubBusy) {
      if (manual) throw new WorkbenchError('sync/busy', 'GitHub 轮询正在进行')
      return { skipped: true }
    }
    this.githubBusy = true
    this.nextRun.github = this.now() + Math.max(60, Number(this.config.channels.github.pollSeconds) || 180) * 1000
    try {
      const repos = this.config.channels.github.watchedRepos
      let lastError = ''
      for (const repoConfig of repos) {
        try {
          await this.pollGithubRepo(repoConfig)
        } catch (error) {
          lastError = messageOf(error, 120)
          this.log(`[engine] GitHub 轮询失败 repo=${repoConfig.repo}：${lastError}`)
        }
      }
      const at = new Date().toISOString()
      this.state.setPoll('github', { lastPollAt: at, lastError })
      return { ok: true, lastError }
    } finally {
      this.githubBusy = false
    }
  }

  async pollGithubRepo (repoConfig) {
    const result = await this.github.listPulls(repoConfig.repo)
    const repoState = this.state.repoState(repoConfig.repo)
    repoState.lastPolledAt = new Date().toISOString()

    let baselineCount = 0
    for (const pull of result.pulls) {
      const prev = this.state.prState(repoConfig.repo, pull.number)
      const match = matchGithub(pull, repoConfig, prev)
      this.counters.githubPulls += 1

      if (match.isBaseline) {
        baselineCount += 1
        this.state.setPrState(repoConfig.repo, pull.number, { lastSeenSha: pull.headSha, lastSeenAt: new Date().toISOString() })
        continue
      }
      if (!match.matched) continue

      this.counters.githubMatched += 1
      this.state.setPrState(repoConfig.repo, pull.number, { lastSeenSha: pull.headSha, lastSeenAt: new Date().toISOString(), lastMatchedAt: new Date().toISOString() })
      this.state.pushEvent({
        source: 'github',
        kind: pull.headSha && prev?.lastSeenSha ? 'commit' : 'pr',
        title: githubTitle(pull),
        url: pull.url,
        repo: pull.repo,
        matched: true,
        ruleId: `repo:${repoConfig.repo}`,
        reason: match.reason,
        status: 'matched',
      })
    }

    if (baselineCount > 0) {
      this.state.pushEvent({
        source: 'github',
        kind: 'baseline',
        title: `${repoConfig.repo} · 建立基线（${baselineCount} 个 PR）`,
        repo: repoConfig.repo,
        matched: false,
        ruleId: `repo:${repoConfig.repo}`,
        reason: 'baseline',
        status: 'baseline',
      })
    }
  }

  // ---------------------------------------------------------------- 状态

  status () {
    const lark = this.config.channels.lark
    const github = this.config.channels.github
    const poll = this.state.poll()
    return {
      lark: {
        enabled: Boolean(lark.enabled),
        identity: 'user',
        openId: this.auth.lark.openId,
        pollSeconds: Number(lark.pollSeconds) || 60,
        lastPollAt: poll.lark?.lastPollAt || '',
        nextPollAt: this.nextRun.lark ? new Date(this.nextRun.lark).toISOString() : '',
        lastError: poll.lark?.lastError || '',
        watchedChats: lark.watchedChats.length,
      },
      github: {
        enabled: Boolean(github.enabled),
        user: this.auth.github.user,
        pollSeconds: Number(github.pollSeconds) || 180,
        lastPollAt: poll.github?.lastPollAt || '',
        nextPollAt: this.nextRun.github ? new Date(this.nextRun.github).toISOString() : '',
        lastError: poll.github?.lastError || '',
        watchedRepos: github.watchedRepos.length,
      },
      counters: { ...this.counters },
    }
  }

  health () {
    return {
      lark: { ok: this.auth.lark.ok, message: this.auth.lark.message || (this.auth.lark.ok ? 'user identity ready' : '不可用') },
      github: { ok: this.auth.github.ok, user: this.auth.github.user, message: this.auth.github.message || (this.auth.github.ok ? 'logged in' : '不可用') },
    }
  }
}
