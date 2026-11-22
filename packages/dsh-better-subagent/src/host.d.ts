import type { SettingsForms } from '@deepseek-ai/dsh-settings'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { WorkingDirectoryService } from '@deepseek-ai/dsh-working-directory'
import type { Storage } from '@deepseek-ai/dsh-storage'

/** Only the capabilities consumed by this plugin, backed by public host types. */
export interface SettingsHost extends Pick<SettingsForms, 'configure'> {}
export interface WebServerHost extends Pick<WebServer, 'register'> {}
export interface SessionQueryHost extends Pick<SessionQueryEngine, 'observeSession'> {}
export interface SubprocessHost extends Pick<SubprocessRuntime, 'resolveExecutable' | 'spawn'> {}
export interface WorkingDirectoryHost extends Pick<WorkingDirectoryService, 'ensure'> {}
export interface StorageHost extends Pick<Storage, 'backend'> {}

/** Optional test/host probe; production uses the package's native version probe. */
export interface CliVersionProbeHost {
  (executable: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<string>
}

/** Shared PTC deadline exemption service, with no public host declaration. */
export interface BetterPtcHost {
  register(tool: string): () => void
}

/** Optional model allowlist service supplied by the host composition. */
export interface SubagentModelSelectionHost {
  current(): { enabled: boolean; allowedModels: { provider: string; model: string }[] }
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'better-subagent-child-exit-guard': {
      kind: 'better-subagent-child-exit-guard'
      form: 'notice'
      summary: string
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    subagentModelSelection: SubagentModelSelectionHost
    cliVersionProbe?: CliVersionProbeHost
    betterPtc: BetterPtcHost
  }
}
