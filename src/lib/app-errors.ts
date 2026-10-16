/*
 * Errors from people's phones for the admin's Logs tab (appErrors, read in Admin → Logs): a crash
 * the error screen caught, an error nothing handled, or a save the server refused. Only what helps
 * debugging: the message, the first lines of the stack, the screen (path only, no query), the app
 * version and the browser. Never form text or amounts: a private group's words are tokens, and
 * long digit runs are masked like the SMS parser does. At most a few per session, each message once.
 * Pure apart from the session counter; the repo writes it (Repo.reportError).
 */

export type AppErrorKind = 'crash' | 'unhandled' | 'save'

export interface AppErrorReport {
  uid: string
  at: number
  kind: AppErrorKind
  message: string
  stack?: string
  route?: string
  version?: string
  ua?: string
  /** installed (standalone) or browser */
  mode?: string
}

/** Long runs of digits (phone and card numbers, UPI references) masked. */
const mask = (s: string) => s.replace(/\d{6,}/g, (m) => `${'•'.repeat(m.length - 2)}${m.slice(-2)}`)

export function appErrorReport(
  e: unknown,
  ctx: { uid: string; kind: AppErrorKind; path: string; version: string; ua: string; standalone: boolean; now: number },
): AppErrorReport {
  const err = e instanceof Error ? e : null
  const raw = err
    ? `${err.name}: ${err.message}`
    : typeof e === 'string'
      ? e
      : (() => {
          try {
            return JSON.stringify(e)
          } catch {
            return String(e)
          }
        })()
  const stack = err?.stack
    ? err.stack
        .split('\n')
        .slice(0, 12)
        .map((l) => l.trim())
        .join('\n')
    : undefined
  return {
    uid: ctx.uid,
    at: ctx.now,
    kind: ctx.kind,
    message: mask(raw || 'Unknown error').slice(0, 500),
    ...(stack ? { stack: mask(stack).slice(0, 3000) } : {}),
    route: ctx.path.split(/[?#]/)[0].slice(0, 200),
    version: ctx.version.slice(0, 40),
    ua: ctx.ua.slice(0, 300),
    mode: ctx.standalone ? 'standalone' : 'browser',
  }
}

/** Per session: at most `max` reports, and each message once. */
export function reportGate(max = 5) {
  const seen = new Set<string>()
  return (r: Pick<AppErrorReport, 'kind' | 'message'>): boolean => {
    const key = `${r.kind}:${r.message}`
    if (seen.size >= max || seen.has(key)) return false
    seen.add(key)
    return true
  }
}
