import type { TokenUsage } from '@deepseek-ai/dsh-llm'

export type CliId = 'codex' | 'claude'

export interface CliCommandSpec {
  executable?: unknown
  cwd?: unknown
  model?: unknown
  effort?: unknown
  profile?: unknown
  permissionMode?: unknown
  remoteId?: unknown
  prompt?: unknown
}

export interface CliParserUpdate {
  remoteId?: string
  text?: string
  usage?: TokenUsage
  completed?: boolean
  error?: string
}

export interface CliParserResult {
  text: string
  remoteId?: string
  usage?: TokenUsage
}

export interface CliParser {
  push(event: unknown): CliParserUpdate | undefined
  finish(): CliParserResult
}

export interface CliSessionRecord {
  version: 1
  id: string
  parentId: string
  cli: CliId
  cwd: string
  executable: string
  model: string
  effort: string
  delivered: unknown[]
  profile?: string
  cliHome?: string
  claudeDefaultHome?: boolean
  remoteId?: string
  started?: boolean
}
