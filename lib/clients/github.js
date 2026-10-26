// dsh-workbench · GitHub 客户端（原生 REST，PAT）
//
// 只读：校验身份（GET /user）与列 open PR。
// v0.3 再加 compare / issue comment（评论属于出站动作，需显式开关）。

import { WorkbenchError } from '../errors.js'

const API = 'https://api.github.com'
const HEADERS = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'dsh-workbench',
}

export class GithubClient {
  constructor ({ http, log } = {}) {
    this.http = http
    this.log = log || (() => {})
  }

  async user (token) {
    const result = await this.http.request(`${API}/user`, {
      headers: { ...HEADERS, authorization: `Bearer ${token}` },
      retries: 0,
    })
    const data = result.json || {}
    if (!data.login) throw new WorkbenchError('account/invalid-token', 'GitHub token 无效')
    return {
      login: String(data.login),
      name: String(data.name || ''),
      avatarUrl: String(data.avatar_url || ''),
      scopes: String(result.headers.get('x-oauth-scopes') || '').split(',').map((item) => item.trim()).filter(Boolean),
    }
  }

  async listPulls (token, repo) {
    const params = new URLSearchParams({ state: 'open', sort: 'updated', direction: 'desc', per_page: '50' })
    const result = await this.http.request(`${API}/repos/${repo}/pulls?${params.toString()}`, {
      headers: { ...HEADERS, authorization: `Bearer ${token}` },
      retries: 0,
    })
    const list = Array.isArray(result.json) ? result.json : []
    return {
      pulls: list.map((pull) => ({
        repo,
        number: Number(pull.number) || 0,
        title: typeof pull.title === 'string' ? pull.title : '',
        url: typeof pull.html_url === 'string' ? pull.html_url : '',
        draft: Boolean(pull.draft),
        labels: Array.isArray(pull.labels) ? pull.labels.map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean) : [],
        headSha: typeof pull.head?.sha === 'string' ? pull.head.sha : '',
        baseSha: typeof pull.base?.sha === 'string' ? pull.base.sha : '',
        updatedAt: typeof pull.updated_at === 'string' ? pull.updated_at : '',
        author: typeof pull.user?.login === 'string' ? pull.user.login : '',
      })).filter((pull) => pull.number > 0),
    }
  }
}
