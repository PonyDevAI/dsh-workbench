// dsh-workbench · Lark / 飞书渠道（本人身份，轮询）
//
// 边界：只做「读我可见的会话 / 拉增量消息」；v0.1 不发送任何消息。
// 身份：固定 --as user（个人工作台，不使用 bot / lark-mcp / 事件订阅）。
// 安全：消息正文只进内存与事件标题（截断），不写日志。

import { run, parseJson } from './shell.js'
import { messageOf, WorkbenchError } from './errors.js'

const DEFAULT_TIMEOUT = 30_000
const PAGE_SIZE = 50
const MAX_PAGES = 8

function asArray (value) {
  return Array.isArray(value) ? value : []
}

function senderOf (value) {
  const sender = value && typeof value === 'object' ? value : {}
  const id = typeof sender.id === 'string' ? sender.id : ''
  return {
    id,
    name: typeof sender.name === 'string' ? sender.name : '',
    isBot: sender.sender_type === 'app' || sender.sender_type === 'bot',
  }
}

function mentionIdsOf (message) {
  return asArray(message?.mentions)
    .map((item) => {
      const id = item?.id
      if (typeof id === 'string') return id
      if (id && typeof id === 'object') return id.open_id || id.openId || ''
      return ''
    })
    .filter(Boolean)
}

export class LarkAdapter {
  constructor ({ binary = 'lark-cli', log, timeoutMs = DEFAULT_TIMEOUT } = {}) {
    this.id = 'lark'
    this.label = 'Lark / 飞书'
    this.identity = 'user'
    this.transport = 'poll'
    this.binary = binary
    this.log = log || (() => {})
    this.timeoutMs = timeoutMs
  }

  async exec (args, options = {}) {
    return run(this.binary, args, { timeoutMs: options.timeoutMs || this.timeoutMs })
  }

  async authStatus () {
    const result = await this.exec(['auth', 'status'])
    const data = parseJson(result.stdout)
    if (result.code !== 0 || !data) {
      return { ok: false, appId: '', brand: '', userOpenId: '', message: '未登录或无法读取 lark-cli 身份' }
    }
    const user = data.identities?.user || {}
    return {
      ok: Boolean(user.available),
      appId: data.appId || '',
      brand: data.brand || '',
      userOpenId: user.available ? (user.openId || '') : '',
      message: user.available ? 'user identity ready' : 'lark-cli 用户身份不可用',
    }
  }

  /** 我可见的群 / 私聊（设置页选择器用）。 */
  async listChats () {
    const result = await this.exec([
      'im', '+chat-list', '--as', 'user',
      '--format', 'json', '--page-size', '100', '--page-all', '--page-limit', '5',
      '--types', 'group,p2p',
    ], { timeoutMs: 60_000 })
    const data = parseJson(result.stdout)
    if (result.code !== 0 || !data || data.ok === false) {
      throw new WorkbenchError('lark/not-configured', result.timedOut ? '读取会话超时' : '读取 Lark 会话失败（检查 lark-cli 登录）')
    }
    const chats = asArray(data.data?.chats).map((chat) => ({
      chatId: typeof chat.chat_id === 'string' ? chat.chat_id : '',
      name: typeof chat.name === 'string' ? chat.name : '',
      type: chat.chat_mode === 'p2p' ? 'p2p' : 'group',
      memberCount: Number(chat.member_count) || 0,
    })).filter((chat) => chat.chatId)
    return { ok: true, chats }
  }

  /** 首次监听：只取最新一条建立基线，不产生 matched。 */
  async baseline (chatId) {
    const result = await this.exec([
      'im', '+chat-messages-list', '--chat-id', chatId, '--as', 'user',
      '--order', 'desc', '--page-size', '1', '--format', 'json', '--no-reactions',
    ])
    const data = parseJson(result.stdout)
    if (result.code !== 0 || !data || data.ok === false) {
      throw new WorkbenchError('lark/poll-failed', result.timedOut ? '拉取消息超时' : '拉取 Lark 消息失败')
    }
    const latest = asArray(data.data?.messages)[0]
    if (!latest) return { ok: true, cursor: null, message: undefined }
    return {
      ok: true,
      cursor: {
        lastMessageTs: String(latest.create_time || ''),
        lastMessageId: String(latest.message_id || ''),
      },
      message: this.toEnvelope(latest, { chatId, name: '', type: 'group' }),
    }
  }

  /** 从游标之后拉增量（升序、最多 MAX_PAGES 页）。 */
  async since (chat, cursor) {
    const startMs = Number(cursor?.lastMessageTs || 0)
    const args = [
      'im', '+chat-messages-list', '--chat-id', chat.chatId, '--as', 'user',
      '--order', 'asc', '--page-size', String(PAGE_SIZE), '--format', 'json', '--no-reactions',
      '--page-all', '--page-limit', String(MAX_PAGES),
    ]
    if (startMs > 0) args.push('--start', new Date(startMs + 1).toISOString())
    const result = await this.exec(args, { timeoutMs: 60_000 })
    const data = parseJson(result.stdout)
    if (result.code !== 0 || !data || data.ok === false) {
      throw new WorkbenchError('lark/poll-failed', result.timedOut ? '拉取消息超时' : '拉取 Lark 消息失败')
    }
    const messages = asArray(data.data?.messages)
      .filter((message) => message && message.message_id)
      .map((message) => this.toEnvelope(message, chat))
      .filter((message) => {
        if (!message.ts) return true
        return !startMs || message.ts > startMs
      })
    const last = messages[messages.length - 1]
    return {
      ok: true,
      messages,
      nextCursor: last
        ? { lastMessageTs: String(last.ts), lastMessageId: last.messageId }
        : cursor,
      error: '',
    }
  }

  toEnvelope (message, chat) {
    const content = typeof message.content === 'string' ? message.content : ''
    return {
      channel: 'lark',
      chat: {
        id: chat.chatId,
        name: chat.name || '',
        type: chat.type === 'p2p' ? 'p2p' : 'group',
      },
      sender: senderOf(message.sender),
      messageId: String(message.message_id || ''),
      msgType: String(message.msg_type || 'text'),
      text: content,
      mentions: mentionIdsOf(message),
      threadId: typeof message.thread_id === 'string' ? message.thread_id : '',
      ts: Number(message.create_time) || 0,
      deleted: Boolean(message.deleted),
      updated: Boolean(message.updated),
    }
  }
}

export function describeLarkError (error) {
  if (error instanceof WorkbenchError) return error.message
  return messageOf(error)
}
