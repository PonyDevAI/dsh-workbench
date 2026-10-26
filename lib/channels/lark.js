// dsh-workbench · Lark / 飞书渠道（账号 user token + 原生 API 轮询）
//
// 只读：列会话、拉增量消息。token 生命周期在 AccountAuth；401 时刷新一次，
// 失败即标 needs_auth（不静默重试、不自动授权）。

import { HttpError } from '../http.js'
import { WorkbenchError } from '../errors.js'

const CHAT_PAGE_SIZE = 100
const MSG_PAGE_SIZE = 50
const MAX_MSG_PAGES = 8
const MAX_CHAT_PAGES = 5

export class LarkChannel {
  constructor ({ accounts, auth, config, feishu, log } = {}) {
    this.id = 'lark'
    this.accounts = accounts
    this.auth = auth
    this.config = config
    this.feishu = feishu
    this.log = log || (() => {})
  }

  setConfig (config) {
    this.config = config
  }

  get accountId () {
    return this.config?.channels?.lark?.accountId || ''
  }

  account () {
    const id = this.accountId
    return id ? this.accounts.get(id) : undefined
  }

  async view () {
    const account = this.account()
    return account ? this.accounts.view(account) : null
  }

  async authStatus () {
    const account = this.account()
    if (!account) return { ok: false, userOpenId: '', message: '未连接账号' }
    return {
      ok: account.status === 'ok',
      userOpenId: account.identity?.openId || '',
      message: account.status === 'ok' ? 'ready' : (account.lastError || '需要授权'),
    }
  }

  async withToken (fn) {
    const accountId = this.accountId
    let token = await this.auth.feishuAccessToken(accountId)
    try {
      return await fn(token)
    } catch (error) {
      if (error instanceof HttpError && error.code === 'auth') {
        const refreshed = await this.auth.forceRefreshFeishu(accountId)
        return fn(refreshed.accessToken)
      }
      throw error
    }
  }

  async listChats () {
    const accountId = this.accountId
    if (!accountId) throw new WorkbenchError('account/not-found', '未连接 Lark 账号')
    const chats = []
    let pageToken = ''
    for (let page = 0; page < MAX_CHAT_PAGES; page += 1) {
      const result = await this.withToken((token) => this.feishu.listChats(token, this.brand(), { pageToken, pageSize: CHAT_PAGE_SIZE }))
      chats.push(...result.chats)
      if (!result.hasMore || !result.pageToken) break
      pageToken = result.pageToken
    }
    return { chats }
  }

  brand () {
    return this.account()?.brand || 'feishu'
  }

  async baseline (chatId) {
    const result = await this.withToken((token) => this.feishu.listMessages(token, this.brand(), { chatId, pageSize: 1 }))
    const latest = result.messages[result.messages.length - 1]
    if (!latest) return { ok: true, cursor: null, message: undefined }
    return {
      ok: true,
      cursor: { lastMessageTs: String(latest.createTime), lastMessageId: latest.messageId },
      message: this.toEnvelope(latest, { chatId, name: '', type: 'group' }),
    }
  }

  async since (chat, cursor) {
    const startMs = Number(cursor?.lastMessageTs || 0)
    const messages = []
    let pageToken = ''
    for (let page = 0; page < MAX_MSG_PAGES; page += 1) {
      const result = await this.withToken((token) => this.feishu.listMessages(token, this.brand(), {
        chatId: chat.chatId, startMs, pageToken, pageSize: MSG_PAGE_SIZE,
      }))
      for (const message of result.messages) {
        if (startMs && message.createTime <= startMs) continue
        messages.push(this.toEnvelope(message, chat))
      }
      if (!result.hasMore || !result.pageToken) break
      pageToken = result.pageToken
      if (messages.length >= 300) break
    }
    const last = messages[messages.length - 1]
    return {
      ok: true,
      messages,
      nextCursor: last ? { lastMessageTs: String(last.ts), lastMessageId: last.messageId } : cursor,
      error: '',
    }
  }

  toEnvelope (message, chat) {
    return {
      channel: 'lark',
      chat: { id: chat.chatId, name: chat.name || '', type: chat.type === 'p2p' ? 'p2p' : 'group' },
      sender: message.sender,
      messageId: message.messageId,
      msgType: message.msgType,
      text: message.text,
      mentions: message.mentions,
      threadId: message.threadId,
      ts: message.createTime,
      deleted: message.deleted,
      updated: message.updated,
    }
  }
}
