// dsh-workbench · 配置（config.json）
//
// - 默认零监听：watchedChats / watchedRepos 为空 = 不读不写
// - 归一化不抛异常：非法项丢弃并记 warning，整体回退默认值
// - 任何入口为空都不轮询；身份固定 user（不出现 bot 分支）

import { join } from 'node:path'
import { readJsonFile, writeJsonAtomic } from './store.js'

export const CONFIG_VERSION = 2

export const DEFAULT_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  channels: {
    lark: {
      enabled: true,
      accountId: '',
      pollSeconds: 60,
      watchedChats: [],
      p2pWhitelist: [],
    },
    github: {
      enabled: true,
      accountId: '',
      pollSeconds: 180,
      watchedRepos: [],
    },
  },
  features: {
    'pr-review': {
      enabled: true,
      model: null,
      workspace: { mode: 'repo' },
      sinks: { githubComment: true, larkReply: true, summaryChatId: '', draftConfirm: true },
      budget: { timeoutSeconds: 900, maxFindings: 8, maxDiffBytes: 120000, dailyRuns: 50 },
      permission: 'read-only',
    },
  },
  router: { classifier: { enabled: false, model: null, dailyBudget: 200 } },
  defaults: { model: null, workspace: '~/deepseek/workbench' },
  safety: { outbound: 'draft', rateLimitPerHour: 10, allowApprove: false },
  storage: { contentRetentionHours: 24, historyLimit: 200, logRetentionDays: 7 },
})

const CHAT_MODES = new Set(['mention', 'keyword', 'all', 'off'])
const WORKSPACE_MODES = new Set(['default', 'repo', 'custom'])
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const CHAT_ID_RE = /^oc_[A-Za-z0-9_-]+$/
const PR_LINK_RE = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)/g

function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

function isObject (value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text (value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function bool (value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function int (value, { min, max, fallback }) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}

function stringList (value, { maxItems = 20, maxLength = 40 } = {}) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems)
}

function normalizeModel (value) {
  if (!isObject(value)) return null
  const provider = text(value.provider, 60)
  const model = text(value.model, 120)
  return provider && model ? { provider, model } : null
}

function normalizeChat (entry, index, errors) {
  if (!isObject(entry)) {
    errors.push(`watchedChats[${index}] 不是对象`)
    return null
  }
  const chatId = text(entry.chatId, 120)
  if (!CHAT_ID_RE.test(chatId)) {
    errors.push(`watchedChats[${index}].chatId 非法`)
    return null
  }
  const mode = CHAT_MODES.has(entry.mode) ? entry.mode : 'mention'
  return {
    chatId,
    name: text(entry.name, 80),
    type: entry.type === 'p2p' ? 'p2p' : 'group',
    mode,
    keywords: stringList(entry.keywords, { maxItems: 20, maxLength: 40 }),
    allowReviewCommand: bool(entry.allowReviewCommand, true),
  }
}

function normalizeRepo (entry, index, errors) {
  if (!isObject(entry)) {
    errors.push(`watchedRepos[${index}] 不是对象`)
    return null
  }
  const repo = text(entry.repo, 160)
  if (!REPO_RE.test(repo)) {
    errors.push(`watchedRepos[${index}].repo 需为 owner/repo`)
    return null
  }
  const path = text(entry.path, 400)
  return {
    repo,
    path: path && (path.startsWith('/') || path.startsWith('~/')) ? path : '',
    onOpened: bool(entry.onOpened, true),
    onNewCommits: bool(entry.onNewCommits, true),
    skipDraft: bool(entry.skipDraft, true),
    labels: stringList(entry.labels, { maxItems: 10, maxLength: 40 }),
  }
}

function normalizeFeature (entry) {
  const base = clone(DEFAULT_CONFIG.features['pr-review'])
  if (!isObject(entry)) return base
  const workspace = isObject(entry.workspace) ? entry.workspace : {}
  const sinks = isObject(entry.sinks) ? entry.sinks : {}
  const budget = isObject(entry.budget) ? entry.budget : {}
  return {
    enabled: bool(entry.enabled, base.enabled),
    model: normalizeModel(entry.model),
    workspace: {
      mode: WORKSPACE_MODES.has(workspace.mode) ? workspace.mode : base.workspace.mode,
      cwd: text(workspace.cwd, 400),
    },
    sinks: {
      githubComment: bool(sinks.githubComment, base.sinks.githubComment),
      larkReply: bool(sinks.larkReply, base.sinks.larkReply),
      summaryChatId: text(sinks.summaryChatId, 120),
      draftConfirm: bool(sinks.draftConfirm, base.sinks.draftConfirm),
    },
    budget: {
      timeoutSeconds: int(budget.timeoutSeconds, { min: 60, max: 3600, fallback: base.budget.timeoutSeconds }),
      maxFindings: int(budget.maxFindings, { min: 1, max: 30, fallback: base.budget.maxFindings }),
      maxDiffBytes: int(budget.maxDiffBytes, { min: 1000, max: 1_000_000, fallback: base.budget.maxDiffBytes }),
      dailyRuns: int(budget.dailyRuns, { min: 1, max: 500, fallback: base.budget.dailyRuns }),
    },
    permission: entry.permission === 'workspace-write' ? 'workspace-write' : 'read-only',
  }
}

