import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Apple, BatteryCharging, Bell, Check, CheckCircle2, ChevronRight, Copy, Download, Info, KeyRound, Loader2, MessageSquareText, Send, Settings2, Smartphone, Trash2, XCircle } from 'lucide-react'
import { repo } from '@/data'
import { draftToCapture, type CaptureToken } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useCaptures, useGroups } from '@/hooks/data'
import type { Capture, Group } from '@/types'
import { APP_NAME } from '@/lib/brand'
import { inTripWindow, rankGroupsForCapture, sanitiseRef } from '@/lib/capture'
import { formatMoney } from '@/lib/money'
import { maskSms as maskBankSms, parseBankSms } from '@/lib/sms-parse'
import { copy } from '@/lib/share'
import { todayISO } from '@/lib/id'
import { filterReason, relativeTime, type CaptureLogEntry } from '@/lib/capture-filters'
import { appendDemoLog, captureSettingsLines, demoCapturePrefs, demoTokenUse, watchCapturePrefs } from '@/lib/capture-settings'
import type { AllPrefs } from '@/lib/push'
import {
  ANDROID_FILTER_REGEX, BATTERY_TIPS, DEBIT_KEYWORDS, IOS_SHORTCUT_NAME, MACRODROID_PLAY_URL, macrodroidPlayLink, bodyTemplateText, runShortcutUrl, checkScope, interpretResponse, randomRef, sampleDate, sampleSms, tokenLabel, webhookUrl,
  type ParsedSms, type TestOutcome, type WebhookBody, type WebhookResponse,
} from '@/lib/sms-setup'
import { GroupIcon } from '@/components/GroupIcon'
import { LiveBadge, Loading, PageHeader, Segmented, formatRange } from '@/components/Misc'
import { useToast } from '@/components/Toast'

const IOS_SHORTCUT_URL = (import.meta.env.VITE_IOS_SHORTCUT_URL as string | undefined)?.trim() || undefined
const ANDROID_MACRO_URL = (import.meta.env.VITE_ANDROID_MACRO_URL as string | undefined)?.trim() || undefined

type Platform = 'ios' | 'android'
const guessPlatform = (): Platform => (/android/i.test(navigator.userAgent) ? 'android' : 'ios')

/**
 * /settings/auto-capture[?group=<id>] — set up bank/UPI SMS forwarding to the capture webhook:
 * choose a scope, get a key, follow the iPhone or Android steps, send a test.
 */
