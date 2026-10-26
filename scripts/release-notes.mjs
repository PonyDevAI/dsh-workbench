// 从 CHANGELOG.md 提取当前版本条目，作为 GitHub Release 正文。
//
// 约定：
// - CHANGELOG 每个版本一行标题，版本号必须与 package.json 一致，形如：
//     `## 0.1.0 — 2026-10-26` / `## 0.1.0 - 2026-10-26` / `## 0.1.0 (unreleased)`
//   （日期分隔符 `—` 或 `-` 都接受；`(unreleased)` 允许出现在标题任意位置）
// - Release 正文 = 当前版本标题之后、下一个 `## ` 标题之前的正文，不手写；
// - 找不到当前版本条目 / 条目正文为空 → 退出码 1，发布流程直接失败。
//
// 用法：node scripts/release-notes.mjs [输出路径]
//   无参数 → 正文写到 stdout（不额外打印日志，方便管道）；
//   带参数 → 写文件，并在 stdout 打印一行结果。
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)

let pkg
try {
  pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
} catch (error) {
  console.error('FAIL  读不到 package.json：' + (error && error.message ? error.message : error))
  process.exit(1)
}
const version = String(pkg.version || '')
if (!version) {
  console.error('FAIL  package.json 缺少 version')
  process.exit(1)
}

let changelog
try {
  changelog = readFileSync(new URL('CHANGELOG.md', root), 'utf8')
} catch {
  console.error('FAIL  CHANGELOG.md 不存在：每个版本必须有发布说明')
  process.exit(1)
}

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const headingRe = new RegExp('^##\\s+' + escapeRe(version) + '(?:\\s|$)')

const lines = changelog.split('\n')
let start = -1
for (let i = 0; i < lines.length; i++) {
  // 标题：## <version> [—|-|–] <date> [(unreleased)]；只按版本号精确匹配。
  if (headingRe.test(lines[i].trim())) {
    start = i
    break
  }
}

if (start === -1) {
  console.error(`FAIL  CHANGELOG.md 缺少当前版本 ## ${version} 条目（版本号必须与 package.json 一致）`)
  process.exit(1)
}

let end = lines.length
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s+/.test(lines[i].trim())) {
    end = i
    break
  }
}
const body = lines.slice(start + 1, end).join('\n').trim()
if (!body) {
  console.error(`FAIL  CHANGELOG.md 中 ## ${version} 条目正文为空`)
  process.exit(1)
}

const out = process.argv[2]
if (out) {
  writeFileSync(out, body + '\n')
  console.log(`release notes → ${out}（版本 ${version}，${body.split('\n').length} 行）`)
} else {
  process.stdout.write(body + '\n')
}
