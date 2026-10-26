// dsh-workbench · HTTP API（前缀 /workbench）
//
// POST /workbench  body: { endpoint, payload } → { ok, value } | { ok:false, error }
// 认证：connection.admit；写操作再要求 x-dsh-workbench-client: 1。

import { WorkbenchError, toApiError, messageOf } from './errors.js'
import { testRule } from './rules.js'

const BODY_LIMIT = 1024 * 1024
const CLIENT_HEADER = 'x-dsh-workbench-client'

const WRITE_ENDPOINTS = new Set(['config.save', 'lark.check', 'github.check', 'history.clear'])

function json (res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function ok (value) {
  return { ok: true, value }
}

function fail (code, message) {
  return { ok: false, error: { code, message } }
}

function readBody (req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        reject(new WorkbenchError('internal', '请求体超过 1 MiB 上限'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function plainObject (value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {{ connection: any, engine: any, getConfig: () => object, saveConfig: (raw:object) => object, state: any, log: object }} deps
 */
export function createApiHandler ({ connection, engine, getConfig, saveConfig, state, log }) {
  function dispatch (endpoint, payload) {
    switch (endpoint) {
      case 'state':
        return ok({
          config: getConfig(),
          status: engine.status(),
          events: state.events(),
          stats: state.stats(),
        })
      case 'health':
        return ok(engine.health())
      case 'state.events':
        return ok({ events: state.events(), stats: state.stats() })
      case 'lark.chats': {
        return engine.lark.listChats().then((result) => ok({ chats: result.chats }))
      }
      case 'rules.test':
        return ok(testRule(payload || {}, getConfig(), { myOpenId: engine.auth.lark.openId }))
      case 'config.save': {
        const saved = saveConfig(payload?.config || {})
        if (!saved.ok) {
          throw new WorkbenchError('config/invalid', `配置未保存：${saved.errors.slice(0, 3).join('；')}`)
        }
        engine.applyConfig(saved.config)
        return ok({ config: saved.config, warnings: saved.warnings || [] })
      }
      case 'lark.check': {
        void engine.runLarkOnce({ manual: true }).catch((error) => log.error(`[api] 手动 Lark 轮询失败：${messageOf(error)}`))
        return ok({ started: true })
      }
      case 'github.check': {
        void engine.runGithubOnce({ manual: true }).catch((error) => log.error(`[api] 手动 GitHub 轮询失败：${messageOf(error)}`))
        return ok({ started: true })
      }
      case 'history.clear':
        state.clearEvents()
        return ok({ ok: true })
      default:
        throw new WorkbenchError('internal', `未知接口：${endpoint}`)
    }
  }

  return async function handler (req, res) {
    try {
      const admission = connection.admit(req)
      if (admission && 'rejection' in admission) {
        res.writeHead(admission.rejection, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
        return
      }
      if (req.method !== 'POST') {
        json(res, 405, fail('method/not-allowed', '只接受 POST'))
        return
      }

      const raw = await readBody(req)
      let body
      try { body = JSON.parse(raw) } catch { body = null }
      if (!plainObject(body) || typeof body.endpoint !== 'string' || !body.endpoint) {
        json(res, 400, fail('bad-request', '请求体必须是 { endpoint, payload }'))
        return
      }
      const endpoint = body.endpoint.trim()
      const payload = plainObject(body.payload) ? body.payload : {}

      if (WRITE_ENDPOINTS.has(endpoint) && req.headers[CLIENT_HEADER] !== '1') {
        json(res, 403, fail('auth/denied', '缺少客户端校验头'))
        return
      }

      const result = await dispatch(endpoint, payload)
      json(res, 200, result)
    } catch (error) {
      if (error instanceof WorkbenchError) {
        json(res, 200, fail(error.code, error.message))
        return
      }
      log.error(`[api] 未处理异常：${messageOf(error)}`)
      const mapped = toApiError(error)
      json(res, 200, fail(mapped.code, mapped.message))
    }
  }
}
