// dsh-workbench · 子进程封装
//
// 只用 execFile（不经 shell、不拼字符串命令），带超时与输出上限。
// 非 0 退出不抛异常，返回 { code, stdout, stderr }，由调用方归类错误。

import { execFile } from 'node:child_process'

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeoutMs?: number, maxBuffer?: number, env?: Record<string,string> }} [options]
 * @returns {Promise<{ code: number, stdout: string, stderr: string, timedOut: boolean, error?: string }>}
 */
export function run (command, args = [], options = {}) {
  const timeout = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT
  return new Promise((resolve) => {
    execFile(command, args, {
      timeout,
      maxBuffer: options.maxBuffer || DEFAULT_MAX_BUFFER,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      const timedOut = Boolean(error && (error.killed || error.signal === 'SIGTERM'))
      resolve({
        code: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        timedOut,
        error: error ? String(error.message || error) : undefined,
      })
    })
  })
}

/** 解析 stdout 为 JSON；失败返回 undefined。 */
export function parseJson (text) {
  if (typeof text !== 'string') return undefined
  const trimmed = text.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    const first = trimmed.indexOf('{')
    const last = trimmed.lastIndexOf('}')
    if (first >= 0 && last > first) {
      try { return JSON.parse(trimmed.slice(first, last + 1)) } catch { /* 继续返回 undefined */ }
    }
    return undefined
  }
}
