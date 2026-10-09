import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Apple,
  BatteryCharging,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Info,
  KeyRound,
  Loader2,
  MessageSquareText,
  Send,
  Smartphone,
  XCircle,
} from 'lucide-react'
import { repo } from '@/data'
import { draftToCapture, type CaptureToken } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useCaptures, useCaptureTokens, useGroups } from '@/hooks/data'
import type { Capture, Group } from '@/types'
import { APP_NAME, usePageTitle } from '@/lib/brand'
import { inTripWindow, pausedTrip, rankGroupsForCapture, sanitiseRef } from '@/lib/capture'
import { errText } from '@/lib/errors'
import { appLocale, formatDate } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { maskSms as maskBankSms, parseBankSms } from '@/lib/sms-parse'
import { copy, downloadText } from '@/lib/share'
import { fillMacroTemplate, macroFilename } from '@/lib/sms-macro'
import { todayISO } from '@/lib/id'
import { filterReason, logResultText, relativeTime, type CaptureLogEntry } from '@/lib/capture-filters'
import { appendDemoLog, demoCapturePrefs, demoTokenUse, saveCapturePrefs, watchCaptureLog, watchCapturePrefs, type LogRow } from '@/lib/capture-settings'
import type { AllPrefs } from '@/lib/push'
import {
  ANDROID_FILTER_REGEX,
  BATTERY_TIPS,
  DEBIT_KEYWORDS,
  IOS_SHORTCUT_NAME,
  MACRODROID_PLAY_URL,
  macrodroidPlayLink,
  bodyTemplateText,
  runShortcutUrl,
  checkScope,
  interpretResponse,
  randomRef,
  sampleDate,
  sampleSms,
  tokenLabel,
  webhookUrl,
  type ParsedSms,
  type TestOutcome,
  type WebhookBody,
  type WebhookResponse,
} from '@/lib/sms-setup'
import { Collapsible } from '@/components/Collapsible'
import { useConfirm } from '@/components/ConfirmSheet'
import { GroupIcon } from '@/components/GroupIcon'
import { LiveBadge, Loading, PageHeader, formatRange } from '@/components/Misc'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { SwipeRow } from '@/components/SwipeRow'

const IOS_SHORTCUT_URL = (import.meta.env.VITE_IOS_SHORTCUT_URL as string | undefined)?.trim() || undefined
const ANDROID_MACRO_URL = (import.meta.env.VITE_ANDROID_MACRO_URL as string | undefined)?.trim() || undefined

type Platform = 'ios' | 'android'
type Step = 1 | 2 | 3
const guessPlatform = (): Platform => (/android/i.test(navigator.userAgent) ? 'android' : 'ios')
const STEP_TITLES: Record<Step, string> = { 1: 'Turn on auto-capture', 2: 'Your phone', 3: 'Waiting for your phone' }
const time = (at: number) => new Date(at).toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' })

/** What happens to a payment outside every trip, as the server does it (B's contract): off = dropped, on = Inbox without a push. */
const outsideTripsText = (on: boolean) =>
  on
    ? 'Payments outside every trip wait in the Inbox as “outside any trip”, without a notification.'
    : 'Payments outside every trip are ignored. Want them in the Inbox instead? Turn on All bank & UPI payments in Settings → Automation.'

/**
 * /settings/auto-capture[?group=<id>][&step=1|2|3][&platform=ios|android]
 *
 * Three screens: (1) what this does and which phone, (2) the two or three things to do on the
 * phone, with the capture key created and copied for them, (3) a live "waiting for your phone"
 * state that lights up on the first forwarded message. The scope picker (one trip only), the
 * manual setup, a browser-side test, the key list and the privacy note sit under collapsibles
 * at the bottom, out of the way of someone doing this for the first time.
 */
