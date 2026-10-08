import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ChevronRight, Copy, KeyRound, MessageSquareText, Pause, Plus, Smartphone, Trash2, X, Zap } from 'lucide-react'
import { firebaseProject, repo } from '@/data'
import type { CaptureToken } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useGroups } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import type { Group } from '@/types'
import { copy } from '@/lib/share'
import { errText } from '@/lib/errors'
import { hasTripWindow } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { formatDate } from '@/lib/locale'
import { currencySymbol, formatMoney } from '@/lib/money'
import type { AllPrefs } from '@/lib/push'
import { IGNORE_SUGGESTIONS, MAX_IGNORE_WORDS, logResultText, logResultTone, relativeTime } from '@/lib/capture-filters'
import {
  addIgnoreWord,
  clearCaptureLog,
  demoTokenUse,
  paiseToRupeesInput,
  rupeesToPaise,
  saveCapturePrefs,
  watchCaptureLog,
  watchCapturePrefs,
  type LogRow,
} from '@/lib/capture-settings'
import { useConfirm } from './ConfirmSheet'
import { formatRange } from './Misc'
import { CardSkeleton } from './Skeleton'
import { Switch } from './Switch'
import { useToast } from './Toast'

/** relativeTime falls back to a raw ISO day after a week; show that in the app's date format instead. */
export const ago = (at: number, now: number) => {
  const s = relativeTime(at, now)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatDate(at) : s
}

/** What Settings → Automation shows when the admin turned auto-capture off for everyone (config/app flags.autoCapture). */
export function AutoCaptureOff() {
  return (
    <p className="text-muted px-1 text-sm" data-testid="section-auto-capture">
      Auto-capture is switched off for everyone right now
    </p>
  )
}

/**
 * Settings → Automation: capture on/off, what gets captured, filters (minimum amount, ignore
 * keywords), per-trip pause, capture keys with "last received", recent webhook activity, and
 * the advanced Apple Pay Shortcut / capture-link paths. Settings are enforced by the capture
 * webhook. Everything saves as it changes.
 */
