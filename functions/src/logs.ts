/*
 * Callable `adminLogs` (admins only): the Cloud Functions' own logs, read live from Cloud Logging
 * for the console's Logs tab, newest first, 50 at a time. Filters: lowest level, one function,
 * how far back, words, an account or group id (lib/logs-core.ts). Uses the functions' service
 * account (it needs Logs Viewer, which the default compute account has); nothing is stored. In
 * the emulator there is no Cloud Logging, so it says so instead.
 */
import { applicationDefault } from 'firebase-admin/app'
import { logger } from 'firebase-functions/logger'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireAdmin } from './admin'
import { ENFORCE_APP_CHECK, REGION } from './config'
import { buildLogFilter, LOG_LEVELS, normalizeEntry, type LogEntry, type LogLevel, type LogQuery } from './lib/logs-core'

export interface AdminLogsResult {
  entries: LogEntry[]
  next?: string
  /** why there are none to show (the emulator, missing permission) */
  note?: string
}

const PAGE = 50

function query(d: Record<string, unknown>): LogQuery {
  return {
    level: LOG_LEVELS.includes(d.level as LogLevel) ? (d.level as LogLevel) : undefined,
    fn: typeof d.fn === 'string' ? d.fn : undefined,
    hours: typeof d.hours === 'number' ? d.hours : undefined,
    text: typeof d.text === 'string' ? d.text : undefined,
    id: typeof d.id === 'string' ? d.id.trim() : undefined,
  }
}

export const adminLogs = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 30, memory: '256MiB', maxInstances: 2 },
  async (req): Promise<AdminLogsResult> => {
    await requireAdmin(req)
    if (process.env.FUNCTIONS_EMULATOR === 'true') return { entries: [], note: 'The emulator has no Cloud Logging. Logs show here in production.' }
    const project = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT
    if (!project) throw new HttpsError('failed-precondition', 'Unknown project')
    const d = (req.data ?? {}) as Record<string, unknown>
    const filter = buildLogFilter(query(d), Date.now())
    const pageToken = typeof d.next === 'string' && d.next.length < 4096 ? d.next : undefined
    const { access_token } = await applicationDefault().getAccessToken()
    const res = await fetch('https://logging.googleapis.com/v2/entries:list', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ resourceNames: [`projects/${project}`], filter, orderBy: 'timestamp desc', pageSize: PAGE, ...(pageToken ? { pageToken } : {}) }),
    })
    if (res.status === 403)
      return { entries: [], note: 'The functions’ service account can’t read logs. Give it the Logs Viewer role (docs/FIREBASE_SETUP.md).' }
    if (!res.ok) {
      const body = await res.text()
      logger.warn('adminLogs: Cloud Logging refused', { status: res.status, body: body.slice(0, 500) })
      throw new HttpsError('unavailable', `Cloud Logging answered ${res.status}. Try a narrower filter.`)
    }
    const j = (await res.json()) as { entries?: unknown[]; nextPageToken?: string }
    return {
      entries: (j.entries ?? []).map((e) => normalizeEntry(e as Parameters<typeof normalizeEntry>[0])),
      ...(j.nextPageToken ? { next: j.nextPageToken } : {}),
    }
  },
)