export default function AutoCaptureSetup() {
  usePageTitle('Set up auto-capture')
  const { user } = useMe()
  const toast = useToast()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const groups = useGroups()
  const captures = useCaptures()
  const tokens = useCaptureTokens()
  const [prefs, setPrefs] = useState<AllPrefs | null>(null)
  const [log, setLog] = useState<LogRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => watchCapturePrefs(user.uid, repo.mode, setPrefs), [user.uid])
  useEffect(() => watchCaptureLog(user.uid, repo.mode, setLog, 5), [user.uid])

  const step: Step = params.get('step') === '3' ? 3 : params.get('step') === '2' ? 2 : 1
  const platform: Platform = params.get('platform') === 'android' ? 'android' : params.get('platform') === 'ios' ? 'ios' : guessPlatform()
  const scope = params.get('group') ?? ''
  const update = (patch: Record<string, string | undefined>, replace = false) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace })
  }
  const today = todayISO()
  const shared = useMemo(
    () =>
      (groups ?? [])
        .filter((g) => g.type !== 'personal' && g.type !== 'direct' && !g.archived)
        .sort((a, b) => Number(!!(b.startDate || b.endDate)) - Number(!!(a.startDate || a.endDate)) || b.updatedAt - a.updatedAt),
    [groups],
  )

  // Step 3 watches for the first message after it opened: a key's lastUsedAt moving, or a new activity row.
  // Server timestamps are only compared with each other, so clock skew doesn't matter.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `log` is the refresh trigger (the demo log and token use share one localStorage write)
  const demoUse = useMemo(() => (repo.mode === 'demo' ? demoTokenUse(user.uid) : {}), [user.uid, log])
  const lastUsed = (t: CaptureToken) => t.lastUsedAt ?? demoUse[t.token]
  const baseline = useRef<{ last: number; ids: Set<string> } | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the baseline is taken once per visit to step 3, from the first complete tokens + log
  useEffect(() => {
    if (step !== 3) {
      baseline.current = null
      return
    }
    if (!baseline.current && tokens && log) baseline.current = { last: Math.max(0, ...tokens.map((t) => lastUsed(t) ?? 0)), ids: new Set(log.map((r) => r.id)) }
  }, [step, tokens, log])
  const hitRow = step === 3 && baseline.current && log ? log.find((r) => !baseline.current!.ids.has(r.id)) : undefined
  const hitKey = step === 3 && baseline.current && tokens ? tokens.some((t) => (lastUsed(t) ?? 0) > baseline.current!.last) : false

  if (!groups || !tokens)
    return (
      <div>
        <PageHeader title="Auto-capture" back="/settings/automation" />
        <Loading />
      </div>
    )

  const group = scope ? groups.find((g) => g.id === scope) : undefined
  const check = group ? checkScope(group, today) : undefined
  const scopeUsable = !scope || (!!group && !!check?.ok)
  const token = tokens.find((t) => (t.groupId ?? '') === scope)
  const backTo = scope ? `/groups/${scope}` : '/settings/automation'
  const copyIt = async (text: string, what: string) => toast((await copy(text)) ? `${what} copied` : 'Couldn’t copy', 'ok')

  /** The key for the current scope, created on first use. */
  const ensureKey = async (): Promise<string> => token?.token ?? repo.createCaptureToken(user.uid, { groupId: group?.id, label: tokenLabel(group) })

  const start = async (p: Platform) => {
    if (!scopeUsable) return toast('Pick a trip with dates first, or use all your trips', 'err')
    setBusy(true)
    try {
      const key = await ensureKey()
      // Copied now so the iOS import question is a long-press → Paste; nothing to show if the clipboard is off.
      await copy(key)
      update({ step: '2', platform: p })
      window.scrollTo({ top: 0 })
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
  const setOutside = (v: boolean) => {
    if (!prefs) return
    setPrefs({ ...prefs, outsideTrips: v })
    saveCapturePrefs(user.uid, repo.mode, { outsideTrips: v }).catch((e) => toast(errText(e), 'err'))
  }
  const hasShared = platform === 'ios' ? !!IOS_SHORTCUT_URL : !!ANDROID_MACRO_URL

  return (
    <div>
      <PageHeader title="Auto-capture" subtitle={STEP_TITLES[step]} back={backTo} />
      <Progress step={step} />

      {step === 1 && (
        <section className="card p-5" data-testid="capture-step-1">
          <h2 className="text-xl font-extrabold leading-tight">Catch your payments automatically.</h2>
          <p className="text-muted mt-2 text-sm">
            When your bank texts you about a payment, your phone sends that text to {APP_NAME}. We ask “add this to your trip?” — nothing is added until you say
            yes.
          </p>
          <p className="text-muted mt-2 text-sm">OTPs, credits and balance alerts are ignored. Account numbers are masked before anything is saved.</p>
          {group && (
            <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-ink-800 dark:text-slate-300">
              For <b>{group.name}</b> only{formatRange(group.startDate, group.endDate) ? ` (${formatRange(group.startDate, group.endDate)})` : ''}.{' '}
              <button type="button" className="font-semibold text-brand-600 dark:text-brand-300" onClick={() => update({ group: undefined }, true)}>
                Use all my trips instead
              </button>
            </p>
          )}
          {scope && !group && (
            <Warn>
              That group isn’t in your list any more.{' '}
              <button type="button" className="font-semibold underline" onClick={() => update({ group: undefined }, true)}>
                Use all my trips
              </button>
            </Warn>
          )}
          {group && check && !check.ok && (
            <Warn>
              {check.message}{' '}
              {check.state === 'no_dates' && (
                <Link to={`/groups/${group.id}/edit`} className="font-semibold underline">
                  Add trip dates
                </Link>
              )}
            </Warn>
          )}
          <div className="mt-5 grid gap-2">
            {(guessPlatform() === 'android' ? (['android', 'ios'] as const) : (['ios', 'android'] as const)).map((p, i) => (
              <button
                key={p}
                type="button"
                className={`${i === 0 ? 'btn-primary' : 'btn-secondary'} w-full`}
                onClick={() => start(p)}
                disabled={busy || !scopeUsable}
                data-testid={`capture-start-${p}`}
              >
                {busy ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                ) : p === 'ios' ? (
                  <Apple size={18} aria-hidden />
                ) : (
                  <Smartphone size={18} aria-hidden />
                )}
                {p === 'ios' ? 'Set up on this iPhone' : 'Set up on this Android'}
              </button>
            ))}
          </div>
          <p className="text-muted mt-3 text-center text-xs">Takes about 3 minutes. Works with any bank that sends SMS.</p>
        </section>
      )}

      {step === 2 && (
        <section className="card space-y-4 p-4" data-testid="capture-step-2">
          <KeyBox
            token={token}
            busy={busy}
            onCopy={() => token && copyIt(token.token, 'Capture key')}
            onCreate={async () => {
              setBusy(true)
              try {
                await ensureKey()
              } catch (e) {
                toast(errText(e), 'err')
              } finally {
                setBusy(false)
              }
            }}
          />
          {platform === 'ios' ? (
            <IosScreen
              token={token?.token}
              onDone={() => {
                update({ step: '3' })
                window.scrollTo({ top: 0 })
              }}
            />
          ) : (
            <AndroidScreen
              token={token?.token}
              onDone={() => {
                update({ step: '3' })
                window.scrollTo({ top: 0 })
              }}
            />
          )}
        </section>
      )}

      {step === 3 && (
        <section className="card p-5 text-center" data-testid="capture-step-3">
          <div role="status" aria-live="polite">
            {hitRow || hitKey ? (
              <>
                <CheckCircle2 size={44} className="mx-auto text-emerald-600 dark:text-emerald-400" aria-hidden />
                <h2 className="mt-3 text-lg font-extrabold">
                  Got it:{' '}
                  {hitRow ? (
                    <>
                      {hitRow.amount ? formatMoney(hitRow.amount, hitRow.currency ?? 'INR') : 'a message'}
                      {hitRow.merchant ? ` at ${hitRow.merchant}` : ''}, {time(hitRow.at)}
                    </>
                  ) : (
                    'your phone forwarded a message just now'
                  )}
                </h2>
                {hitRow && hitRow.result !== 'captured' && (
                  <p className="text-muted mt-1 text-sm">{logResultText(hitRow)} — that’s fine, the phone side works.</p>
                )}
                <p className="mt-2 font-semibold text-emerald-700 dark:text-emerald-400">Auto-capture is on.</p>
              </>
            ) : (
              <>
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30" aria-hidden>
                  <span className="h-3 w-3 animate-pulse rounded-full bg-brand-600" />
                </span>
                <h2 className="mt-3 text-lg font-extrabold">Waiting for your phone…</h2>
                <p className="text-muted mt-2 text-sm">
                  We’ll light this up the moment your phone forwards a message. To try it now, pay anyone {formatMoney(100, 'INR')} on UPI, or ask a friend to
                  text you “Rs.1 debited test”.
                </p>
                {repo.mode === 'demo' && (
                  <p className="text-muted mt-2 text-xs">The demo has no server: send a simulated test from “Try it from this browser” below.</p>
                )}
              </>
            )}
          </div>
          {prefs && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-3 text-left dark:bg-ink-800" data-testid="capture-outside">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Keep every payment</div>
                  <div className="text-muted text-xs">
                    {prefs.outsideTrips
                      ? outsideTripsText(true)
                      : 'Off: only payments dated during a trip are kept. Payments outside every trip are ignored and never stored.'}
                  </div>
                </div>
                <Switch checked={prefs.outsideTrips} onChange={setOutside} label="Keep every payment" testId="capture-outside-switch" />
              </div>
              <p className="text-muted mt-2 text-xs">Change this later in Settings → Automation.</p>
            </div>
          )}
          {hitRow || hitKey ? (
            <Link to={backTo} className="btn-primary mt-4 w-full" data-testid="capture-done">
              <Check size={18} aria-hidden /> Done
            </Link>
          ) : (
            <Link to={backTo} className="btn-ghost mt-4 w-full">
              I’ll check later
            </Link>
          )}
        </section>
      )}

      {/* Everything else, out of the way. */}
      <div className="mt-6 space-y-3">
        {step >= 2 && hasShared && (
          <Collapsible title="Set up by hand" summary={platform === 'ios' ? 'Without the shared Shortcut' : 'Without the macro file'} testId="capture-manual">
            {platform === 'ios' ? <IosManual token={token?.token} onCopy={copyIt} /> : <AndroidManual token={token?.token} onCopy={copyIt} />}
          </Collapsible>
        )}
        <Collapsible
          title={repo.mode === 'demo' ? 'Send a simulated test' : 'Try it from this browser'}
          summary="Tests the server and your key, not your phone"
          defaultOpen={repo.mode === 'demo' && step === 3}
          testId="capture-test"
        >
          <TestSender token={token} group={group} groups={groups} captures={captures ?? []} platform={platform} outsideTrips={!!prefs?.outsideTrips} />
        </Collapsible>
        <Collapsible title="Only one trip" summary={group ? `${group.name} only` : 'All my trips'} testId="capture-scope">
          <p className="text-muted mb-3 text-xs">
            A key for one trip only accepts messages dated inside that trip. “All my trips” matches whichever trip the payment date falls in.
          </p>
          <div className="space-y-2" role="radiogroup" aria-label="Capture scope">
            <ScopeOption
              selected={!scope}
              onSelect={() => update({ group: undefined }, true)}
              icon={
                <span className="text-xl" aria-hidden>
                  🧳
                </span>
              }
              title="All my trips"
              detail={`Matches any trip whose dates include the payment. ${outsideTripsText(!!prefs?.outsideTrips)}`}
            />
            {shared.map((g) => (
              <ScopeOption
                key={g.id}
                selected={scope === g.id}
                onSelect={() => update({ group: g.id }, true)}
                icon={<GroupIcon emoji={g.emoji} size={32} />}
                title={g.name}
                detail={g.startDate || g.endDate ? formatRange(g.startDate, g.endDate) : 'No trip dates'}
                badge={inTripWindow(g, today) ? <LiveBadge type={g.type} /> : null}
              />
            ))}
          </div>
          {group &&
            check &&
            (check.ok ? (
              <p className="text-muted mt-3 text-xs">
                Only payments dated <b>{formatRange(group.startDate, group.endDate)}</b> are captured for {group.name}. {check.message}
              </p>
            ) : (
              <Warn>
                {check.message}{' '}
                {check.state === 'no_dates' && (
                  <Link to={`/groups/${group.id}/edit`} className="font-semibold underline">
                    Add trip dates
                  </Link>
                )}
              </Warn>
            ))}
        </Collapsible>
        <Collapsible
          title="Your capture keys"
          summary={tokens.length ? `${tokens.length} key${tokens.length === 1 ? '' : 's'}` : 'None yet'}
          testId="capture-keys-list"
        >
          {tokens.length === 0 ? (
            <p className="text-muted text-sm">No keys yet. One is created when you start.</p>
          ) : (
            <ul className="space-y-1">
              {tokens.map((t) => {
                const g = t.groupId ? groups.find((x) => x.id === t.groupId) : undefined
                const label = t.label ?? (t.groupId ? (g?.name ?? 'Trip') : 'All my trips')
                const at = lastUsed(t)
                return (
                  <SwipeRow
                    key={t.token}
                    contentClassName="flex items-center gap-2"
                    actions={[{ label: 'Revoke', ariaLabel: `Revoke capture key for ${label}`, onClick: () => revoke(t) }]}
                  >
                    <KeyRound size={16} className="shrink-0 text-slate-500" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{label}</div>
                      <div className="text-muted truncate text-xs">
                        {t.groupId
                          ? g
                            ? formatRange(g.startDate, g.endDate) || 'No trip dates'
                            : 'Its trip no longer exists: messages are ignored. Create a new key.'
                          : 'Any trip'}{' '}
                        · <code>{t.token.slice(0, 6)}…</code> · {formatDate(t.createdAt)} ·{' '}
                        {at ? `last received ${relativeTime(at, Date.now())}` : 'nothing received yet'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 dark:text-slate-300"
                      onClick={() => copyIt(t.token, 'Capture key')}
                      aria-label={`Copy capture key for ${label}`}
                    >
                      <Copy size={16} />
                    </button>
                  </SwipeRow>
                )
              })}
            </ul>
          )}
          <p className="text-muted mt-2 text-xs">
            A key lets your phone add payments to your Inbox and nothing else. Revoke one if it leaks or a phone is gone.
          </p>
        </Collapsible>
        <Collapsible title="Privacy" summary="What is kept, and what never leaves your phone" testId="capture-privacy">
          <p className="text-muted text-sm">
            The server keeps only what it read from the message (amount, currency, merchant, date, reference) and the message itself with account and card
            numbers masked. OTPs, credits and balance alerts are ignored and never stored. Revoking a key stops forwarding at once. Change what gets captured in{' '}
            <Link to="/settings/automation" className="font-semibold text-brand-600 dark:text-brand-300">
              Settings → Automation
            </Link>
            .
          </p>
        </Collapsible>
      </div>
    </div>
  )
}

