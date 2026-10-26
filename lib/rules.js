// dsh-workbench · 规则匹配（纯函数，可离线测试）
//
// 规则优先：只有确定性命中才进事件；v0.1 不做模型分类。
// 所有匹配结果都带 reason，便于设置页/历史里解释“为什么命中”。

import { extractPrRefs } from './config.js'

const REVIEW_COMMAND_RE = /^\s*\/review\b/i

function lower (value) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function snippet (text, max = 60) {
  const value = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  return value.length > max ? value.slice(0, max) + '…' : value
}

/**
 * Lark 规则匹配。
 * @returns {{ matched: boolean, reason: string, ruleId: string, prs: Array<{repo:string,number:number,url:string}> }}
 */
export function matchLark (message, chatConfig, { myOpenId = '' } = {}) {
  const ruleId = chatConfig?.chatId ? `chat:${chatConfig.chatId}` : ''
  const none = { matched: false, reason: 'off', ruleId, prs: [] }
  if (!chatConfig || chatConfig.mode === 'off') return none

  const text = typeof message?.text === 'string' ? message.text : ''
  const prs = extractPrRefs(text)
  if (message?.deleted) return { matched: false, reason: 'deleted', ruleId, prs }
  if (myOpenId && message?.sender?.id && message.sender.id === myOpenId) {
    return { matched: false, reason: 'self', ruleId, prs }
  }

  let reason = ''
  if (chatConfig.mode === 'all') reason = 'all'
  else if (chatConfig.mode === 'mention' && myOpenId && Array.isArray(message?.mentions) && message.mentions.includes(myOpenId)) reason = 'mention'
  else if (chatConfig.mode === 'keyword') {
    const haystack = lower(text)
    const hit = (chatConfig.keywords || []).find((keyword) => keyword && haystack.includes(lower(keyword)))
    if (hit) reason = 'keyword'
  }
  if (!reason && chatConfig.allowReviewCommand && REVIEW_COMMAND_RE.test(text)) reason = 'command'
  if (!reason) return { matched: false, reason: 'no-match', ruleId, prs }

  return {
    matched: true,
    reason: reason === 'command' ? 'command' : (prs.length ? 'pr-link' : reason),
    ruleId,
    prs,
  }
}

/**
 * GitHub 规则匹配。
 * @param {object} pull 归一化 PR
 * @param {object} repoConfig watchedRepos 项
 * @param {object|undefined} prev state 里该 PR 的上次记录
 * @returns {{ matched: boolean, reason: string, isBaseline: boolean }}
 */
export function matchGithub (pull, repoConfig, prev) {
  if (!repoConfig) return { matched: false, reason: 'off', isBaseline: false }
  if (pull.draft && repoConfig.skipDraft) return { matched: false, reason: 'draft-skip', isBaseline: false }
  if (Array.isArray(repoConfig.labels) && repoConfig.labels.length) {
    const hasLabel = pull.labels.some((label) => repoConfig.labels.includes(label))
    if (!hasLabel) return { matched: false, reason: 'label-skip', isBaseline: false }
  }
  if (!prev || !prev.lastSeenSha) return { matched: false, reason: 'baseline', isBaseline: true }
  if (pull.headSha && pull.headSha === prev.lastSeenSha) return { matched: false, reason: 'unchanged', isBaseline: false }
  if (!pull.headSha) return { matched: false, reason: 'no-sha', isBaseline: false }
  const reason = prev.lastSeenSha ? 'commits' : 'opened'
  // 首次见到（有 prev 但没有 seen sha 的旧数据）按 opened 处理
  return { matched: true, reason, isBaseline: false }
}

export function larkTitle (message, chatConfig) {
  const chatName = chatConfig?.name || message?.chat?.name || message?.chat?.id || '会话'
  const who = message?.sender?.name ? `${message.sender.name}：` : ''
  return `${chatName} · ${who}${snippet(message?.text) || '[非文本消息]'}`
}

export function githubTitle (pull) {
  return `${pull.repo}#${pull.number} · ${snippet(pull.title, 80)}`
}

/**
 * 规则自测（设置页 / 手动验证用）。
 * @param {{source:string, chatId?:string, text?:string, mentions?:string[]}} input
 * @param {object} config 归一化后的配置
 * @param {{myOpenId?:string}} [options]
 */
export function testRule (input, config, { myOpenId = '' } = {}) {
  if (input?.source === 'github') {
    const repo = typeof input.repo === 'string' ? input.repo : ''
    const repoConfig = (config?.channels?.github?.watchedRepos || []).find((item) => item.repo === repo)
    const pull = {
      repo,
      number: Number(input.number) || 1,
      title: typeof input.title === 'string' ? input.title : '',
      labels: Array.isArray(input.labels) ? input.labels : [],
      draft: Boolean(input.draft),
      headSha: typeof input.headSha === 'string' ? input.headSha : '',
    }
    const result = matchGithub(pull, repoConfig, input.prevSha ? { lastSeenSha: input.prevSha } : undefined)
    return { ...result, prs: pull.number ? [{ repo, number: pull.number, url: pull.url || '' }] : [] }
  }

  const chatId = typeof input?.chatId === 'string' ? input.chatId : ''
  const chatConfig = (config?.channels?.lark?.watchedChats || []).find((item) => item.chatId === chatId)
  const message = {
    channel: 'lark',
    chat: { id: chatId, name: chatConfig?.name || '', type: chatConfig?.type || 'group' },
    sender: { id: 'test-user', name: '', isBot: false },
    text: typeof input?.text === 'string' ? input.text : '',
    mentions: Array.isArray(input?.mentions) ? input.mentions : [],
    deleted: false,
  }
  return matchLark(message, chatConfig, { myOpenId })
}
