// 插件标识 / 入口一致性校验（防「改包名、漏文件、改 patch id 后 DSH 起不来」）。
//
// 校验：
//   1. package.json：name / version / type / exports 指向的文件存在；
//      engines.dsh 含 `>=0.2.1-rc.2 <0.3.0`；dsh.manifestVersion === 1；dsh.bundle.patch 文件存在；
//   2. cordis.patch.yml：插件行 `id: workbench`、`name: '@ponydev/dsh-workbench'`；
//   3. lib/index.js 存在；
//   4. lib/client.js 存在时，ModuleLoader 注册 id 必须是完整包名（带 scope）。
//
// 用法：node scripts/verify-plugin.mjs（CI 与 npm run check 都会跑）
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('..', import.meta.url)
const ROOT_DIR = fileURLToPath(ROOT)
const PKG_NAME = '@ponydev/dsh-workbench'
const SLUG = 'workbench'

const fromRoot = (value) => fileURLToPath(new URL(value, ROOT))

let failures = 0
const ok = (name, condition, detail) => {
  if (condition) return
  failures += 1
  console.error('FAIL  ' + name + (detail === undefined ? '' : '\n  ' + JSON.stringify(detail)))
}
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) return
  failures += 1
  console.error('FAIL  ' + name + '\n  expected ' + b + '\n  actual   ' + a)
}
const read = (relativePath) => {
  try {
    return readFileSync(fromRoot(relativePath), 'utf8')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- package.json
let pkg = null
try {
  pkg = JSON.parse(read('package.json') || 'null')
} catch (error) {
  console.error('FAIL  package.json 不是合法 JSON：' + (error && error.message ? error.message : error))
  process.exit(1)
}
if (!pkg) {
  console.error('FAIL  读不到 package.json')
  process.exit(1)
}

eq('package.name = ' + PKG_NAME, pkg.name, PKG_NAME)
ok('package.version 是 semver', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(pkg.version || '')), pkg.version)
eq('package.type = module', pkg.type, 'module')

// exports 指向的文件必须存在（允许多层条件对象，逐层展开）
const exportMissing = []
function checkExports (value, keyPath) {
  if (typeof value === 'string') {
    if (!existsSync(fromRoot(value))) exportMissing.push({ export: keyPath, target: value })
    return
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) checkExports(child, keyPath + '.' + key)
    return
  }
  exportMissing.push({ export: keyPath, target: value })
}
ok('package.exports 存在', !!(pkg.exports && typeof pkg.exports === 'object' && Object.keys(pkg.exports).length > 0), pkg.exports)
if (pkg.exports) {
  for (const [key, value] of Object.entries(pkg.exports)) checkExports(value, key)
}
ok('package.exports 指向的文件都存在', exportMissing.length === 0, exportMissing)

const dsh = pkg.dsh || {}
const enginesDsh = String((pkg.engines && pkg.engines.dsh) || '').replace(/\s+/g, ' ')
ok("engines.dsh 含 '>=0.2.1-rc.2 <0.3.0'", enginesDsh.includes('>=0.2.1-rc.2 <0.3.0'), pkg.engines && pkg.engines.dsh)
eq('dsh.manifestVersion = 1', dsh.manifestVersion, 1)
const patchRelative = dsh.bundle && dsh.bundle.patch
ok('dsh.bundle.patch 已声明', typeof patchRelative === 'string' && patchRelative.length > 0, dsh.bundle)
ok('dsh.bundle.patch 指向的文件存在', typeof patchRelative === 'string' && existsSync(fromRoot(patchRelative)), patchRelative)

// ---------------------------------------------------------------- cordis.patch.yml
const patchText = read('cordis.patch.yml')
ok('cordis.patch.yml 存在', patchText !== null)
if (patchText !== null) {
  const insertRowRe = new RegExp('^\\s*-\\s*id:\\s*[\'"]?' + SLUG + '[\'"]?\\s*$', 'm')
  const insertNameRe = new RegExp('^\\s*name:\\s*[\'"]?' + PKG_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('/', '\\/') + '[\'"]?\\s*$', 'm')
  ok("cordis.patch.yml 含插件行 id: " + SLUG, insertRowRe.test(patchText))
  ok("cordis.patch.yml 含插件名 name: '" + PKG_NAME + "'", insertNameRe.test(patchText))
  const insertRows = [...patchText.matchAll(/^\s*-\s*id:\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map((m) => m[1])
  eq('cordis.patch.yml 只插入一行', insertRows, [SLUG])
}

// ---------------------------------------------------------------- lib 入口
ok('lib/index.js 存在', existsSync(fromRoot('lib/index.js')))
const clientSource = read('lib/client.js')
if (clientSource === null) {
  console.log('WARN  lib/client.js 尚未就绪，跳过 ModuleLoader id 校验（Client 半区交付后必须通过）')
} else {
  ok(
    "lib/client.js 的 ModuleLoader id = '" + PKG_NAME + "'",
    new RegExp("id:\\s*['\"]" + PKG_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('/', '\\/') + "['\"]").test(clientSource)
  )
}

if (failures > 0) {
  console.error('\nFAIL  verify-plugin: ' + failures + ' 处不一致（根目录 ' + ROOT_DIR + '），修正后再发版 / 重启宿主')
  process.exit(1)
}
console.log('OK  verify-plugin: ' + PKG_NAME + ' · slug=' + SLUG + ' · package / patch / lib 入口一致')
