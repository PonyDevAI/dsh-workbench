// 语法门禁：对 lib/**/*.js 逐个跑 `node --check`。
//
// 为什么不用 import：lib/index.js 会 require 宿主服务、lib/client.js 是浏览器 bundle，
// 直接 import 需要桩；`node --check` 只解析不执行，能在零依赖下抓到语法错误。
//
// 用法：node scripts/check-syntax.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = join(ROOT, 'lib')

function walk (dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(full, out)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

if (!existsSync(LIB)) {
  console.error('FAIL  lib/ 目录不存在：Host / Client 代码尚未落地，语法门禁无从检查')
  process.exit(1)
}

const files = walk(LIB).sort()
if (files.length === 0) {
  console.error('FAIL  lib/ 下没有 .js 文件：Host / Client 代码尚未落地')
  process.exit(1)
}

const failures = []
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status === 0) continue
  failures.push({
    file: relative(ROOT, file).split(sep).join('/'),
    detail: ((result.stderr || result.stdout || '') + '').trim(),
  })
}

if (failures.length > 0) {
  console.error(`FAIL  syntax: ${failures.length}/${files.length} 个文件语法错误`)
  for (const failure of failures) {
    console.error('\n  ' + failure.file)
    for (const line of failure.detail.split('\n')) console.error('    ' + line)
  }
  process.exit(1)
}

console.log(`OK  syntax: ${files.length} 个 lib 文件通过 node --check`)
