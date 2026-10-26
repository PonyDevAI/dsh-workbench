// dsh-workbench · Host 入口
//
// - bundle 插件：apply(ctx, config) 装配采集引擎 + 注册 /workbench 管理面
// - 状态目录：$DSH_HOME/workbench（config.json / state.json / workbench.log）
// - v0.1：只采集、规则匹配、事件历史；不发送消息、不创建 review 会话
// - 安全：管理面走 connection.admit；写请求校验客户端头；日志脱敏

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from './log.js'
import { ensurePrivateDir } from './store.js'
import { loadConfig, normalizeConfig, saveConfig, configPath } from './config.js'
import { WorkbenchState } from './state.js'
import { LarkAdapter } from './lark.js'
import { GithubAdapter } from './github.js'
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
 * @param {{ stateDir?: string, larkBinary?: string, ghBinary?: string, larkPollSeconds?: number, githubPollSeconds?: number }} rawConfig
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
  const lark = new LarkAdapter({ binary: typeof rawConfig?.larkBinary === 'string' && rawConfig.larkBinary.trim() ? rawConfig.larkBinary.trim() : 'lark-cli', log: log.info })
  const github = new GithubAdapter({ binary: typeof rawConfig?.ghBinary === 'string' && rawConfig.ghBinary.trim() ? rawConfig.ghBinary.trim() : 'gh', log: log.info })
  const engine = new WorkbenchEngine({ config, state, lark, github, log: log.info })

  ctx.effect(() => {
    void engine.start().then(() => {
      log.info(`[boot] dsh-workbench 就绪，状态目录 ${stateDir}`)
    }).catch((error) => {
      log.error(`[boot] 启动失败：${messageOf(error)}`)
    })
    return () => {
      engine.dispose()
      state.close()
    }
  }, 'dsh-workbench: engine')

  ctx.inject(['connection', 'webServer'], (scope) => {
    scope.effect(() => {
      const handler = createApiHandler({
        connection: scope.connection,
        engine,
        getConfig: () => engine.config,
        saveConfig: (raw) => saveConfig(stateDir, raw),
        state,
        log,
      })
      const dispose = scope.webServer.register({ kind: 'prefix', path: '/workbench', handler })
      return () => { if (typeof dispose === 'function') dispose() }
    }, 'dsh-workbench: route')
  })

  log.info(`[boot] dsh-workbench 装配完成（v0.1：只采集/规则/历史）`)
}
