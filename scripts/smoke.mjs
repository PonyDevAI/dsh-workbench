// dsh-workbench · 离线冒烟（不触网、不调用 lark-cli / gh）
//
// 覆盖：config 归一化、规则匹配、增量状态、引擎基线/命中流程。
// 用法：node scripts/smoke.mjs（失败非 0 退出）

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeConfig, extractPrRefs } from '../lib/config.js'
import { matchLark, matchGithub, testRule } from '../lib/rules.js'
import { WorkbenchState } from '../lib/state.js'
import { WorkbenchEngine } from '../lib/poller.js'
import { createApiHandler } from '../lib/api.js'

const noopHandle = () => ({ unref () {} })
const results = []

async function check (name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    process.stdout.write(`  ✔ ${name}\n`)
  } catch (error) {
    results.push({ name, ok: false, error })
    process.stdout.write(`  ✘ ${name}\n    ${error && error.message ? error.message : error}\n`)
  }
}

function tmpState () {
  const dir = mkdtempSync(join(tmpdir(), 'wb-smoke-'))
  const state = new WorkbenchState({ stateDir: dir, log: noopHandle, historyLimit: 50 }).load()
  return { dir, state }
}

function larkMessage (overrides = {}) {
  return {
    channel: 'lark',
    chat: { id: 'oc_test', name: '测试群', type: 'group' },
    sender: { id: 'ou_other', name: '同事', isBot: false },
    messageId: 'om_1',
    msgType: 'text',
    text: '看下这个 https://github.com/acme/web/pull/12',
    mentions: [],
    threadId: '',
    ts: 2000,
    deleted: false,
    updated: false,
    ...overrides,
  }
}

function baseConfig (overrides = {}) {
  return normalizeConfig({
    channels: {
      lark: {
        watchedChats: [{ chatId: 'oc_test', name: '测试群', type: 'group', mode: 'mention', allowReviewCommand: true }],
      },
      github: {
        watchedRepos: [{ repo: 'acme/web', path: '~/checkout/acme-web', onOpened: true, onNewCommits: true, skipDraft: true }],
      },
    },
    ...overrides,
  }).config
}


/** 模拟一次 POST /workbench，返回 { status, body }。 */
function callApi (handler, { endpoint, payload = {}, headers = {}, method = 'POST' }) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter()
    req.method = method
    req.headers = headers
    req.destroy = () => {}
    const res = {
      status: 0,
      body: '',
      writeHead (status) { this.status = status },
      end (body) { this.body = String(body || ''); resolve({ status: this.status, body: parseBody(this.body) }) },
    }
    const promise = handler(req, res)
    promise.catch(reject)
    req.emit('data', Buffer.from(JSON.stringify({ endpoint, payload })))
    req.emit('end')
  })
}

function parseBody (text) {
  try { return JSON.parse(text) } catch { return { raw: text } }
}

function fakeApiDeps () {
  const engine = {
    auth: { lark: { openId: 'ou_me' } },
    status: () => ({ lark: { enabled: true }, github: { enabled: false }, counters: {} }),
    health: () => ({ lark: { ok: true }, github: { ok: false } }),
    lark: { listChats: async () => ({ chats: [{ chatId: 'oc_test', name: '群', type: 'group' }] }) },
    runLarkOnce: async () => ({ ok: true }),
    runGithubOnce: async () => ({ ok: true }),
    applyConfig: () => {},
  }
  const state = { events: () => [], stats: () => ({ today: {} }), clearEvents: () => {} }
  return {
    connection: { admit: () => ({}) },
    engine,
    getConfig: () => ({ channels: { lark: { watchedChats: [] }, github: { watchedRepos: [] } } }),
    saveConfig: (raw) => (raw && raw.__invalid ? { ok: false, errors: ['bad config'] } : { ok: true, config: { ok: true }, warnings: [] }),
    state,
    log: { error: () => {} },
  }
}

