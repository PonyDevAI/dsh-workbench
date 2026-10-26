// dsh-workbench · 离线 UI 渲染冒烟（test-render.html）
//
// 1) 静态校验：预览页存在、确实加载 ../lib/client.js、不含 console.error；
// 2) 可选可视校验：本机有 Chrome / Chromium 时用 headless 截图，确认页面能渲染出非空图片。
// 找不到浏览器不是失败（CI 用离线静态校验），但会明确提示。
//
// 用法：node scripts/render-test.mjs

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const htmlPath = join(root, 'test-render.html')
const clientPath = join(root, 'lib', 'client.js')
const problems = []

if (!existsSync(htmlPath)) problems.push('缺少 test-render.html')
if (!existsSync(clientPath)) problems.push('缺少 lib/client.js')

if (!problems.length) {
  const html = readFileSync(htmlPath, 'utf8')
  if (!/lib\/client\.js/.test(html)) problems.push('test-render.html 未加载 lib/client.js')
  if (/console\.error\s*\(/.test(html)) problems.push('test-render.html 含 console.error（预览页要求 0 控制台错误）')
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const chrome = chromeCandidates.find((candidate) => existsSync(candidate))
let rendered = 'skipped（未找到 Chrome/Chromium）'
let workDir = ''

if (!problems.length && chrome) {
  workDir = mkdtempSync(join(tmpdir(), 'wb-render-'))
  const shot = join(workDir, 'preview.png')
  const profile = join(workDir, 'profile')
  const url = pathToFileURL(htmlPath).href
  const result = spawnSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--user-data-dir=' + profile,
    '--window-size=1280,900',
    '--screenshot=' + shot,
    url,
  ], { timeout: 45_000, encoding: 'utf8' })
  if (result.status !== 0 && !existsSync(shot)) {
    problems.push(`Chrome headless 截图失败：${(result.stderr || '').split('\n')[0] || 'unknown'}`)
  } else if (!existsSync(shot) || statSync(shot).size < 10_000) {
    problems.push('截图像素为空或过小（页面可能没渲染）')
  } else {
    rendered = `ok（${Math.round(statSync(shot).size / 1024)} KB）`
  }
  try { rmSync(workDir, { recursive: true, force: true }) } catch { /* 忽略清理失败 */ }
}

if (problems.length) {
  console.error('FAIL  render-test:')
  for (const problem of problems) console.error('  - ' + problem)
  process.exit(1)
}

console.log('OK  render-test: test-render.html 静态校验通过；headless 渲染 ' + rendered)