function Progress({ step }: { step: Step }) {
  const labels = ['Turn on', 'Your phone', 'Test']
  return (
    <ol className="mb-4 flex items-center justify-center gap-2 px-1" aria-label="Setup steps">
      {labels.map((l, i) => {
        const n = (i + 1) as Step
        return (
          <li key={l} aria-current={n === step ? 'step' : undefined} className="flex items-center gap-1.5 text-xs font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${n <= step ? 'bg-brand-600' : 'bg-slate-300 dark:bg-ink-700'}`} aria-hidden />
            <span className={n === step ? '' : 'text-muted'}>{l}</span>
            {i < labels.length - 1 && <span className="ml-1 h-px w-4 bg-slate-300 dark:bg-ink-700" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

/** The capture key, big and copyable, with a one-tap create when the scope has none yet. */
function KeyBox({ token, busy, onCopy, onCreate }: { token?: CaptureToken; busy: boolean; onCopy: () => void; onCreate: () => void }) {
  if (!token) {
    return (
      <button type="button" className="btn-primary w-full" onClick={onCreate} disabled={busy}>
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <KeyRound size={18} aria-hidden />} Create your capture key
      </button>
    )
  }
  return (
    <div>
      <div className="label">Your capture key</div>
      <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2 pl-3 dark:bg-ink-800">
        <code className="min-w-0 flex-1 truncate text-sm" data-testid="capture-key">
          {token.token}
        </code>
        <button type="button" className="btn-secondary btn-sm" onClick={onCopy}>
          <Copy size={15} aria-hidden /> Copy
        </button>
      </div>
      <p className="text-muted mt-1.5 text-xs">Copied when you started. It lets your phone add payments to your Inbox, and nothing else.</p>
    </div>
  )
}

function ScopeOption({
  selected,
  onSelect,
  icon,
  title,
  detail,
  badge,
}: {
  selected: boolean
  onSelect: () => void
  icon: ReactNode
  title: string
  detail: string
  badge?: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition ${selected ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/20' : 'ring-slate-200 dark:ring-ink-700'}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold">
          <span className="truncate">{title}</span>
          {badge}
        </span>
        <span className="text-muted block text-xs">{detail}</span>
      </span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-fill text-on-fill' : 'ring-1 ring-slate-400 dark:ring-ink-600'}`}
        aria-hidden
      >
        {selected && <Check size={13} />}
      </span>
    </button>
  )
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="alert">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

// ---- Illustrated "screenshot-like" rows -----------------------------------

function Mock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 dark:bg-ink-800 dark:ring-ink-700" aria-hidden>
      <div className="text-muted border-b border-slate-200 px-3 py-1.5 text-center text-xs font-semibold dark:border-ink-700">{title}</div>
      <div className="space-y-px">{children}</div>
    </div>
  )
}
function MockRow({ k, v, accent }: { k: string; v?: ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white px-3 py-2 text-xs dark:bg-ink-900">
      <span className={accent ? 'font-semibold text-brand-600 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'}>{k}</span>
      {v !== undefined && <span className="text-muted min-w-0 truncate text-right">{v}</span>}
    </div>
  )
}
const Var = ({ children }: { children: ReactNode }) => (
  <span className="rounded-md bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">{children}</span>
)

function Checklist({ items }: { items: Array<{ text: ReactNode; mock?: ReactNode }> }) {
  return (
    <ol className="mt-3 space-y-4">
      {items.map((it, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered list of steps
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold dark:bg-ink-700" aria-hidden>
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-2 text-sm text-slate-700 dark:text-slate-200">
            <div>{it.text}</div>
            {it.mock}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---- Screen 2: iPhone -----------------------------------------------------

function IosScreen({ token, onDone }: { token?: string; onDone: () => void }) {
  if (!IOS_SHORTCUT_URL) {
    return (
      <>
        <h2 className="text-lg font-bold">Set up the automation in Shortcuts</h2>
        <IosManual token={token} />
        <button type="button" className="btn-primary w-full" onClick={onDone} data-testid="capture-step-2-done">
          <Check size={18} aria-hidden /> I’ve done this
        </button>
      </>
    )
  }
  return (
    <>
      <h2 className="text-lg font-bold">Two things to do in Shortcuts</h2>
      <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
        <p>
          <b>1. Add the {APP_NAME} shortcut.</b> Tap <i>Add Shortcut</i>. When it asks for your key, long-press the box and tap <i>Paste</i> — it’s already
          copied.
        </p>
        <a href={IOS_SHORTCUT_URL} className="btn-primary w-full" target="_blank" rel="noreferrer" data-testid="ios-add-shortcut">
          <Download size={18} aria-hidden /> Add Shortcut
        </a>
      </div>
      <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
        <p>
          <b>2. Make it run on every bank SMS.</b> In Shortcuts, tap <i>Automation</i> → <i>+</i> → <i>Message</i>. Leave <i>Sender</i> as it is, type a single
          space in <i>Message Contains</i>, choose <i>Run Immediately</i>, then <i>Next</i> → <i>Run Shortcut</i> → <i>{IOS_SHORTCUT_NAME}</i> → <i>Done</i>.
        </p>
        <Mock title="When">
          <MockRow k="Sender" v="Any Sender" />
          <MockRow k="Message Contains" v={<code>␣</code>} />
          <MockRow k="Run Immediately" v={<Check size={14} className="inline text-brand-600" />} />
          <MockRow k="Notify When Run" v={<span className="inline-block h-4 w-7 rounded-full bg-slate-300" />} />
        </Mock>
        <p className="text-muted text-xs">
          It runs on every message, but the Shortcut checks the text on your phone and only sends bank debit SMS. OTPs and personal messages never leave the
          device.
        </p>
      </div>
      <SenderNote />
      <button type="button" className="btn-primary w-full" onClick={onDone} data-testid="capture-step-2-done">
        <Check size={18} aria-hidden /> I’ve done both
      </button>
      <a className="btn-ghost btn-sm w-full" href={runShortcutUrl(IOS_SHORTCUT_NAME, sampleSms(todayISO(), randomRef()))}>
        <Send size={15} aria-hidden /> Test the Shortcut with a sample SMS
      </a>
    </>
  )
}

/**
 * Why the shared Shortcut's `sender` is the whole message, and why that's fine. Lets the user
 * decide whether to keep or clear the field.
 */
function SenderNote() {
  return (
    <details className="rounded-2xl bg-sky-50 p-3 text-xs text-sky-950 dark:bg-sky-500/10 dark:text-sky-100" data-testid="ios-sender-note">
      <summary className="cursor-pointer font-semibold">
        <Info size={14} className="mr-1 inline" aria-hidden /> About the “sender” field
      </summary>
      <div className="mt-2 space-y-1.5">
        <p>
          In the “{IOS_SHORTCUT_NAME}” Shortcut, <code>sender</code> is set to the whole <Var>Shortcut Input</Var>. iOS doesn’t give a shortcut the message’s{' '}
          <i>Sender</i> when an automation runs it, so the Shortcut can’t send just <i>AX-HDFCBK</i>.
        </p>
        <p>
          That’s fine: the server ignores any <code>sender</code> that doesn’t look like a short sender ID, and reads the bank name from the message text
          instead. You can leave it as it is.
        </p>
        <p>
          Prefer to send less? Delete the <code>sender</code> row in <b>Get Contents of URL</b>; captures work the same, and the rare alert that doesn’t name
          its bank shows no bank.
        </p>
      </div>
    </details>
  )
}

/** The manual iPhone path: one Message automation per debit keyword, posting to the webhook. */
function IosManual({ token, onCopy }: { token?: string; onCopy?: (text: string, what: string) => void }) {
  const url = webhookUrl(location.origin)
  return (
    <div className="space-y-3">
      <p className="text-muted text-xs">
        iOS 17 or later. Works with SMS from bank sender IDs such as AX-HDFCBK, because the trigger matches the message text, not the sender.
      </p>
      {onCopy && <CopyButtons token={token} platform="ios" onCopy={onCopy} />}
      <Checklist
        items={[
          {
            text: (
              <>
                Open <b>Shortcuts</b> → <b>Automation</b> → <b>+</b> → <b>Message</b>.
              </>
            ),
          },
          {
            text: (
              <>
                Leave <b>Sender</b> as <i>Any Sender</i>. In <b>Message Contains</b> type <b>debited</b> (without the shared Shortcut there’s no on-phone
                filter, so don’t trigger on every message). Choose <b>Run Immediately</b>, turn <b>Notify When Run</b> off, then <b>Next</b>.
              </>
            ),
            mock: (
              <Mock title="When">
                <MockRow k="Sender" v="Any Sender" />
                <MockRow k="Message Contains" v={<code>debited</code>} />
                <MockRow k="Run Immediately" v={<Check size={14} className="inline text-brand-600" />} />
                <MockRow k="Notify When Run" v={<span className="inline-block h-4 w-7 rounded-full bg-slate-300" />} />
              </Mock>
            ),
          },
          {
            text: (
              <>
                Choose <b>New Blank Automation</b> and add <b>Get Contents of URL</b> with URL <code className="break-all">{url}</code>, Method <b>POST</b>,
                Request Body <b>JSON</b>: <code>token</code> = your capture key{token ? ` (${token.slice(0, 8)}…)` : ''}, <code>text</code> ={' '}
                <Var>Shortcut Input</Var>, <code>device</code> = <code>ios</code>. Tap <b>Done</b>.
              </>
            ),
          },
          {
            text: (
              <>
                Repeat for{' '}
                <b>
                  {DEBIT_KEYWORDS.slice(1).map((k, i) => (
                    <span key={k}>
                      {i ? ' and ' : ''}“{k}”
                    </span>
                  ))}
                </b>{' '}
                to catch card and other UPI alerts.
              </>
            ),
          },
        ]}
      />
      <details className="text-muted rounded-2xl bg-slate-50 p-3 text-xs dark:bg-ink-800 dark:text-slate-300">
        <summary className="cursor-pointer font-semibold">If it doesn’t fire</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            Message automations see SMS in the <b>Messages</b> app only. Alerts inside a bank app or WhatsApp don’t count.
          </li>
          <li>
            In India, iOS sorts bank SMS into <b>Transactions</b> under <i>Unknown Senders</i>. The automation should still run; if it doesn’t, open Settings →
            Apps → Messages → Unknown &amp; Spam and check the filter.
          </li>
          <li>Some iOS 18 builds run automations late or only after unlocking. The capture still arrives with the SMS date.</li>
          <li>
            Check{' '}
            <Link to="/settings/automation" className="font-semibold underline">
              Recent activity
            </Link>{' '}
            in Settings → Automation: if a message shows up there, the phone side works and the entry says why it was or wasn’t captured.
          </li>
        </ul>
      </details>
    </div>
  )
}

function CopyButtons({ token, platform, onCopy }: { token?: string; platform: Platform; onCopy: (text: string, what: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="btn-secondary btn-sm" onClick={() => onCopy(webhookUrl(location.origin), 'Webhook URL')}>
        <Copy size={15} aria-hidden /> Webhook URL
      </button>
      <button type="button" className="btn-secondary btn-sm" disabled={!token} onClick={() => token && onCopy(bodyTemplateText(token, platform), 'JSON body')}>
        <Copy size={15} aria-hidden /> JSON body
      </button>
    </div>
  )
}

// ---- Screen 2: Android ----------------------------------------------------

function AndroidScreen({ token, onDone }: { token?: string; onDone: () => void }) {
  const toast = useToast()
  const [downloading, setDownloading] = useState(false)
  const download = async () => {
    if (!token || !ANDROID_MACRO_URL) return
    setDownloading(true)
    try {
      const res = await fetch(ANDROID_MACRO_URL)
      if (!res.ok) throw new Error(`The template answered ${res.status}`)
      const filled = fillMacroTemplate(await res.text(), { token, url: webhookUrl(location.origin) })
      if (!filled) return toast('The macro template has no place for your key. Set it up by hand below instead.', 'err')
      downloadText(macroFilename(APP_NAME), filled)
      toast('Macro downloaded. Import it in MacroDroid.')
    } catch (e) {
      toast(errText(e, 'Couldn’t download the macro'), 'err')
    } finally {
      setDownloading(false)
    }
  }
  return (
    <>
      <h2 className="text-lg font-bold">{ANDROID_MACRO_URL ? 'Install MacroDroid, import one file' : 'Install MacroDroid and set up one macro'}</h2>
      <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
        <p>
          <b>1.</b> Get MacroDroid (free; one macro is all this needs).
        </p>
        <a href={macrodroidPlayLink(navigator.userAgent)} className="btn-primary w-full" target="_blank" rel="noreferrer" data-testid="macrodroid-play">
          <Download size={18} aria-hidden /> Get MacroDroid on Google Play
        </a>
        <p className="text-muted text-xs">
          On another device?{' '}
          <a href={MACRODROID_PLAY_URL} className="font-semibold underline" target="_blank" rel="noreferrer">
            Open the Play listing
          </a>
          .
        </p>
      </div>
      {ANDROID_MACRO_URL ? (
        <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
          <p>
            <b>2.</b> Download your {APP_NAME} macro — it already has your capture key in it. Then in MacroDroid: <i>Macros</i> → <i>⋮</i> → <i>Import</i> →
            pick the file → allow SMS.
          </p>
          <button type="button" className="btn-secondary w-full" onClick={download} disabled={!token || downloading} data-testid="android-macro-download">
            {downloading ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />} Download your {APP_NAME} macro
          </button>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
          <p>
            <b>2.</b> Create the macro:
          </p>
          <AndroidManual token={token} onCopy={async (text, what) => toast((await copy(text)) ? `${what} copied` : 'Couldn’t copy', 'ok')} compact />
        </div>
      )}
      <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
        <p>
          <b>3.</b> Settings → Apps → MacroDroid → Battery → <i>Unrestricted</i>, so your phone doesn’t stop it tomorrow.
        </p>
        <details className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-500/10 dark:text-amber-100" data-testid="android-battery">
          <summary className="cursor-pointer font-semibold">
            <BatteryCharging size={14} className="mr-1 inline" aria-hidden /> Where that is on your phone
          </summary>
          <ul className="mt-2 space-y-1">
            {BATTERY_TIPS.map((t) => (
              <li key={t.brand}>
                <b>{t.brand}:</b> {t.steps}
              </li>
            ))}
          </ul>
          <p className="mt-1.5">
            Guides for each phone:{' '}
            <a href="https://dontkillmyapp.com" className="font-semibold underline" target="_blank" rel="noreferrer">
              dontkillmyapp.com
            </a>
            .
          </p>
        </details>
      </div>
      <button type="button" className="btn-primary w-full" onClick={onDone} data-testid="capture-step-2-done">
        <Check size={18} aria-hidden /> I’ve done this
      </button>
    </>
  )
}

/** The manual Android path: an SMS Received trigger with the on-phone filter and an HTTP Request action. */
function AndroidManual({ token, onCopy, compact }: { token?: string; onCopy: (text: string, what: string) => void; compact?: boolean }) {
  const url = webhookUrl(location.origin)
  return (
    <div className="space-y-3">
      <CopyButtons token={token} platform="android" onCopy={onCopy} />
      <Checklist
        items={[
          {
            text: (
              <>
                Open <b>MacroDroid</b> → <b>Macros</b> tab → <b>+</b> (Add Macro). Name it “{APP_NAME} SMS”.
              </>
            ),
          },
          {
            text: (
              <>
                Tap <b>+</b> under <b>Triggers</b> → <b>Call/SMS</b> → <b>SMS Received</b>. Choose <b>Any Number</b>. For the message content choose{' '}
                <b>Contains</b>, tick <b>Enable regex</b>, and paste the filter below. Allow the SMS permission when asked.
              </>
            ),
            mock: (
              <>
                <Mock title="SMS Received">
                  <MockRow k="Incoming from" v="Any Number" />
                  <MockRow k="Message content" v="Contains" />
                  <MockRow k="Enable regex" v={<Check size={14} className="inline text-brand-600" />} />
                  <MockRow k="Text" v={<code>(?is)^(?!.*\b(otp|…</code>} accent />
                </Mock>
                <div className="rounded-xl bg-white p-2 ring-1 ring-slate-200 dark:bg-ink-900 dark:ring-ink-700">
                  <div className="text-muted mb-1 flex items-center justify-between text-xs font-semibold">
                    On-phone filter (same as the iPhone Shortcut)
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center gap-1 px-2 text-brand-600 dark:text-brand-300"
                      onClick={() => onCopy(ANDROID_FILTER_REGEX, 'Filter')}
                    >
                      <Copy size={12} aria-hidden /> Copy
                    </button>
                  </div>
                  <code className="block break-all font-mono text-xs" data-testid="android-regex">
                    {ANDROID_FILTER_REGEX}
                  </code>
                  <p className="text-muted mt-1 text-xs">
                    Skips anything mentioning an OTP or password, then needs a debit word (debited, spent, paid, sent Rs, withdrawn) or an amount. OTPs and
                    personal messages never leave the phone.
                  </p>
                </div>
              </>
            ),
          },
          {
            text: (
              <>
                No <b>Enable regex</b> option in your version? Use <b>Contains</b> <code>debited</code> instead, and add two more SMS Received triggers for{' '}
                <b>spent</b> and <b>sent Rs</b> (a macro runs when any of its triggers fires). The server still ignores OTPs and credits.
              </>
            ),
          },
          {
            text: (
              <>
                Tap <b>+</b> under <b>Actions</b> → <b>Connectivity</b> → <b>HTTP Request</b>. Method <b>POST</b>, URL <code className="break-all">{url}</code>.
                In the body section choose content type <b>application/json</b> and paste the <b>JSON body</b> (copy button above).
              </>
            ),
            mock: (
              <Mock title="HTTP Request">
                <MockRow k="Method" v="POST" />
                <MockRow k="URL" v={url.replace(/^https?:\/\//, '')} />
                <MockRow k="Content type" v="application/json" />
                <MockRow k="Body" v={<code>{`{"token":"${token ? token.slice(0, 6) + '…' : 'key'}","text":"[sms_message]",…}`}</code>} accent />
              </Mock>
            ),
          },
          {
            text: (
              <>
                Check that <code>[sms_message]</code> and <code>[sms_number]</code> show as MacroDroid <b>magic text</b>. If they don’t, delete them and insert
                them again with the magic text button (<b>…</b>): <i>SMS message</i> and <i>SMS number</i>.
              </>
            ),
          },
          {
            text: (
              <>
                Leave <b>Constraints</b> empty and save (the tick). Make sure the macro’s switch is on.
              </>
            ),
          },
        ]}
      />
      {!compact && (
        <details className="text-muted rounded-2xl bg-slate-50 p-3 text-xs dark:bg-ink-800 dark:text-slate-300">
          <summary className="cursor-pointer font-semibold">Body without JSON</summary>
          <p className="mt-2">
            If a message with quotes breaks the JSON, use URL{' '}
            <code className="break-all">
              {url}?t={token ?? '<key>'}
            </code>
            , content type <b>text/plain</b>, and body <code>[sms_message]</code> only.
          </p>
        </details>
      )}
      <p className="text-muted text-xs">
        Tasker works the same way: <i>Event → Phone → Received Text</i> and <i>Net → HTTP Request</i> with <code>%SMSRB</code> (body) and <code>%SMSRF</code>{' '}
        (sender).
      </p>
    </div>
  )
}

// ---- Browser-side test ----------------------------------------------------

function TestSender({
  token,
  group,
  groups,
  captures,
  platform,
  outsideTrips,
}: {
  token?: CaptureToken
  group?: Group
  groups: Group[]
  captures: Capture[]
  platform: Platform
  outsideTrips: boolean
}) {
  const { user } = useMe()
  const toast = useToast()
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<TestOutcome>()
  const text = useMemo(() => sampleSms(sampleDate(todayISO(), group)), [group])

  const send = async () => {
    if (!token) return
    setSending(true)
    setOutcome(undefined)
    const body: WebhookBody = {
      token: token.token,
      text: sampleSms(sampleDate(todayISO(), group), randomRef()),
      sender: 'AX-HDFCBK',
      receivedAt: new Date().toISOString(),
      device: platform,
    }
    try {
      let res: TestOutcome
      if (repo.mode === 'demo') {
        const r = await simulateWebhook(body, { uid: user.uid, token, groups, captures })
        res = interpretResponse(200, r)
        if (r.ok && r.matchedGroupId) {
          const g = groups.find((x) => x.id === r.matchedGroupId)
          toast(`${formatMoney(r.parsed.amount, r.parsed.currency)} at ${r.parsed.merchant ?? 'a merchant'}: add to ${g?.name ?? 'your trip'}?`)
        }
      } else {
        const resp = await fetch(webhookUrl(location.origin), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const json = (resp.headers.get('content-type') ?? '').includes('json') ? await resp.json().catch(() => null) : null
        res = interpretResponse(resp.status, json)
      }
      setOutcome(res)
    } catch (e) {
      setOutcome({ kind: 'error', message: `Couldn’t reach the server (${errText(e)}). Are you offline?` })
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <p className="text-muted mb-3 text-xs">
        Sends this sample SMS to the server as if your phone had forwarded it. It checks the server and your key; a real bank SMS is what checks your phone’s
        automation.
      </p>
      <div className="rounded-2xl bg-slate-100 p-3 dark:bg-ink-800">
        <div className="text-muted mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <MessageSquareText size={13} aria-hidden /> AX-HDFCBK
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-white px-3 py-2 text-sm dark:bg-ink-900">{text}</div>
      </div>
      <button type="button" className="btn-secondary mt-3 w-full" onClick={send} disabled={!token || sending} data-testid="capture-send-test">
        {sending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Send size={18} aria-hidden />} Send test SMS
        {repo.mode === 'demo' ? ' (simulated)' : ''}
      </button>
      {!token && <p className="text-muted mt-2 text-xs">Start the setup first so you have a capture key.</p>}
      {outcome && <Outcome o={outcome} groups={groups} outsideTrips={outsideTrips} />}
    </div>
  )
}

function Outcome({ o, groups, outsideTrips }: { o: TestOutcome; groups: Group[]; outsideTrips: boolean }) {
  if (o.kind === 'ok') {
    const r = o.response
    const g = r.matchedGroupId ? groups.find((x) => x.id === r.matchedGroupId) : undefined
    return (
      <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100" role="status">
        <div className="flex items-center gap-2 font-bold">
          <CheckCircle2 size={18} aria-hidden /> Captured {formatMoney(r.parsed.amount, r.parsed.currency)}
          {r.parsed.merchant ? ` at ${r.parsed.merchant}` : ''}
        </div>
        <ul className="mt-1.5 space-y-0.5 text-xs">
          <li>
            Date {formatDate(r.parsed.date)}
            {r.parsed.ref ? ` · Ref ${r.parsed.ref}` : ''}
          </li>
          <li>
            {g ? (
              <>
                Matched trip <b>{g.name}</b>
              </>
            ) : outsideTrips ? (
              'No trip matched: it waits in your Inbox'
            ) : (
              'No trip matched: it was ignored (All bank & UPI payments is off)'
            )}
          </li>
          <li className="flex items-center gap-1">
            <Bell size={12} aria-hidden /> {r.pushed ? 'Notification sent' : 'No notification sent (none registered on this device, or no trip matched)'}
          </li>
        </ul>
        <Link to="/inbox" className="mt-2 inline-flex min-h-9 items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300">
          Open Inbox <ChevronRight size={15} aria-hidden />
        </Link>
      </div>
    )
  }
  const tone =
    o.kind === 'rejected'
      ? 'bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100'
      : 'bg-rose-50 text-rose-950 dark:bg-rose-500/10 dark:text-rose-100'
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-2xl p-3 text-sm ${tone}`} role="status">
      <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <div className="font-semibold">
          {o.kind === 'not_deployed' ? 'Backend not deployed yet' : o.kind === 'rejected' ? `Not captured (${o.reason})` : 'Test failed'}
        </div>
        <div className="text-xs">{o.message}</div>
      </div>
    </div>
  )
}

// ---- Demo mode: a local stand-in for the /api/capture function ------------

/**
 * Demo-mode stand-in for the webhook's parsing, using the same shared parser as the
 * Cloud Function (shared/sms-parse.ts via src/lib/sms-parse.ts).
 */
export function parseSmsDemo(text: string, today: string): ParsedSms | 'not_a_debit' | 'unparsed' {
  const p = parseBankSms(text)
  if (p.kind === 'unknown') return 'unparsed'
  if (p.kind !== 'debit') return 'not_a_debit'
  if (!p.amount) return 'unparsed'
  const date = p.date ?? today
  return { amount: p.amount, currency: p.currency, merchant: p.merchant, direction: 'debit', ref: p.ref, date }
}

/** Mask account/card numbers and balances (what the server stores). */
export const maskSms = (text: string) => maskBankSms(text)

async function simulateWebhook(body: WebhookBody, ctx: { uid: string; token: CaptureToken; groups: Group[]; captures: Capture[] }): Promise<WebhookResponse> {
  if (body.token !== ctx.token.token) return { ok: false, reason: 'bad_token' }
  const device = body.device ?? 'other'
  const now = Date.now()
  // Same outcomes and activity-log entries as functions/src/capture.ts, kept in localStorage.
  const done = (r: WebhookResponse, parsed?: ParsedSms, groupName?: string): WebhookResponse => {
    const result = r.ok ? 'captured' : r.reason
    if (result !== 'bad_token' && result !== 'rate_limited' && result !== 'bad_request') {
      appendDemoLog(
        ctx.uid,
        {
          at: now,
          result: result as CaptureLogEntry['result'],
          device,
          ...(parsed ? { amount: parsed.amount, currency: parsed.currency, ...(parsed.merchant ? { merchant: parsed.merchant } : {}) } : {}),
          ...(groupName ? { groupName } : {}),
        },
        ctx.token.token,
      )
    }
    return r
  }
  const prefs = demoCapturePrefs(ctx.uid)
  if (prefs.capturePaused) return done({ ok: false, reason: 'paused' })
  const parsed = parseSmsDemo(body.text, todayISO())
  if (typeof parsed === 'string') return done({ ok: false, reason: parsed })
  const filtered = filterReason(prefs, parsed, body.text)
  if (filtered) return done({ ok: false, reason: filtered }, parsed)
  const scoped = ctx.token.groupId ? ctx.groups.find((g) => g.id === ctx.token.groupId) : undefined
  // Trips this person paused (their own choice, not the group's) are skipped.
  const pausedIds = new Set(prefs.pausedTrips)
  if (scoped && pausedIds.has(scoped.id)) return done({ ok: false, reason: 'paused' }, parsed, scoped.name)
  if (ctx.token.groupId && (!scoped || !inTripWindow(scoped, parsed.date))) return done({ ok: false, reason: 'outside_trip' }, parsed, scoped?.name)
  const id = sanitiseRef(parsed.ref ? `sms_${parsed.ref}` : undefined)
  if (id && ctx.captures.some((c) => c.id === id)) return done({ ok: false, reason: 'duplicate' }, parsed)
  const matchedGroupId =
    scoped?.id ??
    rankGroupsForCapture(
      ctx.groups.filter((g) => !g.archived),
      { date: parsed.date, currency: parsed.currency, paused: pausedIds },
    ).best
  if (!matchedGroupId) {
    const off = pausedTrip(ctx.groups, parsed.date, pausedIds)
    if (off) return done({ ok: false, reason: 'paused' }, parsed, off.name)
    if (!prefs.outsideTrips) return done({ ok: false, reason: 'outside_trip' }, parsed)
  }
  const captureId = id ?? `sms_${randomRef()}`
  await repo.saveCapture(
    ctx.uid,
    draftToCapture(
      {
        amount: parsed.amount,
        currency: parsed.currency,
        merchant: parsed.merchant ?? 'UPI payment',
        date: parsed.date,
        ts: body.receivedAt,
        source: body.device === 'android' ? 'sms-android' : 'sms-ios',
        note: maskSms(body.text).slice(0, 200),
        ref: parsed.ref,
        group: matchedGroupId,
      },
      captureId,
    ),
  )
  return done({ ok: true, captureId, parsed, matchedGroupId, pushed: false }, parsed, ctx.groups.find((g) => g.id === matchedGroupId)?.name)
}
