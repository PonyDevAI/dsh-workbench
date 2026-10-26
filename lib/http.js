// dsh-workbench · 轻量 HTTP 客户端
//
// 只做：JSON / form 请求、超时、错误归类（auth / rate-limit / network / unknown）、
// 有限重试与退避。不记录请求头与响应正文（避免 token 进入日志）。
//
// 错误归类约定：
//   auth       401/403（或 OAuth invalid_grant）→ 上层标 needs_auth，不重试
//   rate-limit 429 / GitHub 403 + x-ratelimit-remaining: 0 → 退避
//   network    连接失败/超时 → 有限重试
//   unknown    其余

import { WorkbenchError } from './errors.js'

const DEFAULT_TIMEOUT = 20_000
const RETRYABLE = new Set(['network', 'rate-limit'])

export class HttpError extends WorkbenchError {
  constructor (code, message, { status = 0, retryAfterMs = 0, body = '' } = {}) {
    super(code, message)
    this.name = 'HttpError'
    this.status = status
    this.retryAfterMs = retryAfterMs
    this.body = typeof body === 'string' ? body.slice(0, 300) : ''
  }
}

function parseRetryAfter (value) {
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 120) * 1000
  return 0
}

function classify (status, headers) {
  if (status === 401) return 'auth'
  if (status === 429) return 'rate-limit'
  if (status === 403) {
    // GitHub 限流用 403 + x-ratelimit-remaining: 0；其余 403 视为权限/授权问题。
    if (headers && typeof headers.get === 'function' && headers.get('x-ratelimit-remaining') === '0') return 'rate-limit'
    return 'auth'
  }
  return 'unknown'
}

export function createHttpClient ({ fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT, log } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node 没有 fetch，无法创建 HTTP 客户端')
  }

  async function once (url, options) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || timeoutMs)
    let response
    try {
      response = await fetchImpl(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      })
    } catch (error) {
      const timedOut = error && (error.name === 'AbortError' || /aborted/i.test(String(error.message)))
      throw new HttpError('network', timedOut ? '请求超时' : '网络请求失败', { status: 0 })
    } finally {
      clearTimeout(timer)
    }

    const text = await response.text()
    const contentType = response.headers.get('content-type') || ''
    let json
    if (contentType.includes('application/json') || text.trim().startsWith('{')) {
      try { json = JSON.parse(text) } catch { json = undefined }
    }

    if (!response.ok) {
      const code = classify(response.status, response.headers)
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
      const message = json?.error_description || json?.message || json?.error || `HTTP ${response.status}`
      throw new HttpError(code, String(message).slice(0, 140), { status: response.status, retryAfterMs, body: text })
    }
    return { status: response.status, headers: response.headers, text, json }
  }

  /**
   * @param {string} url
   * @param {{ method?: string, headers?: object, json?: any, form?: Record<string,string>, timeoutMs?: number, retries?: number }} [options]
   */
  async function request (url, options = {}) {
    const method = (options.method || 'GET').toUpperCase()
    const headers = { ...(options.headers || {}) }
    let body = options.body
    if (options.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded'
      body = new URLSearchParams(options.form).toString()
    } else if (options.json !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(options.json)
    }
    const retries = Number.isFinite(options.retries) ? options.retries : 1
    let lastError
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await once(url, { method, headers, body, timeoutMs: options.timeoutMs })
      } catch (error) {
        lastError = error
        const retryable = error instanceof HttpError && RETRYABLE.has(error.code)
        if (!retryable || attempt >= retries) throw error
        const delay = error.code === 'rate-limit' && error.retryAfterMs ? error.retryAfterMs : 400 * (attempt + 1)
        if (log) log(`[http] ${method} 失败（${error.code}），${delay}ms 后重试`)
        await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 5000)))
      }
    }
    throw lastError
  }

  return { request }
}
