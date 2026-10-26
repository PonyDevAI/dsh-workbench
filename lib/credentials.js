// dsh-workbench · 凭据桥
//
// 优先 ctx.credentials（宿主保险库）；没有该服务时退回 $DSH_HOME/workbench/secrets.json（0600）。
// key 约定：dsh-workbench/<accountId>/<field>
//
// 硬约束：明文只在这一层与调用方内存里；accounts.json / 日志 / API 回包永远只有 configuredKeys。

import { join } from 'node:path'
import { ensurePrivateDir, readJsonFile, writeJsonAtomic } from './store.js'

const PREFIX = 'dsh-workbench'
const FIELDS = ['appSecret', 'accessToken', 'refreshToken', 'token']

function isPlainObject (value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function credentialRef (accountId, field) {
  return `${PREFIX}/${accountId}/${field}`
}

export class CredentialStore {
  constructor ({ ctx, stateDir, log } = {}) {
    this.ctx = ctx
    this.stateDir = stateDir
    this.log = log || (() => {})
    this.file = stateDir ? join(stateDir, 'secrets.json') : ''
    this.fallback = null
  }

  get service () {
    try {
      return typeof this.ctx?.get === 'function' ? this.ctx.get('credentials') : undefined
    } catch {
      return undefined
    }
  }

  get usesHostService () {
    const service = this.service
    return Boolean(service && typeof service.set === 'function' && typeof service.resolve === 'function')
  }

  loadFallback () {
    if (this.fallback) return this.fallback
    ensurePrivateDir(this.stateDir)
    const { value } = readJsonFile(this.file, null)
    this.fallback = isPlainObject(value) && isPlainObject(value.secrets) ? value : { version: 1, secrets: {} }
    return this.fallback
  }

  saveFallback () {
    if (!this.fallback) return
    ensurePrivateDir(this.stateDir)
    writeJsonAtomic(this.file, this.fallback)
  }

  /** 写入 secret；空值 = 删除。 */
  async set (accountId, field, value) {
    if (!FIELDS.includes(field)) throw new Error(`未知凭据字段：${field}`)
    const ref = credentialRef(accountId, field)
    if (this.usesHostService) {
      if (value) await this.service.set(ref, value)
      else if (typeof this.service.unset === 'function') await this.service.unset(ref)
      return ref
    }
    const state = this.loadFallback()
    if (value) state.secrets[ref] = value
    else delete state.secrets[ref]
    this.saveFallback()
    return ref
  }

  async get (accountId, field) {
    const ref = credentialRef(accountId, field)
    if (this.usesHostService) {
      try {
        const value = await this.service.resolve(ref)
        return typeof value === 'string' && value ? value : undefined
      } catch {
        return undefined
      }
    }
    const value = this.loadFallback().secrets[ref]
    return typeof value === 'string' && value ? value : undefined
  }

  async unset (accountId, field) {
    const ref = credentialRef(accountId, field)
    if (this.usesHostService) {
      try { if (typeof this.service.unset === 'function') await this.service.unset(ref) } catch { /* 忽略 */ }
      return
    }
    const state = this.loadFallback()
    if (ref in state.secrets) {
      delete state.secrets[ref]
      this.saveFallback()
    }
  }

  /** 账号退出：清掉已知字段。 */
  async clear (accountId) {
    for (const field of FIELDS) await this.unset(accountId, field)
  }

  /** 已配置字段名（只回字段名，不回值）。 */
  async configuredKeys (accountId) {
    const keys = []
    for (const field of FIELDS) {
      const value = await this.get(accountId, field)
      if (value) keys.push(field)
    }
    return keys
  }
}
