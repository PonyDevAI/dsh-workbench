// dsh-workbench · 日志与脱敏
//
// - 只写状态目录下的 workbench.log（0600），超过 1 MiB 轮转到 .1
// - 统一 redact()：不打印 token、cookie、authorization、消息正文
// - 所有调用都走 oneLine()，避免多行注入把日志搅乱

import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_LOG_BYTES = 1024 * 1024

export function oneLine (value, max = 500) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  const flat = text.replace(/[\r\n\t]+/g, ' ')
  return flat.length > max ? flat.slice(0, max) + '…' : flat
}

const SECRET_PATTERNS = [
  /(authorization:\s*)[^\s]+/gi,
  /(cookie:\s*)[^\n]+/gi,
  /(token["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /(secret["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /(app_secret["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi,
]

export function redact (value) {
  let text = oneLine(value)
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '$1<redacted>')
  return text
}

export function createLogger ({ stateDir, file = 'workbench.log' } = {}) {
  const path = stateDir ? join(stateDir, file) : ''

  function rotateIfNeeded () {
    if (!path) return
    try {
      if (existsSync(path) && statSync(path).size > MAX_LOG_BYTES) {
        renameSync(path, path + '.1')
      }
    } catch { /* 轮转失败不影响主流程 */ }
  }

  function write (level, message) {
    const line = `${new Date().toISOString()} ${level} ${redact(message)}\n`
    if (!path) return
    try {
      rotateIfNeeded()
      appendFileSync(path, line, { mode: 0o600 })
    } catch { /* 日志失败不影响业务 */ }
  }

  return {
    path,
    info: (message) => write('INFO ', message),
    warn: (message) => write('WARN ', message),
    error: (message) => write('ERROR', message),
  }
}