export default function AutoCaptureSetup() {
  const { user } = useMe()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const groups = useGroups()
  const captures = useCaptures()
  const [tokens, setTokens] = useState<CaptureToken[] | null>(null)
  const [platform, setPlatform] = useState<Platform>(guessPlatform)
  const [busy, setBusy] = useState(false)
  const [prefs, setPrefs] = useState<AllPrefs | null>(null)
  useEffect(() => repo.watchCaptureTokens(user.uid, setTokens), [user.uid])
  useEffect(() => watchCapturePrefs(user.uid, repo.mode, setPrefs), [user.uid])

  const scope = params.get('group') ?? ''
  const setScope = (id: string) => setParams(id ? { group: id } : {}, { replace: true })
  const today = todayISO()

  const shared = useMemo(() => (groups ?? []).filter((g) => g.type !== 'personal' && g.type !== 'direct')
    .sort((a, b) => Number(!!(b.startDate || b.endDate)) - Number(!!(a.startDate || a.endDate)) || b.updatedAt - a.updatedAt), [groups])
  if (!groups || !tokens) return <Loading />

  const group = scope ? groups.find((g) => g.id === scope) : undefined
  const check = group ? checkScope(group, today) : undefined
  const scopeUsable = !scope || (group && check?.ok)
  const token = tokens.find((t) => (t.groupId ?? '') === scope)
  const copyIt = async (text: string, what: string) => toast((await copy(text)) ? `${what} copied` : 'Couldn’t copy', 'ok')
  const demoUse = repo.mode === 'demo' ? demoTokenUse(user.uid) : {}
  const lastUsed = (t: CaptureToken) => t.lastUsedAt ?? demoUse[t.token]
  const pausedTrips = groups.filter((g) => g.captureOff).map((g) => g.name)

  const create = async () => {
    setBusy(true)
    try {
      await repo.createCaptureToken(user.uid, { groupId: group?.id, label: tokenLabel(group) })
      toast('Key created')
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const revoke = async (t: CaptureToken) => {
    if (!confirm('Revoke this key? Automations using it will stop working.')) return
    await repo.revokeCaptureToken(t.token)
    toast('Key revoked')
  }

  return (
    <div>
      <PageHeader title="SMS auto-capture" subtitle="Bank & UPI alerts → “add to your trip?”" back="/profile" />

      <div className="card mb-4 p-4 text-sm text-slate-600 dark:text-slate-300">
        <p>When a debit SMS arrives (<i>“Rs.450 debited… to VPA zomato@…”</i>), an automation on your phone sends it to {APP_NAME}.
          If the payment falls inside a trip’s dates you get a notification asking whether to add it. Nothing is added until you confirm.</p>
      </div>

      {/* ---- Step 1: scope ---- */}
      <Step n={1} title="Which trips?">
        <div className="space-y-2" role="radiogroup" aria-label="Capture scope">
          <ScopeOption selected={!scope} onSelect={() => setScope('')} icon={<span className="text-xl">🧳</span>} title="All my trips"
            detail="Matches any trip whose dates include the payment. Debits outside every trip wait in the Inbox, without a notification." />
          {shared.map((g) => (
            <ScopeOption key={g.id} selected={scope === g.id} onSelect={() => setScope(g.id)} icon={<GroupIcon emoji={g.emoji} size={32} />} title={g.name}
              detail={g.startDate || g.endDate ? formatRange(g.startDate, g.endDate) : 'No trip dates'}
              badge={inTripWindow(g, today) ? <LiveBadge type={g.type} /> : null} />
          ))}
        </div>
        {scope && !group && <Warn>That group isn’t in your list any more. Pick another scope.</Warn>}
        {group && check && (check.ok
          ? <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-ink-800 dark:text-slate-300">🗓️ Only payments dated <b>{formatRange(group.startDate, group.endDate)}</b> are captured for {group.name}. {check.message}</p>
          : <Warn>{check.message} {check.state === 'no_dates' && <Link to={`/groups/${group.id}/edit`} className="font-semibold underline">Add trip dates</Link>}</Warn>)}
      </Step>

      {/* ---- Step 2: key ---- */}
      <Step n={2} title="Your capture key">
        {!scopeUsable ? (
          <p className="text-sm text-slate-500">Pick a scope with trip dates first.</p>
        ) : token ? (
          <div>
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
              <KeyRound size={16} className="shrink-0 text-slate-400" />
              <code className="min-w-0 flex-1 truncate text-sm" data-testid="capture-key">{token.token}</code>
              <button className="btn-secondary !min-h-9 !px-3 !py-1.5 text-sm" onClick={() => copyIt(token.token, 'Key')}><Copy size={15} /> Copy</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Scope: <b>{token.label ?? tokenLabel(group)}</b>. Anyone with this key can add pending items to your inbox, never read your data. Revoke it below if it leaks.</p>
          </div>
        ) : (
          <button className="btn-primary w-full" onClick={create} disabled={busy}><KeyRound size={18} /> Create key for {group ? group.name : 'all trips'}</button>
        )}
      </Step>

      {/* ---- Step 3: phone ---- */}
      <Step n={3} title="Set up your phone">
        <Segmented<Platform> value={platform} onChange={setPlatform} options={[
          { value: 'ios', label: <span className="inline-flex items-center gap-1"><Apple size={15} /> iPhone</span> },
          { value: 'android', label: <span className="inline-flex items-center gap-1"><Smartphone size={15} /> Android</span> },
        ]} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-secondary text-sm" onClick={() => copyIt(webhookUrl(location.origin), 'Webhook URL')}><Copy size={15} /> Webhook URL</button>
          <button className="btn-secondary text-sm" disabled={!token} onClick={() => token && copyIt(bodyTemplateText(token.token, platform), 'JSON body')}><Copy size={15} /> JSON body</button>
        </div>
        {platform === 'ios' ? <IosSteps token={token?.token} /> : <AndroidSteps token={token?.token} />}
      </Step>

      {/* ---- Step 4: test ---- */}
      <Step n={4} title="Send a test">
        <TestSender token={token} group={group} groups={groups} captures={captures ?? []} platform={platform} />
      </Step>

      {/* ---- Step 5: summary ---- */}
      <Step n={5} title="You’re set">
        {prefs ? (
          <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200" data-testid="capture-summary">
            {captureSettingsLines(prefs, pausedTrips).map((l) => (
              <li key={l} className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" /><span>{l}</span></li>
            ))}
            {tokens.length > 0 && <li className="flex items-start gap-2"><KeyRound size={15} className="mt-0.5 shrink-0 text-slate-400" /><span>{tokens.length} key{tokens.length === 1 ? '' : 's'}{tokens.some(lastUsed) ? '' : ', nothing received yet'}</span></li>}
          </ul>
        ) : <p className="text-sm text-slate-500">Loading your settings…</p>}
        <Link to="/profile#auto-capture" className="btn-secondary mt-3 w-full" data-testid="capture-settings-link"><Settings2 size={17} /> Filters, pause &amp; recent activity</Link>
        <p className="mt-2 text-xs text-slate-500">In Profile → Auto-capture: pause capture, skip small payments or keywords (SIP, rent…), pause one trip, and see what happened to each forwarded message.</p>
      </Step>

      {/* ---- Keys ---- */}
      <section className="mt-6">
        <h2 className="mb-2.5 px-1 text-lg font-bold">Your keys</h2>
        {tokens.length === 0 ? <p className="px-1 text-sm text-slate-500">No keys yet.</p> : (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {tokens.map((t) => {
              const g = t.groupId ? groups.find((x) => x.id === t.groupId) : undefined
              return (
                <div key={t.token} className="flex items-center gap-3 px-4 py-3">
                  <KeyRound size={18} className="shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.label ?? (t.groupId ? g?.name ?? 'Trip' : 'All my trips')}</div>
                    <div className="truncate text-xs text-slate-500">
                      {t.groupId ? (g ? formatRange(g.startDate, g.endDate) || 'No trip dates' : 'Group no longer available') : 'Any trip'} · <code>{t.token.slice(0, 6)}…</code> · {new Date(t.createdAt).toLocaleDateString()}
                    </div>
                    <div className="truncate text-xs text-slate-500">{lastUsed(t) ? `Last received ${relativeTime(lastUsed(t)!, Date.now())}` : 'Nothing received yet'}</div>
                  </div>
                  <button className="rounded-full p-2 text-slate-500" onClick={() => copyIt(t.token, 'Key')} aria-label={`Copy key ${t.label ?? ''}`}><Copy size={16} /></button>
                  <button className="rounded-full p-2 text-rose-500" onClick={() => revoke(t)} aria-label={`Revoke key ${t.label ?? ''}`}><Trash2 size={16} /></button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <details className="mt-6 rounded-2xl px-1 text-sm text-slate-500">
        <summary className="cursor-pointer font-semibold">Privacy</summary>
        <p className="mt-2">The server keeps only what it parsed (amount, currency, merchant, date, reference) and the message with account and card numbers masked. OTPs, credits and balance alerts are ignored. Revoking a key stops forwarding at once.</p>
      </details>
      <Link to="/profile#auto-capture" className="mt-3 block px-1 text-sm font-semibold text-brand-600 dark:text-brand-300">Profile → Auto-capture (settings, Apple Pay Shortcut and capture links) →</Link>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="card mb-3 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function ScopeOption({ selected, onSelect, icon, title, detail, badge }: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; detail: string; badge?: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition ${selected ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/20' : 'ring-slate-200 dark:ring-ink-700'}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold"><span className="truncate">{title}</span>{badge}</span>
        <span className="block text-xs text-slate-500">{detail}</span>
      </span>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-brand-600 text-white' : 'ring-1 ring-slate-300 dark:ring-ink-600'}`}>{selected && <Check size={13} />}</span>
    </button>
  )
}

function Warn({ children }: { children: ReactNode }) {
  return <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{children}</span></p>
}

// ---- Illustrated "screenshot-like" checklist rows -------------------------

function Mock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 dark:bg-ink-800 dark:ring-ink-700">
      <div className="border-b border-slate-200 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-500 dark:border-ink-700">{title}</div>
      <div className="space-y-px">{children}</div>
    </div>
  )
}
function MockRow({ k, v, accent }: { k: string; v?: ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white px-3 py-2 text-xs dark:bg-ink-900">
      <span className={accent ? 'font-semibold text-brand-600 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'}>{k}</span>
      {v !== undefined && <span className="min-w-0 truncate text-right text-slate-500">{v}</span>}
    </div>
  )
}
const Var = ({ children }: { children: ReactNode }) => <span className="rounded-md bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">{children}</span>

function Checklist({ items }: { items: Array<{ text: ReactNode; mock?: ReactNode }> }) {
  return (
    <ol className="mt-4 space-y-4">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold dark:bg-ink-700">{i + 1}</span>
          <div className="min-w-0 flex-1 space-y-2 text-sm text-slate-700 dark:text-slate-200">
            <div>{it.text}</div>
            {it.mock}
          </div>
        </li>
      ))}
    </ol>
  )
}

function IosSteps({ token }: { token?: string }) {
  const url = webhookUrl(location.origin)
  return (
    <div className="mt-4">
      {IOS_SHORTCUT_URL && (
        <div className="mb-4 rounded-2xl bg-brand-50 p-3 dark:bg-brand-900/20">
          <a href={IOS_SHORTCUT_URL} className="btn-primary w-full" target="_blank" rel="noreferrer"><Download size={18} /> Add “{APP_NAME} SMS” Shortcut</a>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">When Shortcuts asks for your key, paste the key from step 2{token ? '' : ' (create it first)'}. Then do steps 3–7 below to make it run on every debit SMS.</p>
        </div>
      )}
      <p className="text-xs text-slate-500">iOS 17 or later. Works with SMS from bank sender IDs such as AX-HDFCBK, because the trigger matches the message text, not the sender.</p>
      <Checklist items={[
        { text: <>Open <b>Shortcuts</b> → <b>Automation</b> → <b>+</b> → <b>Message</b>.</> },
        {
          text: IOS_SHORTCUT_URL
            ? <>Leave <b>Sender</b> as <i>Any Sender</i>. In <b>Message Contains</b> type a single <b>space</b> (iOS needs one field filled; every SMS contains a space). Choose <b>Run Immediately</b> and turn <b>Notify When Run</b> off, then <b>Next</b>.</>
            : <>Leave <b>Sender</b> as <i>Any Sender</i>. In <b>Message Contains</b> type <b>debited</b> (without the shared Shortcut there’s no on-phone filter, so don’t trigger on every message). Choose <b>Run Immediately</b>, turn <b>Notify When Run</b> off, then <b>Next</b>.</>,
          mock: <Mock title="When"><MockRow k="Sender" v="Any Sender" /><MockRow k="Message Contains" v={<code>{IOS_SHORTCUT_URL ? '␣' : 'debited'}</code>} /><MockRow k="Run Immediately" v={<Check size={14} className="inline text-brand-600" />} /><MockRow k="Notify When Run" v={<span className="inline-block h-4 w-7 rounded-full bg-slate-300" />} /></Mock>,
        },
        {
          text: IOS_SHORTCUT_URL
            ? <>Choose <b>Run Shortcut</b> → <b>{IOS_SHORTCUT_NAME}</b>. Tap the arrow on the action and set <b>Input</b> to <Var>Shortcut Input</Var>. Tap <b>Done</b>.</>
            : <>Choose <b>New Blank Automation</b> and add <b>Get Contents of URL</b> with URL <code className="break-all">{url}</code>, Method <b>POST</b>, Request Body <b>JSON</b>: <code>token</code> = your key{token ? ` (${token.slice(0, 8)}…)` : ''}, <code>text</code> = <Var>Shortcut Input</Var>, <code>device</code> = <code>ios</code>. Tap <b>Done</b>.</>,
        },
        IOS_SHORTCUT_URL
          ? { text: <>That’s the only automation you need. It runs on every message, but the Shortcut checks the text <b>on your phone</b> and only sends bank debit SMS. OTPs and personal messages never leave the device.</> }
          : { text: <>Optional: repeat for <b>{DEBIT_KEYWORDS.slice(1).map((k, i) => <span key={k}>{i ? ' and ' : ''}“{k}”</span>)}</b> to catch card and other UPI alerts.</> },
      ]} />
      <SenderNote shared={!!IOS_SHORTCUT_URL} />
      {IOS_SHORTCUT_URL && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
          <a
            className="btn-secondary w-full"
            href={runShortcutUrl(IOS_SHORTCUT_NAME, sampleSms(todayISO(), randomRef()))}
          >
            <Send size={16} /> Test the Shortcut on this iPhone
          </a>
          <p className="mt-2 text-xs text-slate-500">Runs “{IOS_SHORTCUT_NAME}” with a sample ₹250 SMS, exactly as the automation would. A capture should land in your Inbox within a few seconds. This tests the Shortcut and your key; a real debit SMS tests the automation.</p>
        </div>
      )}
      <details className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-ink-800 dark:text-slate-300">
        <summary className="cursor-pointer font-semibold">If it doesn’t fire</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Message automations see SMS in the <b>Messages</b> app only. Alerts inside a bank app or WhatsApp don’t count.</li>
          <li>In India, iOS sorts bank SMS into <b>Transactions</b> under <i>Unknown Senders</i>. The automation should still run; if it doesn’t, open Settings → Apps → Messages → Unknown &amp; Spam and check the filter.</li>
          <li>Some iOS 18 builds run automations late or only after unlocking. The capture still arrives with the SMS date.</li>
          <li>Prefer one rigid keyword per automation: “debited” covers most HDFC, ICICI, SBI and Axis UPI alerts.</li>
          <li>Check <Link to="/profile#auto-capture" className="font-semibold underline">Recent activity</Link> in Profile → Auto-capture: if a message shows up there, the phone side works and the entry says why it was or wasn’t captured.</li>
        </ul>
      </details>
    </div>
  )
}

/**
 * Why the shared Shortcut's `sender` is the whole message, and why that's fine. Lets the user
 * decide whether to keep or clear the field.
 */
function SenderNote({ shared }: { shared: boolean }) {
  return (
    <details className="mt-4 rounded-2xl bg-sky-50 p-3 text-xs text-sky-900 dark:bg-sky-500/10 dark:text-sky-100" data-testid="ios-sender-note">
      <summary className="cursor-pointer font-semibold"><Info size={14} className="mr-1 inline" /> About the “sender” field</summary>
      <div className="mt-2 space-y-1.5">
        <p>{shared ? <>In the “{IOS_SHORTCUT_NAME}” Shortcut, <code>sender</code> is set to the whole <Var>Shortcut Input</Var>.</> : <>If you add a <code>sender</code> field, set it to <Var>Shortcut Input</Var>.</>} iOS doesn’t give a shortcut the message’s <i>Sender</i> when an automation runs it, so the Shortcut can’t send just <i>AX-HDFCBK</i>.</p>
        <p>That’s fine: the server ignores any <code>sender</code> that doesn’t look like a short sender ID, and reads the bank name from the message text instead (almost every bank SMS names the bank). You can leave it as it is.</p>
        <p>The trade-off: for the rare bank SMS that doesn’t name the bank, the capture shows no bank. Prefer to send less? Delete the <code>sender</code> row in <b>Get Contents of URL</b>; captures work the same.</p>
      </div>
    </details>
  )
}

function AndroidSteps({ token }: { token?: string }) {
  const url = webhookUrl(location.origin)
  const toast = useToast()
  const copyRegex = async () => toast((await copy(ANDROID_FILTER_REGEX)) ? 'Filter copied' : 'Couldn’t copy', 'ok')
  return (
    <div className="mt-4">
      <div className="rounded-2xl bg-brand-50 p-3 dark:bg-brand-900/20">
        <a href={macrodroidPlayLink(navigator.userAgent)} className="btn-primary w-full" target="_blank" rel="noreferrer" data-testid="macrodroid-play">
          <Download size={18} /> Get MacroDroid on Google Play
        </a>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Free (ad-supported, up to 5 macros; this needs one). On another device? <a href={MACRODROID_PLAY_URL} className="font-semibold underline" target="_blank" rel="noreferrer">Open the Play listing</a>.</p>
      </div>
      {ANDROID_MACRO_URL && (
        <a href={ANDROID_MACRO_URL} download className="btn-secondary mt-3 w-full"><Download size={18} /> Download MacroDroid template</a>
      )}
      <Checklist items={[
        { text: <>Open <b>MacroDroid</b> → <b>Macros</b> tab → <b>+</b> (Add Macro). Name it “{APP_NAME} SMS”.</> },
        {
          text: <>Tap <b>+</b> under <b>Triggers</b> → <b>Call/SMS</b> → <b>SMS Received</b>. Choose <b>Any Number</b>. For the message content choose <b>Contains</b>, tick <b>Enable regex</b>, and paste the filter below. Allow the SMS permission when asked.</>,
          mock: (
            <>
              <Mock title="SMS Received"><MockRow k="Incoming from" v="Any Number" /><MockRow k="Message content" v="Contains" /><MockRow k="Enable regex" v={<Check size={14} className="inline text-brand-600" />} /><MockRow k="Text" v={<code>(?is)^(?!.*\b(otp|…</code>} accent /></Mock>
              <div className="rounded-xl bg-white p-2 ring-1 ring-slate-200 dark:bg-ink-900 dark:ring-ink-700">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  On-phone filter (same as the iPhone Shortcut)
                  <button type="button" className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300" onClick={copyRegex}><Copy size={12} /> Copy</button>
                </div>
                <code className="block break-all font-mono text-[11px]" data-testid="android-regex">{ANDROID_FILTER_REGEX}</code>
                <p className="mt-1 text-[11px] text-slate-500">Skips anything mentioning an OTP or password, then needs a debit word (debited, spent, paid, sent Rs, withdrawn) or an amount. OTPs and personal messages never leave the phone.</p>
              </div>
            </>
          ),
        },
        { text: <>No <b>Enable regex</b> option in your version? Use <b>Contains</b> <code>debited</code> instead, and add two more SMS Received triggers for <b>spent</b> and <b>sent Rs</b> (a macro runs when any of its triggers fires). The server still ignores OTPs and credits.</> },
        {
          text: <>Tap <b>+</b> under <b>Actions</b> → <b>Connectivity</b> → <b>HTTP Request</b>. Method <b>POST</b>, URL <code className="break-all">{url}</code>. In the body section choose content type <b>application/json</b> and paste the <b>JSON body</b> (copy button above).</>,
          mock: (
            <Mock title="HTTP Request">
              <MockRow k="Method" v="POST" />
              <MockRow k="URL" v={url.replace(/^https?:\/\//, '')} />
              <MockRow k="Content type" v="application/json" />
              <MockRow k="Body" v={<code>{`{"token":"${token ? token.slice(0, 6) + '…' : 'key'}","text":"[sms_message]",…}`}</code>} accent />
            </Mock>
          ),
        },
        { text: <>Check that <code>[sms_message]</code> and <code>[sms_number]</code> show as MacroDroid <b>magic text</b>. If they don’t, delete them and insert them again with the magic text button (<b>…</b>): <i>SMS message</i> and <i>SMS number</i>.</> },
        { text: <>Leave <b>Constraints</b> empty and save (the tick). Make sure the macro’s switch is on.</> },
      ]} />
      <details className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100" open data-testid="android-battery">
        <summary className="cursor-pointer font-semibold"><BatteryCharging size={14} className="mr-1 inline" /> Stop your phone killing MacroDroid</summary>
        <p className="mt-2">Battery savers on many Android phones stop background apps, so forwarding quietly stops after a day or two. Exempt MacroDroid (menu names vary by version):</p>
        <ul className="mt-1.5 space-y-1">
          {BATTERY_TIPS.map((t) => <li key={t.brand}><b>{t.brand}:</b> {t.steps}</li>)}
        </ul>
        <p className="mt-1.5">Guides for each phone: <a href="https://dontkillmyapp.com" className="font-semibold underline" target="_blank" rel="noreferrer">dontkillmyapp.com</a>. After your next payment, check <b>Recent activity</b> in Profile → Auto-capture.</p>
      </details>
      <details className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-ink-800 dark:text-slate-300">
        <summary className="cursor-pointer font-semibold">Body without JSON</summary>
        <p className="mt-2">If a message with quotes breaks the JSON, use URL <code className="break-all">{url}?t={token ?? '<key>'}</code>, content type <b>text/plain</b>, and body <code>[sms_message]</code> only.</p>
      </details>
      <p className="mt-3 text-xs text-slate-500">Tasker works the same way: <i>Event → Phone → Received Text</i> and <i>Net → HTTP Request</i> with <code>%SMSRB</code> (body) and <code>%SMSRF</code> (sender).</p>
    </div>
  )
}

// ---- Step 4: test -------------------------------------------------------

function TestSender({ token, group, groups, captures, platform }: { token?: CaptureToken; group?: Group; groups: Group[]; captures: Capture[]; platform: Platform }) {
  const { user } = useMe()
  const toast = useToast()
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<TestOutcome>()
  const text = useMemo(() => sampleSms(sampleDate(todayISO(), group)), [group])

  const send = async () => {
    if (!token) return
    setSending(true); setOutcome(undefined)
    const body: WebhookBody = { token: token.token, text: sampleSms(sampleDate(todayISO(), group), randomRef()), sender: 'AX-HDFCBK', receivedAt: new Date().toISOString(), device: platform }
    try {
      let res: TestOutcome
      if (repo.mode === 'demo') {
        const r = await simulateWebhook(body, { uid: user.uid, token, groups, captures })
        res = interpretResponse(200, r)
        if (r.ok && r.matchedGroupId) {
          const g = groups.find((x) => x.id === r.matchedGroupId)
          toast(`🔔 ${formatMoney(r.parsed.amount, r.parsed.currency)} at ${r.parsed.merchant ?? 'a merchant'}: add to ${g?.name ?? 'your trip'}?`)
        }
      } else {
        const resp = await fetch(webhookUrl(location.origin), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const json = (resp.headers.get('content-type') ?? '').includes('json') ? await resp.json().catch(() => null) : null
        res = interpretResponse(resp.status, json)
      }
      setOutcome(res)
    } catch (e) {
      setOutcome({ kind: 'error', message: `Couldn’t reach the server (${(e as Error).message}). Are you offline?` })
    } finally { setSending(false) }
  }

  return (
    <div>
      <div className="rounded-2xl bg-slate-100 p-3 dark:bg-ink-800">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><MessageSquareText size={13} /> AX-HDFCBK</div>
        <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-white px-3 py-2 text-sm dark:bg-ink-900">{text}</div>
      </div>
      <button className="btn-primary mt-3 w-full" onClick={send} disabled={!token || sending}>
        {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Send test SMS{repo.mode === 'demo' ? ' (demo, simulated)' : ''}
      </button>
      {!token && <p className="mt-2 text-xs text-slate-500">Create a key in step 2 first.</p>}
      {outcome && <Outcome o={outcome} groups={groups} />}
    </div>
  )
}

function Outcome({ o, groups }: { o: TestOutcome; groups: Group[] }) {
  if (o.kind === 'ok') {
    const r = o.response
    const g = r.matchedGroupId ? groups.find((x) => x.id === r.matchedGroupId) : undefined
    return (
      <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100" role="status">
        <div className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} /> Captured {formatMoney(r.parsed.amount, r.parsed.currency)}{r.parsed.merchant ? ` at ${r.parsed.merchant}` : ''}</div>
        <ul className="mt-1.5 space-y-0.5 text-xs">
          <li>Date {r.parsed.date}{r.parsed.ref ? ` · Ref ${r.parsed.ref}` : ''}</li>
          <li>{g ? <>Matched trip <b>{g.name}</b></> : 'No trip matched: it waits in your Inbox'}</li>
          <li className="flex items-center gap-1"><Bell size={12} /> {r.pushed ? 'Notification sent' : 'No notification sent (none registered on this device, or no trip matched)'}</li>
        </ul>
        <Link to="/inbox" className="mt-2 inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">Open Inbox <ChevronRight size={15} /></Link>
      </div>
    )
  }
  const tone = o.kind === 'rejected' ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100'
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-2xl p-3 text-sm ${tone}`} role="status">
      <XCircle size={18} className="mt-0.5 shrink-0" />
      <div>
        <div className="font-semibold">{o.kind === 'not_deployed' ? 'Backend not deployed yet' : o.kind === 'rejected' ? `Not captured (${o.reason})` : 'Test failed'}</div>
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

async function simulateWebhook(
  body: WebhookBody,
  ctx: { uid: string; token: CaptureToken; groups: Group[]; captures: Capture[] },
): Promise<WebhookResponse> {
  if (body.token !== ctx.token.token) return { ok: false, reason: 'bad_token' }
  const device = body.device ?? 'other'
  const now = Date.now()
  // Same outcomes and activity-log entries as functions/src/capture.ts, kept in localStorage.
  const done = (r: WebhookResponse, parsed?: ParsedSms, groupName?: string): WebhookResponse => {
    const result = r.ok ? 'captured' : r.reason
    if (result !== 'bad_token' && result !== 'rate_limited' && result !== 'bad_request') {
      appendDemoLog(ctx.uid, {
        at: now, result: result as CaptureLogEntry['result'], device,
        ...(parsed ? { amount: parsed.amount, currency: parsed.currency, ...(parsed.merchant ? { merchant: parsed.merchant } : {}) } : {}),
        ...(groupName ? { groupName } : {}),
      }, ctx.token.token)
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
  if (scoped?.captureOff) return done({ ok: false, reason: 'paused' }, parsed, scoped.name)
  if (ctx.token.groupId && (!scoped || !inTripWindow(scoped, parsed.date))) return done({ ok: false, reason: 'outside_trip' }, parsed, scoped?.name)
  const id = sanitiseRef(parsed.ref ? `sms_${parsed.ref}` : undefined)
  if (id && ctx.captures.some((c) => c.id === id)) return done({ ok: false, reason: 'duplicate' }, parsed)
  const matchedGroupId = scoped?.id ?? rankGroupsForCapture(ctx.groups.filter((g) => !g.captureOff), { date: parsed.date, currency: parsed.currency }).best
  if (!matchedGroupId) {
    const off = ctx.groups.find((g) => g.captureOff && g.type !== 'personal' && inTripWindow(g, parsed.date))
    if (off) return done({ ok: false, reason: 'paused' }, parsed, off.name)
    if (!prefs.outsideTrips) return done({ ok: false, reason: 'outside_trip' }, parsed)
  }
  const captureId = id ?? `sms_${randomRef()}`
  await repo.saveCapture(ctx.uid, draftToCapture({
    amount: parsed.amount, currency: parsed.currency, merchant: parsed.merchant ?? 'UPI payment', date: parsed.date,
    ts: body.receivedAt, source: body.device === 'android' ? 'sms-android' : 'sms-ios', note: maskSms(body.text).slice(0, 200),
    ref: parsed.ref, group: matchedGroupId,
  }, captureId))
  return done({ ok: true, captureId, parsed, matchedGroupId, pushed: false }, parsed, ctx.groups.find((g) => g.id === matchedGroupId)?.name)
}
