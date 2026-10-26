// dsh-workbench · 运行时状态（state.json）
//
// 只存增量所需：游标、去重集合、GitHub 每 PR 的 seen sha、事件历史、轮询状态、当天统计。
// 不存消息正文（v0.1 也不需要）；事件标题截断后入历史。

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readJsonFile, writeJsonAtomic } from './store.js'

const STATE_VERSION = 1
const SEEN_LIMIT = 5000
const SAVE_DELAY_MS = 250

function todayKey () {
  return new Date().toISOString().slice(0, 10)
}

function emptyState () {
  return {
    version: STATE_VERSION,
    cursors: {},
    seen: [],
    github: { repos: {} },
    poll: {
      lark: { lastPollAt: '', lastError: '' },
      github: { lastPollAt: '', lastError: '' },
    },
    events: [],
    stats: { day: todayKey(), events: 0, matched: 0 },
  }
}

function clampText (value, max) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length > max ? text.slice(0, max) : text
}

export class WorkbenchState {
  constructor ({ stateDir, log, historyLimit = 200 } = {}) {
    this.file = join(stateDir, 'state.json')
    this.log = log || (() => {})
    this.historyLimit = Math.max(20, Math.min(1000, historyLimit))
    this.data = emptyState()
    this.seen = new Set()
    this.saveTimer = null
    this.closed = false
  }

  load () {
    const { value, corrupt } = readJsonFile(this.file, null)
    if (corrupt) this.log('[state] state.json 损坏，已备份并回落空状态')
    if (!value || typeof value !== 'object') {
      this.data = emptyState()
      return this
    }
    const base = emptyState()
    this.data = {
      version: STATE_VERSION,
      cursors: value.cursors && typeof value.cursors === 'object' ? value.cursors : {},
      seen: Array.isArray(value.seen) ? value.seen.filter((item) => typeof item === 'string').slice(-SEEN_LIMIT) : [],
      github: {
        repos: value.github && value.github.repos && typeof value.github.repos === 'object' ? value.github.repos : {},
      },
      poll: {
        lark: { lastPollAt: '', lastError: '', ...(value.poll?.lark || {}) },
        github: { lastPollAt: '', lastError: '', ...(value.poll?.github || {}) },
      },
      events: Array.isArray(value.events) ? value.events.slice(0, this.historyLimit) : [],
      stats: value.stats && typeof value.stats === 'object' ? { ...base.stats, ...value.stats } : base.stats,
    }
    this.seen = new Set(this.data.seen)
    this.rollDay()
    return this
  }

  rollDay () {
    const day = todayKey()
    if (this.data.stats.day !== day) {
      this.data.stats = { day, events: 0, matched: 0 }
    }
  }

  save () {
    if (this.closed) return
    this.data.seen = [...this.seen].slice(-SEEN_LIMIT)
    writeJsonAtomic(this.file, this.data)
  }

  scheduleSave () {
    if (this.closed || this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try { this.save() } catch (error) { this.log(`[state] 保存失败：${error instanceof Error ? error.message : String(error)}`) }
    }, SAVE_DELAY_MS)
    if (typeof this.saveTimer.unref === 'function') this.saveTimer.unref()
  }

  close () {
    this.closed = true
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null }
    try { this.data.seen = [...this.seen].slice(-SEEN_LIMIT) } catch { /* 忽略 */ }
    try { writeJsonAtomic(this.file, this.data) } catch { /* 关闭失败不阻塞 */ }
  }

  // ---------------------------------------------------------------- 游标

  cursor (key) {
    const value = this.data.cursors[key]
    return value && typeof value === 'object' ? value : undefined
  }

  setCursor (key, cursor) {
    if (!cursor) return
    this.data.cursors[key] = {
      lastMessageTs: String(cursor.lastMessageTs || ''),
      lastMessageId: String(cursor.lastMessageId || ''),
    }
    this.scheduleSave()
  }

  // ---------------------------------------------------------------- 去重

  /** @returns {boolean} true = 新消息（未见过） */
  markSeen (messageId) {
    if (!messageId || this.seen.has(messageId)) return false
    this.seen.add(messageId)
    if (this.seen.size > SEEN_LIMIT) {
      const drop = this.seen.size - SEEN_LIMIT
      let index = 0
      for (const id of this.seen) {
        if (index >= drop) break
        this.seen.delete(id)
        index += 1
      }
    }
    this.scheduleSave()
    return true
  }

  // ---------------------------------------------------------------- GitHub

  repoState (repo) {
    const repos = this.data.github.repos
    if (!repos[repo] || typeof repos[repo] !== 'object') repos[repo] = { lastPolledAt: '', prs: {} }
    if (!repos[repo].prs || typeof repos[repo].prs !== 'object') repos[repo].prs = {}
    return repos[repo]
  }

  prState (repo, number) {
    const repoState = this.repoState(repo)
    const key = String(number)
    if (!repoState.prs[key] || typeof repoState.prs[key] !== 'object') repoState.prs[key] = {}
    return repoState.prs[key]
  }

  setPrState (repo, number, patch) {
    const current = this.prState(repo, number)
    this.repoState(repo).prs[String(number)] = { ...current, ...patch }
    this.scheduleSave()
  }

  // ---------------------------------------------------------------- 轮询状态

  setPoll (channel, patch) {
    const current = this.data.poll[channel] || {}
    this.data.poll[channel] = { ...current, ...patch }
    this.scheduleSave()
  }

  poll () {
    return this.data.poll
  }

  // ---------------------------------------------------------------- 事件

  pushEvent (event) {
    this.rollDay()
    const record = {
      id: `ev_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      at: new Date().toISOString(),
      source: event.source === 'github' ? 'github' : 'lark',
      kind: event.kind || 'message',
      title: clampText(event.title || '', 160),
      url: /^https:\/\/github\.com\//.test(String(event.url || '')) ? String(event.url).slice(0, 300) : '',
      chatId: clampText(event.chatId || '', 120),
      repo: clampText(event.repo || '', 160),
      matched: Boolean(event.matched),
      ruleId: clampText(event.ruleId || '', 160),
      reason: clampText(event.reason || '', 40),
      status: event.status === 'matched' ? 'matched' : (event.status === 'baseline' ? 'baseline' : 'ignored'),
    }
    this.data.events.unshift(record)
    if (this.data.events.length > this.historyLimit) this.data.events.length = this.historyLimit
    this.data.stats.events += 1
    if (record.matched) this.data.stats.matched += 1
    this.scheduleSave()
    return record
  }

  events () {
    return this.data.events
  }

  clearEvents () {
    this.data.events = []
    this.data.stats = { day: todayKey(), events: 0, matched: 0 }
    this.save()
  }

  stats () {
    this.rollDay()
    return { today: { events: this.data.stats.events, matched: this.data.stats.matched } }
  }
}
