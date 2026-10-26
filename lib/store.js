// dsh-workbench · 私有目录与原子 JSON 存储
//
// 约定：目录 0700、文件 0600、tmp + fsync + rename；损坏先备份 .corrupt-<ts>-<pid> 再回落。

import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync,
} from 'node:fs'
import { join } from 'node:path'

export function ensurePrivateDir (dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  try { chmodSync(dir, 0o700) } catch { /* 非 POSIX 忽略 */ }
}

/** 读取 JSON；损坏时备份并返回 fallback。 */
export function readJsonFile (path, fallback = null) {
  if (!existsSync(path)) return { value: fallback, corrupt: false }
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), corrupt: false }
  } catch {
    const backup = `${path}.corrupt-${Date.now()}-${process.pid}`
    try { renameSync(path, backup) } catch { /* 备份失败不阻塞 */ }
    return { value: fallback, corrupt: true, backup }
  }
}

/** 原子写入 JSON：同目录 tmp → fsync → rename，权限 0600。 */
export function writeJsonAtomic (path, value) {
  const dir = path.slice(0, path.lastIndexOf('/')) || '.'
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = join(dir, `.${path.slice(path.lastIndexOf('/') + 1)}.${process.pid}.${Date.now()}.tmp`)
  const body = JSON.stringify(value, null, 2) + '\n'
  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, body)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try { chmodSync(tmp, 0o600) } catch { /* 忽略 */ }
  renameSync(tmp, path)
  try { chmodSync(path, 0o600) } catch { /* 忽略 */ }
  return path
}

/** 删除文件（不存在则忽略）。 */
export function removeFile (path) {
  try { rmSync(path, { force: true }) } catch { /* 忽略 */ }
}
