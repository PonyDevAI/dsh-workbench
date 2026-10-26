// dsh-workbench · GitHub 渠道（账号 PAT + 原生 REST 轮询）
//
// 只读：列 open PR。PAT 无法刷新；401 直接标 needs_auth，等用户重新填 token。

import { HttpError } from '../http.js'
import { WorkbenchError } from '../errors.js'

export class GithubChannel {
  constructor ({ accounts, auth, config, github, log } = {}) {
    this.id = 'github'
    this.accounts = accounts
    this.auth = auth
    this.config = config
    this.github = github
    this.log = log || (() => {})
  }

  setConfig (config) {
    this.config = config
  }

  get accountId () {
    return this.config?.channels?.github?.accountId || ''
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
    if (!account) return { ok: false, user: '', message: '未连接账号' }
    return {
      ok: account.status === 'ok',
      user: account.identity?.login || '',
      message: account.status === 'ok' ? 'ready' : (account.lastError || '需要授权'),
    }
  }

  async listPulls (repo) {
    const accountId = this.accountId
    if (!accountId) throw new WorkbenchError('account/not-found', '未连接 GitHub 账号')
    const token = await this.auth.githubToken(accountId)
    try {
      return await this.github.listPulls(token, repo)
    } catch (error) {
      if (error instanceof HttpError && error.code === 'auth') {
        this.accounts.markStatus(accountId, 'needs_auth', 'GitHub token 失效，请重新填写')
        throw new WorkbenchError('account/needs-auth', 'GitHub 账号需要重新授权')
      }
      throw error
    }
  }
}