/**
 * 归一化配置（永不抛异常）。
 * @returns {{ config: object, errors: string[], warnings: string[] }}
 */
export function normalizeConfig (raw) {
  const errors = []
  const warnings = []
  const source = isObject(raw) ? raw : {}
  const config = clone(DEFAULT_CONFIG)
  const channels = isObject(source.channels) ? source.channels : {}
  const lark = isObject(channels.lark) ? channels.lark : {}
  const github = isObject(channels.github) ? channels.github : {}

  config.channels.lark.enabled = bool(lark.enabled, config.channels.lark.enabled)
  config.channels.lark.accountId = text(lark.accountId, 40)
  config.channels.lark.pollSeconds = int(lark.pollSeconds, { min: 30, max: 300, fallback: 60 })
  config.channels.lark.watchedChats = []
  const chats = Array.isArray(lark.watchedChats) ? lark.watchedChats.slice(0, 50) : []
  const seenChats = new Set()
  for (const [index, entry] of chats.entries()) {
    const chat = normalizeChat(entry, index, errors)
    if (!chat) continue
    if (seenChats.has(chat.chatId)) { warnings.push(`watchedChats 重复：${chat.chatId}`); continue }
    seenChats.add(chat.chatId)
    config.channels.lark.watchedChats.push(chat)
  }
  config.channels.lark.p2pWhitelist = stringList(lark.p2pWhitelist, { maxItems: 200, maxLength: 80 })

  config.channels.github.enabled = bool(github.enabled, config.channels.github.enabled)
  config.channels.github.accountId = text(github.accountId, 40)
  config.channels.github.pollSeconds = int(github.pollSeconds, { min: 60, max: 3600, fallback: 180 })
  config.channels.github.watchedRepos = []
  const repos = Array.isArray(github.watchedRepos) ? github.watchedRepos.slice(0, 30) : []
  const seenRepos = new Set()
  for (const [index, entry] of repos.entries()) {
    const item = normalizeRepo(entry, index, errors)
    if (!item) continue
    if (seenRepos.has(item.repo)) { warnings.push(`watchedRepos 重复：${item.repo}`); continue }
    seenRepos.add(item.repo)
    config.channels.github.watchedRepos.push(item)
  }

  const features = isObject(source.features) ? source.features : {}
  config.features['pr-review'] = normalizeFeature(features['pr-review'])

  const router = isObject(source.router) ? source.router : {}
  const classifier = isObject(router.classifier) ? router.classifier : {}
  config.router.classifier = {
    enabled: bool(classifier.enabled, false),
    model: normalizeModel(classifier.model),
    dailyBudget: int(classifier.dailyBudget, { min: 10, max: 5000, fallback: 200 }),
  }

  const defaults = isObject(source.defaults) ? source.defaults : {}
  config.defaults.model = normalizeModel(defaults.model)
  const workspace = text(defaults.workspace, 400)
  config.defaults.workspace = workspace && (workspace.startsWith('/') || workspace.startsWith('~/'))
    ? workspace
    : DEFAULT_CONFIG.defaults.workspace

  const safety = isObject(source.safety) ? source.safety : {}
  config.safety.outbound = safety.outbound === 'auto' ? 'auto' : 'draft'
  config.safety.rateLimitPerHour = int(safety.rateLimitPerHour, { min: 1, max: 120, fallback: 10 })
  config.safety.allowApprove = false // 设计上永不 true

  const storage = isObject(source.storage) ? source.storage : {}
  config.storage.contentRetentionHours = int(storage.contentRetentionHours, { min: 1, max: 168, fallback: 24 })
  config.storage.historyLimit = int(storage.historyLimit, { min: 20, max: 1000, fallback: 200 })
  config.storage.logRetentionDays = int(storage.logRetentionDays, { min: 1, max: 90, fallback: 7 })

  return { config, errors, warnings }
}

export function configPath (stateDir) {
  return join(stateDir, 'config.json')
}

export function loadConfig (stateDir, log) {
  const { value, corrupt } = readJsonFile(configPath(stateDir), null)
  if (corrupt) log?.('[config] config.json 损坏，已备份并回落默认配置')
  const normalized = normalizeConfig(value || {})
  if (!value) normalized.warnings.push('尚未保存过配置，使用默认（零监听）')
  return normalized
}

export function saveConfig (stateDir, raw) {
  const normalized = normalizeConfig(raw)
  if (normalized.errors.length) {
    return { ok: false, errors: normalized.errors, config: normalized.config }
  }
  writeJsonAtomic(configPath(stateDir), normalized.config)
  return { ok: true, config: normalized.config, warnings: normalized.warnings }
}

/** 从文本中提取 GitHub PR 链接（也供 rules 使用）。 */
export function extractPrRefs (textValue) {
  const textInput = typeof textValue === 'string' ? textValue : ''
  const out = []
  PR_LINK_RE.lastIndex = 0
  let match
  while ((match = PR_LINK_RE.exec(textInput)) !== null) {
    out.push({ repo: `${match[1]}/${match[2]}`, number: Number(match[3]), url: match[0] })
    if (out.length >= 5) break
  }
  return out
}
