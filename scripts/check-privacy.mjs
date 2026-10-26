// 隐私门禁：禁止真实个人信息 / 本机标识 / 真实凭据 / 真实会话 ID 进入仓库。
//
// 扫描范围 = 工作区里「会进仓库的文本文件」（不含 .git / node_modules / 二进制 / 压缩包 / 日志）。
// 不用 `git ls-files`：新仓库首个 commit 之前它什么都看不到，门禁会静默通过；这里直接扫工作区，
// 未提交文件同样受检。
//
// 规则（命中即失败，输出 文件:行 [规则] 命中片段 → 修法）：
//   1. home-path      本机绝对路径 /Users/<name>/…（改用 ~/… 或 <repo>）
//   2. github-token   ghp_ / gho_ / ghs_ / ghu_ / github_pat_ 等 GitHub 凭据
//   3. lark-cli-token 形如 cli_<16+ 位小写字母数字> 的 lark-cli 凭据
//   4. secret-token   sk-… / npm_… / xox[baprs]-… 等平台凭据
//   5. private-key    -----BEGIN … PRIVATE KEY----- 私钥头
//   6. lark-chat-id   oc_<20+ 位十六进制> / om_<20+ 位十六进制> 真实会话 / 消息 ID
//   7. private-host   *.local / *.tailnet / *.*.ts.net 私有主机名（example / test 放行）
//
// 放行：公开仓库名 PonyDevAI/dsh-workbench；占位符 <token> / $VAR / ~/…；示例主机名 example.local、
// example-tailnet.ts.net；lark id 占位符 oc_xxx 这类非十六进制文本。
//
// 约定：门禁脚本自身也在扫描范围内，所以规则用字符类拆开书写（如 /[o]c_/），
// 避免脚本源码里的示例文本把自己拦下。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const SKIP_DIRS = new Set(['.git', 'node_modules', '.dsh', 'coverage'])
const SKIP_FILES = new Set(['.DS_Store'])
const SKIP_EXT = /\.(?:png|jpe?g|gif|webp|bmp|ico|icns|woff2?|ttf|otf|mp[34]|mov|h264|zip|tgz|gz|pdf|p12|cer|log)$/i
const MAX_BYTES = 4 * 1024 * 1024

const RULES = [
  {
    id: 'home-path',
    re: /\/[U]sers\/[A-Za-z0-9._-]+/g,
    hint: '本机绝对路径：改用 ~/… 或 <repo> 占位',
  },
  {
    id: 'github-token',
    re: /g[h][opsu]_[A-Za-z0-9]{20,}|github[_]pat_[A-Za-z0-9_]{20,}/g,
    hint: '疑似 GitHub 凭据：禁止提交，改用 <token> / $GH_TOKEN',
  },
  {
    id: 'lark-cli-token',
    re: /[c]li_[a-z0-9]{16,}/g,
    hint: '疑似 lark-cli 凭据：禁止提交，改用 $LARK_TOKEN / <token>',
  },
  {
    id: 'secret-token',
    re: /[s]k-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}/g,
    hint: '疑似平台凭据（OpenAI / npm / Slack）：禁止提交，改用占位符',
  },
  {
    id: 'private-key',
    re: /-----[B]EGIN [A-Z ]*PRIVATE KEY-----/g,
    hint: '私钥：禁止提交',
  },
  {
    id: 'lark-chat-id',
    re: /[o][cm]_[0-9a-fA-F]{20,}/g,
    hint: '真实 Lark chat / message ID：改用 oc_xxx 或 <chatId> 占位',
    allow: (match) => /^[o][cm]_[xX]{6,}$/.test(match) || /example|placeholder|fake|dummy/i.test(match),
  },
  {
    id: 'private-host',
    re: /(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+(?:[l]ocal|[t]ailnet|[t]s[.]net)(?![A-Za-z0-9-])/g,
    hint: '私有主机名：改用 example.local / example-tailnet.ts.net / node-a 等中性命名',
    allow: (match) =>
      /(?:^|\.)(?:example|test)\.(?:local|tailnet)$/i.test(match) ||
      /(?:^|\.)(?:example-tailnet|tail1234)\.ts\.net$/i.test(match) ||
      /(?:^|\.)node-[a-z0-9]+\.(?:local|ts\.net)$/i.test(match),
  },
]

function walk (dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      // 只放过 .github（workflow 也要过门禁），其余点目录跳过。
      if (entry.name.startsWith('.') && entry.name !== '.github') continue
      walk(full, out)
      continue
    }
    if (!entry.isFile()) continue
    if (SKIP_FILES.has(entry.name)) continue
    if (SKIP_EXT.test(entry.name)) continue
    out.push(full)
  }
  return out
}

let files
try {
  files = walk(ROOT)
} catch (error) {
  console.error('FAIL  privacy: 扫描工作区失败：' + (error && error.message ? error.message : error))
  process.exit(1)
}

const hits = []
let scanned = 0
for (const full of files) {
  let text
  try {
    if (statSync(full).size > MAX_BYTES) continue
    text = readFileSync(full, 'utf8')
  } catch {
    continue
  }
  if (text.includes('\u0000')) continue // 二进制文件
  scanned += 1
  const file = relative(ROOT, full).split(sep).join('/')
  const lines = text.split('\n')
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      rule.re.lastIndex = 0
      const matches = lines[i].match(rule.re)
      if (!matches) continue
      for (const match of matches) {
        if (rule.allow && rule.allow(match)) continue
        hits.push({ file, line: i + 1, rule: rule.id, sample: match, hint: rule.hint })
      }
    }
  }
}

if (hits.length === 0) {
  console.log(`OK  privacy: 扫描 ${scanned} 个文件，未发现本机路径 / 真实凭据 / 真实会话 ID / 私有主机名`)
  process.exit(0)
}

console.error(`FAIL  privacy: ${hits.length} 处命中，禁止提交：`)
for (const hit of hits) {
  console.error(`  ${hit.file}:${hit.line}  [${hit.rule}]  ${hit.sample}  → ${hit.hint}`)
}
process.exit(1)
