import type { Fiber } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { GoalConfig } from './config.js'

export interface GoalConfigStatus {
  activeConfig: GoalConfig
  savedConfig: GoalConfig
  loadedConfig: Readonly<GoalConfig>
  requiresReload: boolean
  runtime: { implementation: GoalConfig['implementation']; owner: string }
  capabilities: { implementation: boolean; hotReplacement: boolean; roundLimitPolicy: boolean; singleGoalTool: boolean; questionTimeout: boolean }
}

export interface GoalConfigProvider {
  get(): GoalConfig
  snapshot?(): Readonly<GoalConfig>
  status?(): GoalConfigStatus
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'loader/volatile-update'(paths: readonly (readonly string[])[]): void
  }
  interface Context {
    settings: { configure(options: { auto: boolean }, fiber: Fiber): () => void }
    webServer: { register(route: { kind: 'exact'; path: string; auth?: 'anonymous' | 'required' | 'deny'; handler(req: IncomingMessage, res: ServerResponse): void }): () => void }
    betterGoalConfig?: GoalConfigProvider
  }
}
