// dsh-workbench · 账号授权与 token 生命周期
//
// 飞书：Device Flow（设备码/链接）→ user token + refresh token；提前 5 分钟刷新；
// 401 或刷新失败 → 账号标 needs_auth，等用户在 UI 重新授权（不静默续授）。
// GitHub：PAT（v0.2.0），校验后存凭据层。
//
// 并发：同一账号同一时刻只允许一个刷新请求（Promise 单飞）。

import { run } from './shell.js'
import { WorkbenchError } from './errors.js'

const REFRESH_AHEAD_MS = 5 * 60 * 1000

function iso (ms) {
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : ''
}

export class AccountAuth {
  constructor ({ accounts, credentials, feishu, github, log, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.accounts = accounts
    this.credentials = credentials
    this.feishu = feishu
    this.github = github
    this.log = log || (() => {})
    this.now = now
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.sessions = new Map()
    this.refreshLocks = new Map()
  }

  // ---------------------------------------------------------------- 飞书 Device Flow

  async startFeishu ({ appId, appSecret, brand = 'feishu', scope = 'im:message', label = '' }) {
    if (typeof appId !== 'string' || !appId.trim()) throw new WorkbenchError('account/invalid-credentials', '缺少 appId')
    if (typeof appSecret !== 'string' || !appSecret.trim()) throw new WorkbenchError('account/invalid-credentials', '缺少 appSecret')
    const account = this.accounts.createFeishu({ appId: appId.trim(), brand, label })
    await this.accounts.setAppSecret(account.id, appSecret.trim())
    try {
      const device = await this.feishu.deviceStart({ appId: account.appId, appSecret: appSecret.trim(), brand: account.brand, scope })
      const session = {
        accountId: account.id,
        appId: account.appId,
        appSecret: appSecret.trim(),
        brand: account.brand,
        deviceCode: device.deviceCode,
        interval: device.interval,
        expiresAt: this.now() + device.expiresIn * 1000,
        status: 'pending',
        error: '',
        timer: null,
      }
      this.sessions.set(account.id, session)
      this.accounts.markStatus(account.id, 'pending_auth')
      this.schedule(session)
      return {
        accountId: account.id,
        userCode: device.userCode,
        verificationUri: device.verificationUriComplete || device.verificationUri,
        expiresIn: device.expiresIn,
        interval: device.interval,
      }
    } catch (error) {
      await this.accounts.remove(account.id)
      throw error
    }
  }

  schedule (session) {
    const delay = Math.max(2, session.interval) * 1000
    session.timer = this.setTimer(() => { void this.tick(session) }, delay)
    if (session.timer && typeof session.timer.unref === 'function') session.timer.unref()
  }

  async tick (session) {
    if (this.sessions.get(session.accountId) !== session) return
    if (this.now() > session.expiresAt) {
      await this.failSession(session, '授权超时，请重新发起')
      return
    }
    try {
      const result = await this.feishu.devicePoll({
        appId: session.appId, appSecret: session.appSecret, brand: session.brand, deviceCode: session.deviceCode,
      })
      if (result.status === 'pending') {
        if (result.interval) session.interval = result.interval
        this.schedule(session)
        return
      }
      if (result.status === 'error') {
        await this.failSession(session, result.error || '授权失败')
        return
      }
      await this.applyTokens(session.accountId, result.tokens)
      let identity = { name: '', openId: '', login: '', avatarUrl: '' }
      try {
        identity = await this.feishu.userInfo(result.tokens.accessToken, session.brand)
      } catch { /* 身份读取失败不阻塞授权 */ }
      this.accounts.setIdentity(session.accountId, identity)
      this.accounts.markStatus(session.accountId, 'ok')
      session.status = 'ok'
      this.sessions.delete(session.accountId)
    } catch (error) {
      await this.failSession(session, error instanceof WorkbenchError ? error.message : '授权轮询失败')
    }
  }

  async failSession (session, message) {
    const account = this.accounts.get(session.accountId)
    if (account) this.accounts.markStatus(session.accountId, 'needs_auth', message)
    session.status = 'error'
    session.error = message
    this.sessions.delete(session.accountId)
  }

  pollStatus (accountId) {
    const session = this.sessions.get(accountId)
    if (session) return { status: session.status, error: session.error }
    const account = this.accounts.get(accountId)
    if (!account) throw new WorkbenchError('account/not-found', '账号不存在')
    return { status: account.status === 'ok' ? 'ok' : (account.status === 'pending_auth' ? 'pending' : 'error'), error: account.lastError }
  }

  // ---------------------------------------------------------------- 飞书 token

  async applyTokens (accountId, tokens) {
    const now = this.now()
    await this.accounts.setTokens(accountId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scopes: Array.isArray(tokens.scopes) ? tokens.scopes : [],
      expiresAt: iso(now + (tokens.expiresIn || 7200) * 1000),
      refreshExpiresAt: iso(now + (tokens.refreshExpiresIn || 604800) * 1000),
    })
  }

