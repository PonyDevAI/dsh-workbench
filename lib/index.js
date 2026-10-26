// dsh-workbench · Host 入口（v0.2.0：账号与独立授权）
//
// - bundle 插件：apply(ctx, config) 装配账号/凭据/HTTP 客户端/采集引擎 + /workbench 管理面
// - 状态目录：$DSH_HOME/workbench（config.json / accounts.json / state.json / secrets.json / workbench.log）
// - 安全：管理面走 connection.admit；写请求校验客户端头；凭据只进 CredentialStore；日志脱敏
// - v0.2.0：运行时不再调用 lark-cli / gh（仅 accounts.importGh 一次性导入）

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from './log.js'
import { ensurePrivateDir } from './store.js'
import { loadConfig, normalizeConfig, saveConfig, configPath } from './config.js'
import { WorkbenchState } from './state.js'
import { CredentialStore } from './credentials.js'
import { AccountsStore, AccountsService } from './accounts.js'
import { createHttpClient } from './http.js'
import { FeishuClient } from './clients/feishu.js'
import { GithubClient } from './clients/github.js'
import { AccountAuth } from './account-auth.js'
import { LarkChannel } from './channels/lark.js'
import { GithubChannel } from './channels/github.js'
import { WorkbenchEngine } from './poller.js'
import { createApiHandler } from './api.js'
import { messageOf } from './errors.js'

export const name = 'dsh-workbench'

// 没有 webServer 时插件不加载（管理面是唯一对外入口）
export const inject = ['webServer']

export function resolveHome () {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh')
  return home
}

export function resolveStateDir (configured) {
  return configured && configured.trim() ? configured.trim() : join(resolveHome(), 'workbench')
}

function bootOverrides (raw) {
  const overrides = normalizeConfig({})
  const lark = Number(raw?.larkPollSeconds)
  const github = Number(raw?.githubPollSeconds)
  if (Number.isFinite(lark)) overrides.config.channels.lark.pollSeconds = Math.max(30, Math.min(300, Math.round(lark)))
  if (Number.isFinite(github)) overrides.config.channels.github.pollSeconds = Math.max(60, Math.min(3600, Math.round(github)))
  return overrides.config
}

/**
 * @param {object} ctx cordis Context
 * @param {{ stateDir?: string, larkPollSeconds?: number, githubPollSeconds?: number }} rawConfig
 */
export function apply (ctx, rawConfig = {}) {
  const stateDir = resolveStateDir(rawConfig?.stateDir)
  mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  ensurePrivateDir(stateDir)
  const log = createLogger({ stateDir })

  const loaded = loadConfig(stateDir, log.info)
  const config = loaded.config
  if (!existsSync(configPath(stateDir))) {
    const defaults = bootOverrides(rawConfig)
    config.channels.lark.pollSeconds = defaults.channels.lark.pollSeconds
    config.channels.github.pollSeconds = defaults.channels.github.pollSeconds
  }

  const state = new WorkbenchState({ stateDir, log: log.info, historyLimit: config.storage.historyLimit }).load()
  const credentials = new CredentialStore({ ctx, stateDir, log: log.info })
  const accountsStore = new AccountsStore({ stateDir, log: log.info }).load()
  const accounts = new AccountsService({ store: accountsStore, credentials, log: log.info })
  // 上次进程中断时仍处于授权中的账号：标 needs_auth，等用户重新发起（device code 已失效）。
  for (const account of accountsStore.list()) {
    if (account.status === 'pending_auth') accounts.markStatus(account.id, 'needs_auth', '授权未完成，请重新发起')
  }

  const http = createHttpClient({ log: log.info })
  const feishu = new FeishuClient({ http, log: log.info })
  const github = new GithubClient({ http, log: log.info })
  const auth = new AccountAuth({ accounts, credentials, feishu, github, log: log.info })

  const larkChannel = new LarkChannel({ accounts, auth, config, feishu, log: log.info })
  const githubChannel = new GithubChannel({ accounts, auth, config, github, log: log.info })
  const engine = new WorkbenchEngine({ config, state, log: log.info, lark: larkChannel, github: githubChannel })

  ctx.effect(() => {
    void engine.start().then(() => {
      log.info(`[boot] dsh-workbench 就绪，状态目录 ${stateDir}，账号 ${accountsStore.list().length} 个`)
    }).catch((error) => {
      log.error(`[boot] 启动失败：${messageOf(error)}`)
    })
    return () => {
      engine.dispose()
      auth.dispose()
      state.close()
    }
  }, 'dsh-workbench: engine')

  ctx.inject(['connection', 'webServer'], (scope) => {
    scope.effect(() => {
      const handler = createApiHandler({
        connection: scope.connection,
        engine,
        accounts,
        auth,
        getConfig: () => engine.config,
        saveConfig: (raw) => saveConfig(stateDir, raw),
        state,
        log,
      })
      const dispose = scope.webServer.register({ kind: 'prefix', path: '/workbench', handler })
      return () => { if (typeof dispose === 'function') dispose() }
    }, 'dsh-workbench: route')
  })

  log.info('[boot] dsh-workbench 装配完成（v0.2.0：独立账号 / 原生 HTTP / 只读采集）')
}