export function AutoCapture() {
  const { user } = useMe()
  const toast = useToast()
  const confirm = useConfirm()
  const groups = useGroups()
  const autoCapture = useFlag('autoCapture')
  const [tokens, setTokens] = useState<CaptureToken[] | null>(null)
  const [prefs, setPrefs] = useState<AllPrefs | null>(null)
  const [log, setLog] = useState<LogRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => repo.watchCaptureTokens(user.uid, setTokens), [user.uid])
  useEffect(() => watchCapturePrefs(user.uid, repo.mode, setPrefs), [user.uid])
  useEffect(() => watchCaptureLog(user.uid, repo.mode, setLog), [user.uid])

  const update = (patch: Partial<AllPrefs>) => {
    if (!prefs) return
    setPrefs({ ...prefs, ...patch })
    saveCapturePrefs(user.uid, repo.mode, patch).catch((e) => toast(errText(e), 'err'))
  }

  // The Apple Pay path uses an unscoped key (scoped keys belong to the SMS wizard).
  const token = tokens?.find((t) => !t.groupId)
  const firebase = repo.mode === 'firebase' && firebaseProject.projectId
  const restUrl = firebase
    ? `https://firestore.googleapis.com/v1/projects/${firebaseProject.projectId}/databases/(default)/documents/captureInbox?key=${firebaseProject.apiKey}`
    : ''
  const body = token
    ? JSON.stringify(
        {
          fields: {
            token: { stringValue: token.token },
            uid: { stringValue: user.uid },
            raw: { stringValue: '[Amount]' },
            merchant: { stringValue: '[Merchant]' },
            card: { stringValue: '[Card or Pass]' },
            ts: { stringValue: '[Formatted Date]' },
            src: { stringValue: 'ios-shortcut' },
          },
        },
        null,
        2,
      )
    : ''
  const openUrl = `${location.origin}/capture?v=1&raw=[Amount]&merchant=[Merchant]&card=[Card or Pass]&src=ios-shortcut${token ? `&t=${token.token}&u=${user.uid}` : ''}`

  const create = async () => {
    setBusy(true)
    try {
      await repo.createCaptureToken(user.uid)
      toast('Capture key created')
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  const revoke = async (t: CaptureToken) => {
    const ok = await confirm({
      title: 'Revoke this capture key?',
      message: 'Shortcuts and macros using it stop working at once. You can create a new key any time.',
      confirmLabel: 'Revoke',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await repo.revokeCaptureToken(t.token)
      toast('Capture key revoked')
    } catch (e) {
      toast(errText(e), 'err')
    }
  }
  const copyIt = async (text: string, what: string) => toast((await copy(text)) ? `${what} copied` : 'Couldn’t copy', 'ok')

  // biome-ignore lint/correctness/useExhaustiveDependencies: `log` is the refresh trigger (the demo log and token use share one localStorage write)
  const demoUse = useMemo(() => (repo.mode === 'demo' ? demoTokenUse(user.uid) : {}), [user.uid, log])
  const lastUsed = (t: CaptureToken) => t.lastUsedAt ?? demoUse[t.token]
  const lastAny = Math.max(0, ...(tokens ?? []).map((t) => lastUsed(t) ?? 0)) || undefined
  const paused = prefs?.capturePaused ?? false

  // Off for everyone: the webhook answers "paused" and the wizard redirects, so these would be dead controls.
  if (!autoCapture) return <AutoCaptureOff />

  return (
    <div data-testid="section-auto-capture">
      <p className="text-muted px-1 text-sm">
        Your phone forwards bank and UPI SMS to Split Now, and they wait in your{' '}
        <Link to="/inbox" className="font-semibold text-brand-600 dark:text-brand-300">
          Inbox
        </Link>{' '}
        until you add them to a group. Nothing is ever added without your OK.
      </p>

      {prefs ? (
        <div className="card mt-3 flex items-center gap-3 p-3" data-testid="capture-master">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${paused ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}`}
            aria-hidden
          >
            {paused ? <Pause size={18} /> : <Zap size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <div id="capture-master-label" className="text-sm font-semibold">
              {paused ? 'Capture paused' : 'Capture payments'}
            </div>
            <div className="text-muted text-xs">
              {paused
                ? 'Forwarded SMS are ignored and nothing is stored.'
                : !tokens?.length
                  ? 'Not set up yet.'
                  : lastAny
                    ? `Last message received ${ago(lastAny, Date.now())}.`
                    : 'Waiting for the first message from your phone.'}
            </div>
          </div>
          <Switch checked={!paused} onChange={(v) => update({ capturePaused: !v })} label="Capture payments" testId="capture-paused-switch" />
        </div>
      ) : (
        <CardSkeleton className="mt-3 h-16" />
      )}

      <Link
        to="/settings/auto-capture"
        className="card mt-3 flex items-center gap-3 p-3 ring-1 ring-brand-200 dark:ring-brand-800"
        data-testid="capture-setup-link"
      >
        <MessageSquareText size={22} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{tokens?.length ? 'Set up on a new phone' : 'Set up auto-capture'}</div>
          <div className="text-muted text-xs">About 3 minutes on an iPhone or Android. Works with any bank that sends SMS.</div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden />
      </Link>

      {prefs && (
        <div className={`transition-opacity ${paused ? 'opacity-50' : ''}`}>
          <OutsideTripsChoice on={prefs.outsideTrips} onChange={(v) => update({ outsideTrips: v })} />
          <Filters prefs={prefs} onChange={update} />
          {groups && <TripPauses groups={groups} />}
          <p className="text-muted mt-3 px-1 text-xs">
            {!prefs.captures
              ? 'Capture notifications are off (Settings → Notifications).'
              : prefs.outsideTrips && prefs.unsorted
                ? 'You’re notified about every captured payment.'
                : prefs.outsideTrips
                  ? 'You’re notified about trip payments. Turn on “Payments outside a trip” in Notifications to hear about the rest.'
                  : 'You’re notified when a trip payment is captured.'}
          </p>
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <Keys tokens={tokens} groups={groups ?? []} lastUsed={lastUsed} onCopy={(t) => copyIt(t.token, 'Capture key')} onRevoke={revoke} />
      )}
      {log && <RecentActivity rows={log} onClear={() => clearCaptureLog(user.uid, repo.mode, log).then(() => toast('Activity cleared'))} />}

      <details className="card mt-3 p-3">
        <summary className="text-muted cursor-pointer py-1 text-sm font-semibold">Advanced: Apple Pay Shortcut and capture links</summary>

        {tokens === null ? null : !token ? (
          <button type="button" className="btn-secondary mt-3 w-full" onClick={create} disabled={busy}>
            <KeyRound size={18} aria-hidden /> Create a capture key
          </button>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2 pl-3 dark:bg-ink-800">
              <KeyRound size={16} className="shrink-0 text-slate-500" aria-hidden />
              <code className="min-w-0 flex-1 truncate text-xs">{token.token}</code>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 dark:text-slate-300"
                onClick={() => copyIt(token.token, 'Capture key')}
                aria-label="Copy capture key"
              >
                <Copy size={16} />
              </button>
            </div>
            <p className="text-muted text-xs">
              Anyone with this key can add items to your Inbox (never read your data). Revoke it under “Your capture keys” if it leaks.
            </p>
          </div>
        )}

        <details className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800" open={!!token}>
          <summary className="cursor-pointer font-semibold">
            <Smartphone size={15} className="mr-1 inline" aria-hidden /> iPhone: Apple Pay Shortcut (iOS 17+)
          </summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
            <li>
              Shortcuts → <b>Automation</b> → <b>+</b> → <b>Transaction</b>. Pick your cards, choose <b>Run Immediately</b>.
            </li>
            <li>
              Add <b>Format Date</b>: Current Date, ISO 8601, include time.
            </li>
            <li>
              Add <b>Text</b> and paste the body below. Replace each <code>[…]</code> with the matching variable (Amount, Merchant, Card or Pass, Formatted
              Date).
            </li>
            <li>
              Add <b>Get Contents of URL</b>: paste the URL, Method <b>POST</b>, Header <code>Content-Type: application/json</code>, Request Body <b>File</b> →
              the Text.
            </li>
          </ol>
          {firebase && token ? (
            <div className="mt-3 space-y-2">
              <CopyBlock label="URL" value={restUrl} onCopy={() => copyIt(restUrl, 'URL')} />
              <CopyBlock label="Body" value={body} onCopy={() => copyIt(body, 'Body')} />
            </div>
          ) : (
            <p className="text-muted mt-3 text-xs">
              {firebase
                ? 'Create a capture key to get your URL and body.'
                : 'Background capture needs Firebase. In demo mode, use the Open URL link below instead.'}
            </p>
          )}
          <p className="text-muted mt-3 text-xs">
            Prefer to confirm straight away? Use <b>Open URL</b> with the link below instead (it opens Safari).
          </p>
          <CopyBlock label="Open URL" value={openUrl} onCopy={() => copyIt(openUrl, 'Link')} />
          <p className="text-muted mt-2 text-xs">Apple Pay captures and capture links don’t go through the SMS filters above.</p>
        </details>

        <details className="mt-2 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800">
          <summary className="cursor-pointer font-semibold">
            <Smartphone size={15} className="mr-1 inline" aria-hidden /> Android
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
            <li>
              Install Split Now, then <b>Share</b> a payment screenshot, receipt or bank message to it.
            </li>
            <li>
              Tasker / MacroDroid: on a Google Wallet or bank notification, open
              <code className="break-all"> {location.origin}/capture?v=1&amp;amount=%amount&amp;merchant=%merchant&amp;src=android-auto</code>
            </li>
          </ul>
        </details>
        <Link to={`/capture?v=1&amount=4.50&merchant=Test%20Cafe&src=manual&ref=test-${user.uid.slice(0, 6)}-${todayISO()}`} className="btn-ghost mt-2 w-full">
          Try a test capture
        </Link>
      </details>
    </div>
  )
}

function CopyBlock({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="mt-2">
      <div className="text-muted mb-1 flex items-center justify-between text-xs font-semibold">
        {label}
        <button type="button" className="inline-flex min-h-9 items-center gap-1 px-2 text-brand-600 dark:text-brand-300" onClick={onCopy}>
          <Copy size={13} aria-hidden /> Copy
        </button>
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-white p-2 font-mono text-xs dark:bg-ink-900">{value}</pre>
    </div>
  )
}

function Panel({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="card mt-3 p-3" data-testid={testId}>
      <h2 className="text-muted mb-2 text-xs font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  )
}

/**
 * Which debit SMS get captured: inside a trip's dates only (default), or every debit (the rest
 * land in the Inbox unsorted). Stored with the notification prefs; enforced by the webhook.
 */
function OutsideTripsChoice({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Panel title="What gets captured">
      <div role="radiogroup" aria-label="What gets captured" className="space-y-1.5">
        {[
          { v: false, title: 'Only payments during a trip', hint: 'Debit SMS dated inside a group’s trip dates. Everything else is ignored and never stored.' },
          { v: true, title: 'All bank & UPI payments', hint: 'Payments outside every trip wait in the Inbox as “outside any trip”, without a notification.' },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={on === o.v}
            onClick={() => onChange(o.v)}
            className={`flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition ${on === o.v ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/20' : ''}`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on === o.v ? 'border-brand-600 bg-brand-600' : 'border-slate-400 dark:border-ink-700'}`}
              aria-hidden
            >
              {on === o.v && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{o.title}</span>
              <span className="text-muted block text-xs">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Panel>
  )
}

/** Minimum amount and ignore keywords. */
function Filters({ prefs, onChange }: { prefs: AllPrefs; onChange: (p: Partial<AllPrefs>) => void }) {
  const [min, setMin] = useState(paiseToRupeesInput(prefs.minAmount))
  const [word, setWord] = useState('')
  useEffect(() => setMin(paiseToRupeesInput(prefs.minAmount)), [prefs.minAmount])
  const commitMin = () => {
    const p = rupeesToPaise(min)
    setMin(paiseToRupeesInput(p))
    if (p !== prefs.minAmount) onChange({ minAmount: p })
  }
  const add = (w: string) => {
    const next = addIgnoreWord(prefs.ignoreWords, w)
    if (next !== prefs.ignoreWords) onChange({ ignoreWords: next })
    setWord('')
  }
  const remove = (w: string) => onChange({ ignoreWords: prefs.ignoreWords.filter((x) => x !== w) })
  const full = prefs.ignoreWords.length >= MAX_IGNORE_WORDS
  const suggestions = IGNORE_SUGGESTIONS.filter((s) => !prefs.ignoreWords.some((w) => w.toLowerCase() === s.toLowerCase()))

  return (
    <Panel title="Filters" testId="capture-filters">
      <label htmlFor="capture-min" className="text-sm font-semibold">
        Ignore small payments
      </label>
      <div className="mt-1 flex items-center gap-2">
        <div className="relative w-36">
          <span className="text-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" aria-hidden>
            {currencySymbol('INR')}
          </span>
          <input
            id="capture-min"
            className="input !pl-7"
            inputMode="decimal"
            placeholder="0"
            value={min}
            data-testid="capture-min"
            onChange={(e) => setMin(e.target.value)}
            onBlur={commitMin}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMin()
            }}
          />
        </div>
        <span className="text-muted text-xs">{prefs.minAmount ? 'Debits below this are skipped.' : 'Off: every amount is captured.'}</span>
      </div>
      <p className="text-muted mt-1 text-xs">Rupee payments only; foreign-currency card spends are always captured.</p>

      <div className="mt-4 text-sm font-semibold" id="capture-ignore-label">
        Ignore keywords
      </div>
      <p className="text-muted text-xs">Skip debits whose SMS or merchant mentions one of these (any case), like SIPs, rent or card bills.</p>
      {prefs.ignoreWords.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-labelledby="capture-ignore-label">
          {prefs.ignoreWords.map((w) => (
            <li key={w} className="chip !py-1 !pr-1 bg-white dark:bg-ink-900">
              {w}
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:text-rose-600 dark:text-slate-400"
                onClick={() => remove(w)}
                aria-label={`Remove ${w}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (word.trim()) add(word)
        }}
      >
        <input
          className="input min-w-0 flex-1"
          placeholder={full ? `Up to ${MAX_IGNORE_WORDS} keywords` : 'Add a keyword, e.g. Zerodha'}
          value={word}
          maxLength={40}
          disabled={full}
          onChange={(e) => setWord(e.target.value)}
          aria-label="New ignore keyword"
          data-testid="capture-ignore-input"
        />
        <button type="submit" className="btn-secondary !px-3" disabled={full || !word.trim()} aria-label="Add keyword">
          <Plus size={18} />
        </button>
      </form>
      {!full && suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip !py-1.5 text-xs text-slate-700 dark:text-slate-300" onClick={() => add(s)}>
              <Plus size={12} aria-hidden /> {s}
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

/** Current and upcoming trips with a pause switch each (group.captureOff, shared with the group's members). */
function TripPauses({ groups }: { groups: Group[] }) {
  const toast = useToast()
  const today = todayISO()
  const trips = groups
    .filter((g) => g.type !== 'personal' && g.type !== 'direct' && !g.archived && hasTripWindow(g) && (!g.endDate || g.endDate >= today))
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
  if (!trips.length) return null
  const set = (g: Group, off: boolean) => {
    repo.updateGroupSettings(g, { captureOff: off || undefined }).catch((e) => toast(errText(e), 'err'))
    toast(off ? `Capture paused for ${g.name}` : `Capture on for ${g.name}`)
  }
  return (
    <Panel title="Trips" testId="capture-trips">
      <ul className="space-y-1">
        {trips.map((g) => (
          <li key={g.id} className="flex items-center gap-3 py-1">
            <span className="text-lg" aria-hidden>
              {g.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" id={`trip-cap-${g.id}`}>
                {g.name}
              </div>
              <div className="text-muted truncate text-xs">
                {formatRange(g.startDate, g.endDate)}
                {g.captureOff ? ' · paused' : ''}
              </div>
            </div>
            <Switch checked={!g.captureOff} onChange={(v) => set(g, !v)} label={`Capture for ${g.name}`} />
          </li>
        ))}
      </ul>
      <p className="text-muted mt-1 text-xs">Pausing a trip applies to everyone in it: their payments during it are skipped too.</p>
    </Panel>
  )
}

function Keys({
  tokens,
  groups,
  lastUsed,
  onCopy,
  onRevoke,
}: {
  tokens: CaptureToken[]
  groups: Group[]
  lastUsed: (t: CaptureToken) => number | undefined
  onCopy: (t: CaptureToken) => void
  onRevoke: (t: CaptureToken) => void
}) {
  const now = Date.now()
  return (
    <Panel title="Your capture keys" testId="capture-keys">
      <ul className="space-y-1">
        {tokens.map((t) => {
          const g = t.groupId ? groups.find((x) => x.id === t.groupId) : undefined
          const at = lastUsed(t)
          const label = t.label ?? (t.groupId ? (g?.name ?? 'Trip') : 'All my trips')
          return (
            <li key={t.token} className="flex items-center gap-2">
              <KeyRound size={16} className="shrink-0 text-slate-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{label}</div>
                <div className="text-muted truncate text-xs">
                  {t.groupId
                    ? g
                      ? formatRange(g.startDate, g.endDate) || 'No trip dates'
                      : 'Its trip no longer exists: messages are ignored. Create a new key.'
                    : 'Any trip'}{' '}
                  · {at ? `last received ${ago(at, now)}` : 'nothing received yet'} · <code>{t.token.slice(0, 6)}…</code>
                </div>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 dark:text-slate-300"
                onClick={() => onCopy(t)}
                aria-label={`Copy capture key for ${label}`}
              >
                <Copy size={16} />
              </button>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-rose-600 dark:text-rose-400"
                onClick={() => onRevoke(t)}
                aria-label={`Revoke capture key for ${label}`}
              >
                <Trash2 size={16} />
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-muted mt-1 text-xs">A key lets your phone add payments to your Inbox and nothing else. Revoke one if it leaks or a phone is gone.</p>
    </Panel>
  )
}

const TONE: Record<'ok' | 'muted' | 'warn', string> = {
  ok: 'bg-emerald-500',
  muted: 'bg-slate-400 dark:bg-ink-600',
  warn: 'bg-amber-500',
}

/** "Is it working?": what the webhook did with the last messages. */
function RecentActivity({ rows, onClear }: { rows: LogRow[]; onClear: () => void }) {
  const now = Date.now()
  return (
    <Panel title="Recent activity" testId="capture-activity">
      {rows.length === 0 ? (
        <p className="text-muted flex items-start gap-2 text-xs">
          <Activity size={14} className="mt-0.5 shrink-0" aria-hidden /> Nothing yet. Every message your phone forwards shows up here, captured or not, so you
          can tell the automation is working.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-200/70 dark:divide-white/5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[logResultTone(r.result)]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {r.amount ? <b>{formatMoney(r.amount, r.currency ?? 'INR')}</b> : null}
                    {r.amount && r.merchant ? ` at ${r.merchant}` : !r.amount && r.merchant ? r.merchant : null}
                    {!r.amount && !r.merchant ? <span className="text-muted">Message</span> : null}
                  </div>
                  <div className="text-muted truncate text-xs">{logResultText(r)}</div>
                </div>
                <time className="text-muted shrink-0 text-xs" dateTime={new Date(r.at).toISOString()}>
                  {ago(r.at, now)}
                </time>
              </li>
            ))}
          </ul>
          <button type="button" className="text-muted mt-1 min-h-9 text-xs font-semibold" onClick={onClear}>
            Clear activity
          </button>
        </>
      )}
    </Panel>
  )
}
