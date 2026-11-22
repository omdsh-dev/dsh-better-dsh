/**
 * Minimal structural view of the host session-controller list endpoint.
 *
 * The controller package's declaration closure pulls many optional host peers;
 * this plugin only needs the list shape it rewrites.
 */
import type {} from '@deepseek-ai/cordis'

export interface ProjectionValues {
  [key: string]: unknown
}

export interface SessionListProjection {
  values: ProjectionValues
  [key: string]: unknown
}

export interface SessionListItem {
  projections?: SessionListProjection
  [key: string]: unknown
}

export interface SessionListResult {
  items: SessionListItem[]
  [key: string]: unknown
}

export interface SessionControllerLike {
  list(this: unknown, ...args: unknown[]): Promise<SessionListResult>
  [key: string]: unknown
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionController: SessionControllerLike
  }
}
