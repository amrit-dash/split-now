import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { ChevronDown, Copy, Loader2, RefreshCw, Search } from 'lucide-react'
import { errText } from '@/lib/errors'
import { formatDateTime } from '@/lib/locale'
import { type AppErrorRow, asCopyText, FUNCTION_NAMES, functionLabel, levelTone, matchesText, TIME_RANGES } from '@/lib/admin-logs'
import { Segmented } from '@/components/Misc'
import { Select } from '@/components/Select'
import { useToast } from '@/components/Toast'
import { adminLogs, appErrors, type ServerLogEntry, type ServerLogQuery } from './api'

type Source = 'server' | 'app'
type Level = NonNullable<ServerLogQuery['level']>

const TONE: Record<ReturnType<typeof levelTone>, string> = {
  error: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
  debug: 'bg-slate-100 text-slate-600 dark:bg-ink-800 dark:text-slate-300',
}

/** One row: a line to scan, and the whole entry when opened, with Copy for a bug report. */
function Row({ head, sub, badge, tone, full, testId }: { head: string; sub: string; badge: string; tone: string; full: unknown; testId: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asCopyText(full))
      toast('Copied')
    } catch {
      toast('Couldn’t copy', 'err')
    }
  }
  return (
    <li data-testid={testId}>
      <button type="button" className="flex min-h-12 w-full items-start gap-2 px-3 py-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-bold ${tone}`}>{badge}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm ${open ? 'break-words' : 'truncate'}`}>{head || '(no message)'}</span>
          <span className="text-muted block truncate text-xs">{sub}</span>
        </span>
        <ChevronDown size={16} className={`text-muted mt-1 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <pre className="max-h-96 overflow-auto rounded-xl bg-slate-50 p-3 text-xs leading-relaxed dark:bg-ink-900">{asCopyText(full)}</pre>
          <button type="button" className="chip mt-2 min-h-10" onClick={() => void copy()}>
            <Copy size={14} aria-hidden /> Copy
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * /admin/logs: what the server did (the Cloud Functions' logs, live from Cloud Logging) and what
 * went wrong on people's phones (appErrors). Filter, open an entry for everything it carries,
 * copy it. Newest first, 50 at a time.
 */
export default function Logs() {
  const [source, setSource] = useState<Source>('server')
  const [hours, setHours] = useState(24)
  const [level, setLevel] = useState<Level>('INFO')
  const [fn, setFn] = useState('')
  const [kind, setKind] = useState('')
  const [text, setText] = useState('')
  const [id, setId] = useState('')
  const [server, setServer] = useState<{ entries: ServerLogEntry[]; next?: string; note?: string } | null>(null)
  const [app, setApp] = useState<{ rows: AppErrorRow[]; more: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (more = false) => {
      setBusy(true)
      setError(null)
      try {
        if (source === 'server') {
          const r = await adminLogs({
            hours,
            level,
            ...(fn ? { fn } : {}),
            ...(text.trim() ? { text: text.trim() } : {}),
            ...(id.trim() ? { id: id.trim() } : {}),
            ...(more && server?.next ? { next: server.next } : {}),
          })
          setServer((s) => (more && s ? { ...r, entries: [...s.entries, ...r.entries] } : r))
        } else {
          const after = more ? app?.rows.at(-1)?.at : undefined
          const rows = await appErrors({
            hours,
            ...(id.trim() ? { uid: id.trim() } : {}),
            ...(kind ? { kind } : {}),
            ...(after !== undefined ? { after } : {}),
          })
          setApp((a) => ({ rows: more && a ? [...a.rows, ...rows] : rows, more: rows.length === 50 }))
        }
      } catch (e) {
        setError(errText(e))
      } finally {
        setBusy(false)
      }
    },
    [source, hours, level, fn, kind, text, id, server?.next, app?.rows],
  )
  // A new source, range, level, function or kind loads again; words and ids wait for Search.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only these filters reload by themselves.
  useEffect(() => {
    void load()
  }, [source, hours, level, fn, kind])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void load()
  }
  const shownApp = app ? app.rows.filter((r) => matchesText(r, text)) : null

  return (
    <div className="space-y-3" data-testid="admin-logs">
      <Segmented<Source>
        label="Which logs"
        value={source}
        onChange={setSource}
        options={[
          { value: 'server', label: 'Server' },
          { value: 'app', label: 'App errors' },
        ]}
        testId="logs-source"
      />
      <form className="card space-y-2 p-3" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-2">
          <Select<string>
            aria-label="How far back"
            size="sm"
            value={String(hours)}
            onChange={(v) => setHours(Number(v))}
            options={TIME_RANGES.map((t) => ({ value: String(t.hours), label: t.label }))}
          />
          {source === 'server' ? (
            <Select<Level>
              aria-label="Lowest level"
              size="sm"
              value={level}
              onChange={setLevel}
              options={[
                { value: 'DEBUG', label: 'Everything' },
                { value: 'INFO', label: 'Info and up' },
                { value: 'WARNING', label: 'Warnings and errors' },
                { value: 'ERROR', label: 'Errors only' },
              ]}
            />
          ) : (
            <Select<string>
              aria-label="Kind"
              size="sm"
              value={kind}
              onChange={setKind}
              options={[
                { value: '', label: 'Every kind' },
                { value: 'crash', label: 'Crashes' },
                { value: 'unhandled', label: 'Unhandled errors' },
                { value: 'save', label: 'Refused saves' },
              ]}
            />
          )}
        </div>
        {source === 'server' && (
          <Select<string>
            aria-label="Function"
            size="sm"
            value={fn}
            onChange={setFn}
            options={[{ value: '', label: 'Every function' }, ...FUNCTION_NAMES.map((f) => ({ value: f, label: f }))]}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input !py-2 text-sm"
            placeholder="Words"
            aria-label="Words to find"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={100}
          />
          <input
            className="input !py-2 text-sm"
            placeholder={source === 'server' ? 'Account or group id' : 'Account id'}
            aria-label={source === 'server' ? 'Account or group id' : 'Account id'}
            value={id}
            onChange={(e) => setId(e.target.value)}
            maxLength={128}
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
        <button type="submit" className="btn-primary !min-h-11 w-full" disabled={busy} data-testid="logs-search">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Search size={16} aria-hidden />} Search
        </button>
      </form>

      {error && (
        <p className="neg px-1 text-sm" role="alert">
          {error}
        </p>
      )}
      {source === 'server' && server?.note && <p className="card text-muted p-3 text-sm">{server.note}</p>}

      {source === 'server' && server && !server.note && (
        <>
          {server.entries.length === 0 ? (
            <p className="card text-muted p-4 text-center text-sm">Nothing matches.</p>
          ) : (
            <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
              {server.entries.map((e) => (
                <Row
                  key={e.id}
                  testId="log-row"
                  badge={e.severity === 'DEFAULT' ? 'LOG' : e.severity}
                  tone={TONE[levelTone(e.severity)]}
                  head={e.message}
                  sub={`${e.at ? formatDateTime(Date.parse(e.at)) : ''} · ${functionLabel(e.fn)}`}
                  full={e}
                />
              ))}
            </ul>
          )}
          {server.next && (
            <button type="button" className="btn w-full" disabled={busy} onClick={() => void load(true)}>
              <RefreshCw size={16} aria-hidden /> Older
            </button>
          )}
        </>
      )}

      {source === 'app' && shownApp && (
        <>
          {shownApp.length === 0 ? (
            <p className="card text-muted p-4 text-center text-sm">No error reports{text.trim() ? ' match' : ' in this time'}.</p>
          ) : (
            <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
              {shownApp.map((r) => (
                <Row
                  key={r.id}
                  testId="app-error-row"
                  badge={r.kind.toUpperCase()}
                  tone={TONE[r.kind === 'save' ? 'warn' : 'error']}
                  head={r.message}
                  sub={`${formatDateTime(r.at)} · ${r.route ?? ''} · ${r.version ?? ''} · ${r.mode ?? ''}`}
                  full={r}
                />
              ))}
            </ul>
          )}
          {app?.more && (
            <button type="button" className="btn w-full" disabled={busy} onClick={() => void load(true)}>
              <RefreshCw size={16} aria-hidden /> Older
            </button>
          )}
        </>
      )}
    </div>
  )
}
