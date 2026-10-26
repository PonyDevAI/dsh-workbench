// dsh-workbench · GitHub 渠道（个人 token，轮询）
//
// 边界：v0.1 只读 open PR 列表与元数据；不评论、不 approve、不合并。
// 身份：gh CLI（PonyDevAI 个人 token）。
// 增量：poller 用 state 里每 PR 的 lastSeenSha 判断「新 PR / 新 commit」。

import { run, parseJson } from './shell.js'
import { WorkbenchError } from './errors.js'

const DEFAULT_TIMEOUT = 30_000
const JQ = '[.[]|{number,title,html_url,draft,labels:[.labels[].name],head:.head.sha,updated_at,author:.user.login}]'

export class GithubAdapter {
  constructor ({ binary = 'gh', log, timeoutMs = DEFAULT_TIMEOUT } = {}) {
    this.id = 'github'
    this.label = 'GitHub'
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
    const result = await this.exec(['api', 'user', '--jq', '.login'])
    if (result.code !== 0) {
      return { ok: false, user: '', message: 'gh 未登录或不可用' }
    }
    return { ok: true, user: result.stdout.trim(), message: 'logged in' }
  }

  async listPulls (repo) {
    const path = `repos/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=50`
    const result = await this.exec(['api', path, '--jq', JQ], { timeoutMs: 45_000 })
    if (result.code !== 0) {
      const stderr = String(result.stderr || '')
      if (/authentication|logged in|credential/i.test(stderr)) {
        throw new WorkbenchError('github/not-configured', 'gh 未登录，无法读取 PR')
      }
      if (/Not Found|404/i.test(stderr)) {
        throw new WorkbenchError('github/repo-not-found', `仓库不可访问：${repo}`)
      }
      throw new WorkbenchError('github/poll-failed', result.timedOut ? '读取 PR 超时' : `读取 PR 失败：${repo}`)
    }
    const list = parseJson(result.stdout)
    if (!Array.isArray(list)) {
      throw new WorkbenchError('github/poll-failed', `PR 列表格式异常：${repo}`)
    }
    return {
      ok: true,
      pulls: list.map((pull) => ({
        repo,
        number: Number(pull.number) || 0,
        title: typeof pull.title === 'string' ? pull.title : '',
        url: typeof pull.html_url === 'string' ? pull.html_url : '',
        draft: Boolean(pull.draft),
        labels: Array.isArray(pull.labels) ? pull.labels.filter((label) => typeof label === 'string') : [],
        headSha: typeof pull.head === 'string' ? pull.head : '',
        updatedAt: typeof pull.updated_at === 'string' ? pull.updated_at : '',
        author: typeof pull.author === 'string' ? pull.author : '',
      })).filter((pull) => pull.number > 0),
    }
  }
}