  async feishuAccessToken (accountId) {
    const account = this.accounts.get(accountId)
    if (!account) throw new WorkbenchError('account/not-found', '账号不存在')
    if (account.status === 'needs_auth' || account.status === 'disabled') {
      throw new WorkbenchError('account/needs-auth', '账号需要重新授权')
    }
    const accessToken = await this.accounts.token(accountId, 'accessToken')
    if (!accessToken) {
      this.accounts.markStatus(accountId, 'needs_auth', '缺少 access token')
      throw new WorkbenchError('account/needs-auth', '账号需要重新授权')
    }
    const expiresAt = Date.parse(account.expiresAt || '') || 0
    if (!expiresAt || expiresAt - this.now() < REFRESH_AHEAD_MS) {
      const refreshed = await this.refreshFeishu(accountId)
      return refreshed.accessToken
    }
    return accessToken
  }

  async refreshFeishu (accountId) {
    if (this.refreshLocks.has(accountId)) return this.refreshLocks.get(accountId)
    const task = (async () => {
      const account = this.accounts.get(accountId)
      if (!account) throw new WorkbenchError('account/not-found', '账号不存在')
      const [appSecret, refreshToken] = await Promise.all([
        this.accounts.appSecret(accountId),
        this.accounts.token(accountId, 'refreshToken'),
      ])
      if (!appSecret || !refreshToken) {
        this.accounts.markStatus(accountId, 'needs_auth', '缺少应用凭据或 refresh token')
        throw new WorkbenchError('account/needs-auth', '账号需要重新授权')
      }
      const refreshExpiresAt = Date.parse(account.refreshExpiresAt || '') || 0
      if (refreshExpiresAt && this.now() >= refreshExpiresAt) {
        this.accounts.markStatus(accountId, 'needs_auth', 'refresh token 已过期')
        throw new WorkbenchError('account/needs-auth', '授权已过期，请重新授权')
      }
      try {
        const tokens = await this.feishu.refresh({ appId: account.appId, appSecret, brand: account.brand, refreshToken })
        await this.applyTokens(accountId, tokens)
        try {
          const identity = await this.feishu.userInfo(tokens.accessToken, account.brand)
          this.accounts.setIdentity(accountId, identity)
        } catch { /* 忽略身份刷新失败 */ }
        this.accounts.markStatus(accountId, 'ok')
        return tokens
      } catch (error) {
        this.accounts.markStatus(accountId, 'needs_auth', '刷新 token 失败')
        throw new WorkbenchError('account/needs-auth', '授权已失效，请重新授权')
      }
    })()
    this.refreshLocks.set(accountId, task)
    try {
      return await task
    } finally {
      this.refreshLocks.delete(accountId)
    }
  }

  /** 401 后强制刷新一次；失败即标 needs_auth。 */
  async forceRefreshFeishu (accountId) {
    return this.refreshFeishu(accountId)
  }

  // ---------------------------------------------------------------- GitHub

  async addGithub ({ token, label = '' }) {
    if (typeof token !== 'string' || !token.trim()) throw new WorkbenchError('account/invalid-credentials', '缺少 token')
    const info = await this.github.user(token.trim())
    const account = this.accounts.store.create('github', { label, authMethod: 'pat' })
    await this.accounts.setGithubToken(account.id, token.trim())
    this.accounts.setIdentity(account.id, { name: info.name, openId: '', login: info.login, avatarUrl: info.avatarUrl })
    this.accounts.store.update(account.id, { status: 'ok', scopes: info.scopes, lastCheckedAt: new Date().toISOString() })
    return account
  }

  async githubToken (accountId) {
    const account = this.accounts.get(accountId)
    if (!account) throw new WorkbenchError('account/not-found', '账号不存在')
    if (account.status === 'needs_auth' || account.status === 'disabled') {
      throw new WorkbenchError('account/needs-auth', '账号需要重新授权')
    }
    const token = await this.accounts.githubToken(accountId)
    if (!token) {
      this.accounts.markStatus(accountId, 'needs_auth', '缺少 GitHub token')
      throw new WorkbenchError('account/needs-auth', '账号需要重新授权')
    }
    return token
  }

  // ---------------------------------------------------------------- 测试 / 导入 / 清理

  async test (accountId) {
    const account = this.accounts.get(accountId)
    if (!account) throw new WorkbenchError('account/not-found', '账号不存在')
    if (account.provider === 'feishu') {
      const tokens = await this.refreshFeishu(accountId)
      const identity = await this.feishu.userInfo(tokens.accessToken, account.brand)
      this.accounts.setIdentity(accountId, identity)
      return { ok: true, status: 'ok', identity }
    }
    const token = await this.githubToken(accountId)
    const info = await this.github.user(token)
    this.accounts.setIdentity(accountId, { name: info.name, openId: '', login: info.login, avatarUrl: info.avatarUrl })
    this.accounts.store.update(accountId, { status: 'ok', lastCheckedAt: new Date().toISOString() })
    return { ok: true, status: 'ok', identity: info }
  }

  /** 一次性导入：只读 `gh auth token`，运行时不再依赖 gh。 */
  async importGh () {
    const result = await run('gh', ['auth', 'token'], { timeoutMs: 20_000 })
    const token = result.code === 0 ? result.stdout.trim() : ''
    if (!token) throw new WorkbenchError('account/import-failed', '未读取到 gh token')
    return this.addGithub({ token, label: 'GitHub（导入）' })
  }

  dispose () {
    for (const session of this.sessions.values()) {
      if (session.timer) this.clearTimer(session.timer)
    }
    this.sessions.clear()
  }
}
