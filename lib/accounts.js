// dsh-workbench · 账号存储与视图
//
// accounts.json 只存非机密元数据（provider / 身份 / 状态 / 过期时间 / scope）；
// appSecret / accessToken / refreshToken / PAT 全在 CredentialStore。
// 对外视图只给 configuredKeys（字段名），永不回明文。

import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { ensurePrivateDir, readJsonFile, writeJsonAtomic } from './store.js'

const ACCOUNTS_VERSION = 1
const PROVIDERS = new Set(['feishu', 'github'])

function newId () {
  return `acc_${randomBytes(6).toString('hex')}`
}

function text (value, max = 200) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export class AccountsStore {
  constructor ({ stateDir, log } = {}) {
    this.file = join(stateDir, 'accounts.json')
    this.log = log || (() => {})
    this.data = { version: ACCOUNTS_VERSION, accounts: [] }
  }

  load () {
    ensurePrivateDir(this.file.slice(0, this.file.lastIndexOf('/')))
    const { value, corrupt } = readJsonFile(this.file, null)
    if (corrupt) this.log('[accounts] accounts.json 损坏，已备份并回落空表')
    if (value && typeof value === 'object' && Array.isArray(value.accounts)) {
      this.data = { version: ACCOUNTS_VERSION, accounts: value.accounts.filter((item) => item && typeof item.id === 'string') }
    }
    return this
  }

  save () {
    writeJsonAtomic(this.file, this.data)
  }

  list () {
    return this.data.accounts.slice()
  }

  get (id) {
    return this.data.accounts.find((item) => item.id === id)
  }

  byProvider (provider) {
    return this.data.accounts.filter((item) => item.provider === provider)
  }

  create (provider, patch) {
    if (!PROVIDERS.has(provider)) throw new Error(`未知 provider：${provider}`)
    const now = new Date().toISOString()
    const account = {
      id: newId(),
      provider,
      label: text(patch.label, 40) || (provider === 'feishu' ? 'Lark / 飞书' : 'GitHub'),
      appId: text(patch.appId, 120),
      brand: patch.brand === 'lark' ? 'lark' : 'feishu',
      authMethod: provider === 'github' ? (patch.authMethod === 'device' ? 'device' : 'pat') : 'user_oauth',
      identity: { name: '', openId: '', login: '', avatarUrl: '' },
      status: 'pending_auth',
      scopes: [],
      expiresAt: '',
      refreshExpiresAt: '',
      lastCheckedAt: '',
      lastError: '',
      createdAt: now,
    }
    this.data.accounts.push(account)
    this.save()
    return account
  }

  update (id, patch) {
    const account = this.get(id)
    if (!account) return undefined
    Object.assign(account, patch, { identity: { ...account.identity, ...(patch.identity || {}) } })
    this.save()
    return account
  }

  remove (id) {
    const index = this.data.accounts.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.data.accounts.splice(index, 1)
    this.save()
    return true
  }
}

export class AccountsService {
  constructor ({ store, credentials, log } = {}) {
    this.store = store
    this.credentials = credentials
    this.log = log || (() => {})
  }

  accounts () {
    return this.store.list()
  }

  get (id) {
    return this.store.get(id)
  }

  byProvider (provider) {
    return this.store.byProvider(provider)
  }

  async view (account) {
    if (!account) return null
    const configuredKeys = await this.credentials.configuredKeys(account.id)
    return {
      id: account.id,
      provider: account.provider,
      label: account.label,
      appId: account.appId,
      brand: account.brand,
      authMethod: account.authMethod,
      identity: { ...account.identity },
      status: account.status,
      scopes: Array.isArray(account.scopes) ? account.scopes.slice(0, 20) : [],
      expiresAt: account.expiresAt,
      refreshExpiresAt: account.refreshExpiresAt,
      lastCheckedAt: account.lastCheckedAt,
      lastError: account.lastError,
      configuredKeys,
      createdAt: account.createdAt,
    }
  }

  async views () {
    const out = []
    for (const account of this.store.list()) out.push(await this.view(account))
    return out
  }

  createFeishu ({ appId, appSecret, brand, label }) {
    return this.store.create('feishu', { appId, brand, label })
  }

  async setAppSecret (accountId, appSecret) {
    await this.credentials.set(accountId, 'appSecret', appSecret)
  }

  async appSecret (accountId) {
    return this.credentials.get(accountId, 'appSecret')
  }

  async setTokens (accountId, { accessToken, refreshToken, scopes, expiresAt, refreshExpiresAt }) {
    if (accessToken) await this.credentials.set(accountId, 'accessToken', accessToken)
    if (refreshToken) await this.credentials.set(accountId, 'refreshToken', refreshToken)
    return this.store.update(accountId, {
      ...(Array.isArray(scopes) ? { scopes } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
    })
  }

  async token (accountId, field = 'accessToken') {
    return this.credentials.get(accountId, field)
  }

  async setGithubToken (accountId, token) {
    await this.credentials.set(accountId, 'token', token)
  }

  async githubToken (accountId) {
    return this.credentials.get(accountId, 'token')
  }

  markStatus (accountId, status, lastError = '') {
    return this.store.update(accountId, { status, lastError: text(lastError, 160), lastCheckedAt: new Date().toISOString() })
  }

  setIdentity (accountId, identity) {
    return this.store.update(accountId, { identity })
  }

  async remove (accountId) {
    await this.credentials.clear(accountId)
    return this.store.remove(accountId)
  }
}