async function main () {
  process.stdout.write('dsh-workbench smoke\n')

  await check('config：空配置 = 零监听 + 默认值', () => {
    const { config, errors } = normalizeConfig({})
    assert.equal(errors.length, 0)
    assert.equal(config.channels.lark.watchedChats.length, 0)
    assert.equal(config.channels.github.watchedRepos.length, 0)
    assert.equal(config.channels.lark.pollSeconds, 60)
    assert.equal(config.safety.outbound, 'draft')
    assert.equal(config.safety.allowApprove, false)
  })

  await check('config：非法 repo / chatId 被丢弃并报错', () => {
    const { config, errors } = normalizeConfig({
      channels: {
        lark: { watchedChats: [{ chatId: 'bad-id', mode: 'all' }] },
        github: { watchedRepos: [{ repo: 'not-a-repo' }] },
      },
    })
    assert.equal(config.channels.lark.watchedChats.length, 0)
    assert.equal(config.channels.github.watchedRepos.length, 0)
    assert.ok(errors.length >= 2)
  })

  await check('config：pollSeconds 夹取 + keywords 去重', () => {
    const { config } = normalizeConfig({
      channels: {
        lark: {
          pollSeconds: 5,
          watchedChats: [{ chatId: 'oc_a', mode: 'keyword', keywords: ['review', 'review', ' 看下 '] }],
        },
        github: { pollSeconds: 99999, watchedRepos: [] },
      },
    })
    assert.equal(config.channels.lark.pollSeconds, 30)
    assert.equal(config.channels.github.pollSeconds, 3600)
    assert.deepEqual(config.channels.lark.watchedChats[0].keywords, ['review', '看下'])
  })

  await check('rules：提取多个 PR 链接', () => {
    const prs = extractPrRefs('a https://github.com/acme/web/pull/12 b https://github.com/acme/api/pull/3')
    assert.deepEqual(prs.map((item) => `${item.repo}#${item.number}`), ['acme/web#12', 'acme/api#3'])
  })

  await check('rules：mention 模式命中 + PR 链接 reason', () => {
    const chat = { chatId: 'oc_test', mode: 'mention', keywords: [], allowReviewCommand: true }
    const hit = matchLark(larkMessage({ mentions: ['ou_me'] }), chat, { myOpenId: 'ou_me' })
    assert.equal(hit.matched, true)
    assert.equal(hit.reason, 'pr-link')
    const miss = matchLark(larkMessage(), chat, { myOpenId: 'ou_me' })
    assert.equal(miss.matched, false)
  })

  await check('rules：keyword / all / /review 命令', () => {
    const kw = matchLark(larkMessage({ text: '这个 Review 一下' }), { chatId: 'oc_test', mode: 'keyword', keywords: ['review'] })
    assert.equal(kw.matched, true)
    assert.equal(kw.reason, 'keyword')
    const all = matchLark(larkMessage({ text: '随便聊聊' }), { chatId: 'oc_test', mode: 'all' })
    assert.equal(all.matched, true)
    const cmd = matchLark(larkMessage({ text: '/review https://github.com/acme/web/pull/9' }), { chatId: 'oc_test', mode: 'mention', allowReviewCommand: true })
    assert.equal(cmd.matched, true)
    assert.equal(cmd.reason, 'command')
  })

  await check('rules：自己 / 已撤回 / off 不命中', () => {
    const chat = { chatId: 'oc_test', mode: 'all', allowReviewCommand: true }
    assert.equal(matchLark(larkMessage({ sender: { id: 'ou_me' } }), chat, { myOpenId: 'ou_me' }).reason, 'self')
    assert.equal(matchLark(larkMessage({ deleted: true }), chat, { myOpenId: 'ou_me' }).reason, 'deleted')
    assert.equal(matchLark(larkMessage(), { chatId: 'oc_test', mode: 'off' }).matched, false)
  })

  await check('rules：GitHub 基线 / 新 commit / draft / label', () => {
    const repo = { repo: 'acme/web', onOpened: true, onNewCommits: true, skipDraft: true, labels: [] }
    const pull = { repo: 'acme/web', number: 12, headSha: 'aaa', draft: false, labels: [] }
    assert.equal(matchGithub(pull, repo, undefined).isBaseline, true)
    assert.equal(matchGithub(pull, repo, { lastSeenSha: 'aaa' }).reason, 'unchanged')
    const changed = matchGithub({ ...pull, headSha: 'bbb' }, repo, { lastSeenSha: 'aaa' })
    assert.equal(changed.matched, true)
    assert.equal(changed.reason, 'commits')
    assert.equal(matchGithub({ ...pull, draft: true }, repo, undefined).reason, 'draft-skip')
    const labeled = matchGithub(pull, { ...repo, labels: ['review'] }, undefined)
    assert.equal(labeled.reason, 'label-skip')
  })

  await check('rules.test：按配置命中会话', () => {
    const config = baseConfig()
    const result = testRule({ source: 'lark', chatId: 'oc_test', text: '看下 https://github.com/acme/web/pull/5', mentions: ['ou_me'] }, config, { myOpenId: 'ou_me' })
    assert.equal(result.matched, true)
    assert.equal(result.prs[0].number, 5)
  })

  await check('state：去重 / 游标 / 事件裁剪', () => {
    const { dir, state } = tmpState()
    try {
      assert.equal(state.markSeen('om_1'), true)
      assert.equal(state.markSeen('om_1'), false)
      state.setCursor('lark:oc_test', { lastMessageTs: '2000', lastMessageId: 'om_1' })
      assert.equal(state.cursor('lark:oc_test').lastMessageTs, '2000')
      for (let index = 0; index < 60; index += 1) {
        state.pushEvent({ source: 'lark', title: `e${index}`, matched: index % 2 === 0, status: index % 2 === 0 ? 'matched' : 'ignored' })
      }
      assert.equal(state.events().length, 50)
      state.save()
      const reloaded = new WorkbenchState({ stateDir: dir, log: noopHandle, historyLimit: 50 }).load()
      assert.equal(reloaded.cursor('lark:oc_test').lastMessageId, 'om_1')
      assert.equal(reloaded.markSeen('om_1'), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  await check('engine：Lark 先基线，再命中增量', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-engine-'))
    const state = new WorkbenchState({ stateDir: dir, log: noopHandle, historyLimit: 50 }).load()
    let baselined = false
    const fakeLark = {
      authStatus: async () => ({ ok: true, userOpenId: 'ou_me', message: '' }),
      listChats: async () => ({ chats: [] }),
      baseline: async () => {
        baselined = true
        return { ok: true, cursor: { lastMessageTs: '1000', lastMessageId: 'om_0' }, message: larkMessage({ messageId: 'om_0', ts: 1000 }) }
      },
      since: async () => ({
        ok: true,
        messages: [
          larkMessage({ messageId: 'om_1', ts: 2000, mentions: ['ou_me'] }),
          larkMessage({ messageId: 'om_2', ts: 2001, mentions: [] }),
        ],
        nextCursor: { lastMessageTs: '2001', lastMessageId: 'om_2' },
      }),
    }
    const fakeGithub = { authStatus: async () => ({ ok: false, user: '', message: '' }), listPulls: async () => ({ pulls: [] }) }
    const config = baseConfig()
    const engine = new WorkbenchEngine({
      config, state, lark: fakeLark, github: fakeGithub, log: () => {},
      schedule: noopHandle, interval: noopHandle, clearSchedule: () => {}, clearIntervalFn: () => {},
    })
    try {
      await engine.start()
      await engine.runLarkOnce({ manual: true })
      assert.equal(baselined, true)
      const afterBaseline = state.events().length
      assert.equal(afterBaseline, 1)
      assert.equal(state.events()[0].status, 'baseline')
      await engine.runLarkOnce({ manual: true })
      assert.equal(state.events().length, 3)
      const matched = state.events().filter((event) => event.matched)
      assert.equal(matched.length, 1)
      assert.equal(matched[0].reason, 'pr-link')
      assert.equal(engine.counters.larkMessages, 2)
      assert.equal(engine.counters.larkMatched, 1)
      assert.equal(state.cursor('lark:oc_test').lastMessageTs, '2001')
    } finally {
      engine.dispose()
      state.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  await check('engine：GitHub 先基线，再新 commit 命中', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-engine-'))
    const state = new WorkbenchState({ stateDir: dir, log: noopHandle, historyLimit: 50 }).load()
    let sha = 'aaa'
    const fakeGithub = {
      authStatus: async () => ({ ok: true, user: 'tester', message: '' }),
      listPulls: async () => ({
        pulls: [{ repo: 'acme/web', number: 12, title: '修复登录', url: 'https://github.com/acme/web/pull/12', draft: false, labels: [], headSha: sha, updatedAt: '', author: 'tester' }],
      }),
    }
    const fakeLark = { authStatus: async () => ({ ok: false, userOpenId: '', message: '' }), listChats: async () => ({ chats: [] }) }
    const config = baseConfig()
    const engine = new WorkbenchEngine({
      config, state, lark: fakeLark, github: fakeGithub, log: () => {},
      schedule: noopHandle, interval: noopHandle, clearSchedule: () => {}, clearIntervalFn: () => {},
    })
    try {
      await engine.start()
      await engine.runGithubOnce({ manual: true })
      assert.equal(state.events()[0].status, 'baseline')
      sha = 'bbb'
      await engine.runGithubOnce({ manual: true })
      const matched = state.events().filter((event) => event.matched)
      assert.equal(matched.length, 1)
      assert.equal(matched[0].reason, 'commits')
      assert.equal(engine.counters.githubPulls, 2)
    } finally {
      engine.dispose()
      state.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })


  await check('api：state 返回 config/status/events', async () => {
    const handler = createApiHandler(fakeApiDeps())
    const result = await callApi(handler, { endpoint: 'state' })
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, true)
    assert.ok(result.body.value.status)
    assert.ok(Array.isArray(result.body.value.events))
  })

  await check('api：写接口缺少客户端头 → 403', async () => {
    const handler = createApiHandler(fakeApiDeps())
    const result = await callApi(handler, { endpoint: 'history.clear' })
    assert.equal(result.status, 403)
    assert.equal(result.body.error.code, 'auth/denied')
  })

  await check('api：config.save 非法 → config/invalid', async () => {
    const handler = createApiHandler(fakeApiDeps())
    const result = await callApi(handler, {
      endpoint: 'config.save',
      payload: { config: { __invalid: true } },
      headers: { 'x-dsh-workbench-client': '1' },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, false)
    assert.equal(result.body.error.code, 'config/invalid')
  })

  await check('api：history.clear 带头 → ok', async () => {
    const handler = createApiHandler(fakeApiDeps())
    const result = await callApi(handler, {
      endpoint: 'history.clear',
      headers: { 'x-dsh-workbench-client': '1' },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, true)
  })

  const failed = results.filter((item) => !item.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`)
  if (failed.length) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
