// i18n 门禁（NS = dsh-workbench，client 文件 lib/client.js）：
//   1. 内联 DICT_ZH / DICT_EN 两个纯字面量对象的键集合必须完全一致；
//   2. 源码里 t('key') 用到的键必须在字典里定义；
//   3. locale/zh.json、locale/en.json 可解析，且 meta.title / meta.description 都存在；
//   4. client 里出现 NS 'dsh-workbench'（写错 NS 时设置页拿不到文案）。
//
// 字典解析方式：定位 `const DICT_ZH =` / `const DICT_EN =` 起点 → 按字符串感知的花括号配对截出
// 对象字面量 → `new Function` 求值。约定字典只含字符串键值，不引入第三方解析依赖。
//
// lib/client.js 由 Client 半区并行编写：文件缺失或格式不符时给出可执行的提示并非 0 退出，不抛裸栈。
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('..', import.meta.url)
const CLIENT = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const NS = 'dsh-workbench'
const DICT_NAMES = ['DICT_ZH', 'DICT_EN']

function fatal (lines) {
  lines.forEach((line, index) => console.error((index === 0 ? 'FAIL  ' : '      ') + line))
  process.exit(1)
}

// ---------------------------------------------------------------- 字典字面量解析
// 从 `const DICT_XX =` 之后截出完整的对象字面量文本；跳过字符串里的花括号与转义。
function extractLiteral (source, name) {
  const declaration = new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*')
  const match = declaration.exec(source)
  if (!match) {
    return { error: `未找到 ${name} 定义：请在 lib/client.js 里声明 \`const ${name} = { ... }\`（顶层或 factory 内均可）` }
  }
  let index = match.index + match[0].length
  while (index < source.length && /\s/.test(source[index])) index += 1
  if (source[index] !== '{') {
    return { error: `${name} 右侧不是对象字面量：只接受纯字符串键值对象（不要 Object.freeze / 变量拼接）` }
  }

  const start = index
  let depth = 0
  let quote = ''
  let escaped = false
  let closed = false
  for (; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        index += 1
        closed = true
        break
      }
    }
  }
  if (!closed) return { error: `${name} 的花括号不配对（对象字面量没有闭合）` }

  const literal = source.slice(start, index)
  let value
  try {
    value = new Function('"use strict"; return (' + literal + ')')()
  } catch (error) {
    return {
      error: `${name} 不是可求值的纯字面量：` + (error && error.message ? error.message : String(error)) +
        '\n      字典只允许字符串键和字符串值，不要引用变量 / 函数调用 / 展开语法。',
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: `${name} 求值结果不是普通对象` }
  }
  for (const [key, text] of Object.entries(value)) {
    if (typeof text !== 'string') return { error: `${name} 的键 '${key}' 的值不是字符串` }
  }
  return { value }
}

// ---------------------------------------------------------------- 入口
if (!existsSync(CLIENT)) {
  fatal([
    'i18n 检查需要 lib/client.js，但文件不存在。',
    '      Client 半区（内联 DICT_ZH / DICT_EN 的 ModuleLoader bundle）就绪后再跑。',
    '      本脚本只校验客户端字典与 locale 元数据，不依赖 Host / check-privacy / verify-plugin。',
  ])
}
const source = readFileSync(CLIENT, 'utf8')

const problems = []
const dictionaries = {}
for (const name of DICT_NAMES) {
  const result = extractLiteral(source, name)
  if (result.error) {
    console.error('FAIL  ' + result.error)
    process.exit(1)
  }
  dictionaries[name] = result.value
}

const [zhName, enName] = DICT_NAMES
const zh = dictionaries[zhName]
const en = dictionaries[enName]
const zhKeys = Object.keys(zh)
const enKeys = Object.keys(en)
const zhSet = new Set(zhKeys)
const enSet = new Set(enKeys)

if (zhKeys.length === 0) problems.push(`${zhName} 是空字典`)
if (enKeys.length === 0) problems.push(`${enName} 是空字典`)

for (const key of zhKeys) {
  if (!enSet.has(key)) problems.push(`${enName} 缺少键：${key}`)
}
for (const key of enKeys) {
  if (!zhSet.has(key)) problems.push(`${zhName} 缺少键：${key}`)
}

// ---------------------------------------------------------------- 源码 t('key') 用键
const used = new Set()
for (const match of source.matchAll(/\bt\s*\(\s*(['"`])([^'"`]+)\1/g)) {
  used.add(match[2])
}
for (const key of used) {
  if (!zhSet.has(key)) problems.push(`源码用到但字典缺失：t('${key}')`)
}

// ---------------------------------------------------------------- locale 元数据
for (const lang of ['zh', 'en']) {
  const relativePath = `locale/${lang}.json`
  const path = fileURLToPath(new URL('../' + relativePath, import.meta.url))
  if (!existsSync(path)) {
    problems.push(`缺少 ${relativePath}（需要 { "meta": { "title", "description" } }）`)
    continue
  }
  let data
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    problems.push(`${relativePath} 不是合法 JSON：` + (error && error.message ? error.message : error))
    continue
  }
  const meta = data && data.meta
  if (!meta || typeof meta !== 'object') {
    problems.push(`${relativePath} 缺少 meta 对象`)
    continue
  }
  for (const field of ['title', 'description']) {
    if (typeof meta[field] !== 'string' || meta[field].trim() === '') {
      problems.push(`${relativePath} 缺少 meta.${field}（非空字符串）`)
    }
  }
}

// ---------------------------------------------------------------- NS
// 必须是精确的字符串字面量 'dsh-workbench'（写成 'dsh-workbench-x' 或别的前缀不能通过）。
if (!/(['"`])dsh-workbench\1/.test(source)) {
  problems.push(`client 里没有精确的 i18n NS 字面量 '${NS}'（ctx.locale.register('${NS}', …) / locale: '${NS}' 是否写错？）`)
}

if (problems.length > 0) {
  console.error(`FAIL  i18n: ${problems.length} 处问题（NS ${NS}）`)
  for (const problem of problems) console.error('  ' + problem)
  process.exit(1)
}

console.log(`OK  i18n: ${NS} · zh ${zhKeys.length} 键 / en ${enKeys.length} 键，源码用键 ${used.size} 个全部存在，locale 元数据齐全`)
