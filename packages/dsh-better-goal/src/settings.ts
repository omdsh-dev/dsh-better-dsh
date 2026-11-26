import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { GoalConfigStatus } from './host.js'

/** Configure the row presentation and expose facts through the host trust fence. */
export const CONFIG_PATH = '/better-goal/api/config'

function headerOf(req: IncomingMessage, name: string): string | undefined {
  const value = (req.headers as Record<string, string | string[] | undefined> | undefined)?.[name]
  if (Array.isArray(value)) return value[0]
  return typeof value === 'string' ? value : undefined
}

/** Loopback authority, matching the host's own DNS-rebinding fence. */
function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Host/Origin fence independent of a GUI credential: the settings endpoint only
 * accepts loopback authorities and same-origin browser requests.
 */
function isTrustedRequest(req: IncomingMessage): boolean {
  const host = headerOf(req, 'host')
  if (host === undefined) return false
  let hostUrl: URL
  try { hostUrl = new URL('http://' + host) } catch { return false }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (headerOf(req, 'sec-fetch-site') === 'cross-site') return false
  const origin = headerOf(req, 'origin')
  if (origin === undefined) return true
  try { return new URL(origin).host === hostUrl.host } catch { return false }
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

export function handleConfig(ctx: Context, status: () => GoalConfigStatus, req: IncomingMessage, res: ServerResponse) {
  if (!isTrustedRequest(req)) {
    sendJson(res, 403, { code: 'UNTRUSTED_REQUEST', message: 'Host connection rejected this request' })
    return
  }
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET')
    sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Use GET' })
    return
  }
  sendJson(res, 200, status())
}

export function mountSettings(ctx: Context, status: () => GoalConfigStatus) {
  ctx.inject(['settings'], (inner) => {
    const dispose = inner.settings.configure({ auto: false }, ctx.fiber)
    inner.effect(() => dispose, 'better-goal: settings page')
  })
  ctx.inject(['webServer'], (inner) => {
    // DSH 0.2.3 makes web routes required-auth by default; this route keeps its
    // own loopback/Origin fence, so the host route is explicitly anonymous.
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: CONFIG_PATH,
      auth: 'anonymous',
      handler: (req, res) => handleConfig(inner, status, req, res),
    }), 'better-goal: configuration status')
  })
}
