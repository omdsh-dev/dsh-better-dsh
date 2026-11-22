/** Minimal optional plugin seams not declared by the public host packages. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsService } from './settings.js'
import type { AskConfig } from './config.js'
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'

/** Additive wire payload forwarded by the host to this plugin's client. */
declare module '@deepseek-ai/dsh-user-questions' {
  interface AskUserQuestionRequest {
    better?: {
      waitMs: number
      timeoutMode: AskConfig['timeoutBehavior']
      defaultAnswer?: AskUserQuestionAnswer & { autoSelected?: boolean; warning?: string }
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    settings: SettingsService & {
      configure(options: { auto: boolean }, fiber: Context['fiber']): () => void
    }
    betterPtc?: {
      register(name: string): () => void
    }
    goals?: {
      get?(agent: Agent): { phase?: string; activation?: string } | undefined
    }
  }
}
