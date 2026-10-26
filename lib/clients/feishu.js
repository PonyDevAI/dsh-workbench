// dsh-workbench · 飞书 / Lark 客户端（原生 HTTP，user_access_token）
//
// 端点与参数已按 larksuite/cli v1.0.87 源码核对：
//   device_authorization: {accounts}/oauth/v1/device_authorization （Basic appId:appSecret）
//   token:  {open}/open-apis/authen/v2/oauth/token
//   user:   {open}/open-apis/authen/v1/user_info
//   chats:  {open}/open-apis/im/v1/chats
//   msgs:   {open}/open-apis/im/v1/messages
//
// 只做协议与解析；token 生命周期在 account-auth.js。

import { WorkbenchError } from '../errors.js'
import { HttpError } from '../http.js'

const BRANDS = {
  feishu: { accounts: 'https://accounts.feishu.cn', open: 'https://open.feishu.cn' },
  lark: { accounts: 'https://accounts.larksuite.com', open: 'https://open.larksuite.com' },
}

function endpoints (brand) {
  return BRANDS[brand === 'lark' ? 'lark' : 'feishu']
}

function basicAuth (appId, appSecret) {
  return 'Basic ' + Buffer.from(`${appId}:${appSecret}`).toString('base64')
}

function num (value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 把飞书消息 body.content（JSON 字符串）渲染成可读文本。 */
export function renderContent (msgType, content) {
  if (typeof content !== 'string' || !content) return ''
  let parsed
  try { parsed = JSON.parse(content) } catch { return content.slice(0, 400) }
  if (!parsed || typeof parsed !== 'object') return String(content).slice(0, 400)
  if (msgType === 'text' && typeof parsed.text === 'string') return parsed.text
  if (msgType === 'post') {
    const locales = ['zh_cn', 'en_us', 'ja_jp']
    for (const key of locales) {
      const block = parsed[key]
      if (block && Array.isArray(block.content)) {
        const lines = []
        if (typeof block.title === 'string' && block.title) lines.push(block.title)
        for (const line of block.content) {
          if (!Array.isArray(line)) continue
          const text = line.map((node) => {
            if (node && node.tag === 'text' && typeof node.text === 'string') return node.text
            if (node && node.tag === 'a' && typeof node.text === 'string') return node.text
            if (node && node.tag === 'at' && typeof node.user_name === 'string') return '@' + node.user_name
            return ''
          }).join('')
          if (text) lines.push(text)
        }
        if (lines.length) return lines.join('\n')
      }
    }
    return '[富文本消息]'
  }
  if (msgType === 'image') return '[图片]'
  if (msgType === 'file' || msgType === 'folder') return '[文件]'
  if (msgType === 'audio') return '[语音]'
  if (msgType === 'media') return '[视频]'
  if (msgType === 'sticker') return '[表情]'
  if (msgType === 'interactive') return '[卡片消息]'
  return typeof parsed.text === 'string' ? parsed.text : `[${msgType || '消息'}]`
}

export class FeishuClient {
  constructor ({ http, log } = {}) {
    this.http = http
    this.log = log || (() => {})
  }

  async deviceStart ({ appId, appSecret, brand, scope }) {
    const ep = endpoints(brand)
    const scopes = `${scope || 'im:message'} offline_access`.replace(/\s+/g, ' ').trim()
    const result = await this.http.request(`${ep.accounts}/oauth/v1/device_authorization`, {
      method: 'POST',
      headers: { authorization: basicAuth(appId, appSecret) },
      form: { client_id: appId, scope: scopes },
    })
    const data = result.json || {}
    if (!data.device_code) {
      throw new WorkbenchError('account/device-failed', data.error_description || '飞书未返回 device_code')
    }
    return {
      deviceCode: String(data.device_code),
      userCode: String(data.user_code || ''),
      verificationUri: String(data.verification_uri || ''),
      verificationUriComplete: String(data.verification_uri_complete || data.verification_uri || ''),
      expiresIn: num(data.expires_in, 240),
      interval: Math.max(2, num(data.interval, 5)),
      scope: scopes,
    }
  }

  /** @returns {{ status:'pending'|'ok'|'error', tokens?:object, interval?:number, error?:string }} */
  async devicePoll ({ appId, appSecret, brand, deviceCode }) {
    const ep = endpoints(brand)
    try {
      const result = await this.http.request(`${ep.open}/open-apis/authen/v2/oauth/token`, {
        method: 'POST',
        form: {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: appId,
          client_secret: appSecret,
        },
        retries: 0,
      })
      const data = result.json || {}
      if (data.access_token) {
        return {
          status: 'ok',
          tokens: {
            accessToken: String(data.access_token),
            refreshToken: String(data.refresh_token || ''),
            expiresIn: num(data.expires_in, 7200),
            refreshExpiresIn: num(data.refresh_token_expires_in, 604800),
            scopes: String(data.scope || '').split(/\s+/).filter(Boolean),
          },
        }
      }
      return { status: 'error', error: data.error_description || data.error || '授权失败' }
    } catch (error) {
      if (error instanceof HttpError) {
        let body
        try { body = JSON.parse(error.body || '{}') } catch { body = {} }
        const code = body.error || ''
        if (code === 'authorization_pending') return { status: 'pending' }
        if (code === 'slow_down') return { status: 'pending', interval: 10 }
        if (code === 'access_denied' || code === 'expired_token' || code === 'invalid_grant') {
          return { status: 'error', error: body.error_description || code }
        }
        if (error.code === 'auth') return { status: 'error', error: '应用凭据无效或 scope 未开通' }
      }
      throw error
    }
  }

  /** 刷新 user token；返回新 token 集合。 */
  async refresh ({ appId, appSecret, brand, refreshToken }) {
    const ep = endpoints(brand)
    const result = await this.http.request(`${ep.open}/open-apis/authen/v2/oauth/token`, {
      method: 'POST',
      json: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appId,
        client_secret: appSecret,
      },
      retries: 0,
    })
    const data = result.json || {}
    if (!data.access_token) {
      throw new WorkbenchError('account/refresh-failed', data.error_description || '刷新 token 失败')
    }
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token || refreshToken),
      expiresIn: num(data.expires_in, 7200),
      refreshExpiresIn: num(data.refresh_token_expires_in, 604800),
    }
  }

  async userInfo (accessToken, brand) {
    const ep = endpoints(brand)
    const result = await this.http.request(`${ep.open}/open-apis/authen/v1/user_info`, {
      headers: { authorization: `Bearer ${accessToken}` },
      retries: 0,
    })
    const data = result.json?.data || result.json || {}
    return {
      name: String(data.name || data.en_name || ''),
      openId: String(data.open_id || ''),
      unionId: String(data.union_id || ''),
      avatarUrl: String(data.avatar_url || data.avatar_big || ''),
    }
  }

  async listChats (accessToken, brand, { pageToken = '', pageSize = 100 } = {}) {
    const ep = endpoints(brand)
    const params = new URLSearchParams({ page_size: String(pageSize) })
    if (pageToken) params.set('page_token', pageToken)
    const result = await this.http.request(`${ep.open}/open-apis/im/v1/chats?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      retries: 0,
    })
    const data = result.json?.data || {}
    const chats = (Array.isArray(data.items) ? data.items : []).map((chat) => ({
      chatId: String(chat.chat_id || ''),
      name: String(chat.name || ''),
      type: chat.chat_mode === 'p2p' ? 'p2p' : 'group',
      memberCount: num(chat.member_count, 0),
    })).filter((chat) => chat.chatId)
    return { chats, hasMore: Boolean(data.has_more), pageToken: String(data.page_token || '') }
  }

  async listMessages (accessToken, brand, { chatId, startMs = 0, pageToken = '', pageSize = 50 }) {
    const ep = endpoints(brand)
    const params = new URLSearchParams({
      container_id_type: 'chat',
      container_id: chatId,
      page_size: String(pageSize),
      sort_type: 'ByCreateTimeAsc',
    })
    if (startMs > 0) params.set('start_time', String(startMs))
    if (pageToken) params.set('page_token', pageToken)
    const result = await this.http.request(`${ep.open}/open-apis/im/v1/messages?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      retries: 0,
    })
    const data = result.json?.data || {}
    const messages = (Array.isArray(data.items) ? data.items : []).map((message) => ({
      messageId: String(message.message_id || ''),
      msgType: String(message.msg_type || 'text'),
      createTime: num(message.create_time, 0),
      text: renderContent(String(message.msg_type || 'text'), message.body?.content),
      chatId: String(message.chat_id || chatId),
      sender: {
        id: String(message.sender?.id || ''),
        name: String(message.sender?.name || ''),
        isBot: message.sender?.sender_type === 'app' || message.sender?.sender_type === 'bot',
      },
      mentions: (Array.isArray(message.mentions) ? message.mentions : []).map((item) => {
        const id = item?.id
        if (typeof id === 'string') return id
        if (id && typeof id === 'object') return String(id.open_id || id.openId || '')
        return ''
      }).filter(Boolean),
      threadId: String(message.thread_id || ''),
      deleted: Boolean(message.deleted),
      updated: Boolean(message.updated),
    })).filter((message) => message.messageId)
    return { messages, hasMore: Boolean(data.has_more), pageToken: String(data.page_token || '') }
  }
}
