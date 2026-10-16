/*
 * The admin console's Logs tab, server side (adminLogs in admin.ts): turning the console's filters
 * into a Cloud Logging filter, and each entry into one plain shape. Pure.
 *
 * Every Cloud Function here is a Cloud Run service (2nd gen), so its logs are
 * resource.type="cloud_run_revision" with the function's name, lower-cased, as service_name.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'
export const LOG_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR']

export interface LogQuery {
  /** the lowest severity shown */
  level?: LogLevel
  /** one function's name (e.g. "onExpenseCreated"), or every function */
  fn?: string
  /** how far back, in hours (1 to 720) */
  hours?: number
  /** words to find anywhere in the entry */
  text?: string
  /** an account or group id the entry mentions */
  id?: string
}

export interface LogEntry {
  id: string
  at: string
  severity: string
  fn: string
  message: string
  /** the rest of the structured payload (logger.info('x', { … })), or the text payload */
  data?: unknown
  trace?: string
}

const clean = (s: string, max: number) =>
  s
    .replace(/["\\\n\r]/g, ' ')
    .trim()
    .slice(0, max)

/** A Cloud Logging filter for `q` at `now`. */
export function buildLogFilter(q: LogQuery, now: number): string {
  const hours = Math.min(720, Math.max(1, Math.round(q.hours ?? 24)))
  const parts = ['resource.type="cloud_run_revision"', `timestamp>="${new Date(now - hours * 3_600_000).toISOString()}"`]
  if (q.level && q.level !== 'DEBUG') parts.push(`severity>=${q.level}`)
  if (q.fn && /^[A-Za-z][A-Za-z0-9]{0,62}$/.test(q.fn)) parts.push(`resource.labels.service_name="${q.fn.toLowerCase()}"`)
  const text = q.text ? clean(q.text, 100) : ''
  if (text) parts.push(`SEARCH("${text}")`)
  const id = q.id && /^[A-Za-z0-9_-]{1,128}$/.test(q.id) ? q.id : ''
  if (id) parts.push(`SEARCH("${id}")`)
  return parts.join(' AND ')
}

interface RawEntry {
  insertId?: string
  timestamp?: string
  severity?: string
  resource?: { labels?: Record<string, string> }
  jsonPayload?: Record<string, unknown>
  textPayload?: string
  httpRequest?: Record<string, unknown>
  trace?: string
}

export function normalizeEntry(r: RawEntry): LogEntry {
  const fn = r.resource?.labels?.service_name ?? r.resource?.labels?.function_name ?? ''
  const json = r.jsonPayload
  let message = ''
  let data: unknown
  if (json) {
    const { message: m, ...rest } = json
    message = typeof m === 'string' ? m : ''
    data = Object.keys(rest).length ? rest : undefined
  } else if (typeof r.textPayload === 'string') {
    message = r.textPayload.split('\n')[0].slice(0, 300)
    data = r.textPayload.includes('\n') || r.textPayload.length > 300 ? r.textPayload : undefined
  } else if (r.httpRequest) {
    message = `${r.httpRequest.requestMethod ?? ''} ${r.httpRequest.status ?? ''}`.trim()
    data = r.httpRequest
  }
  return {
    id: r.insertId ?? `${r.timestamp}-${fn}`,
    at: r.timestamp ?? '',
    severity: r.severity ?? 'DEFAULT',
    fn,
    message,
    ...(data !== undefined ? { data } : {}),
    ...(r.trace ? { trace: r.trace } : {}),
  }
}
