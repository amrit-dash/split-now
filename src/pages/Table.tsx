import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  LogIn,
  Minus,
  Pencil,
  Plus,
  QrCode as QrIcon,
  Receipt,
  Share2,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { repo } from '@/data'
import type { TablePatch } from '@/data/repo'
import { useAuth } from '@/hooks/auth'
import { demoGuestId, useAnonymousSignIn } from '@/hooks/useGuest'
import { colorFor } from '@/lib/colors'
import { uid } from '@/lib/id'
import { centsToInput, formatMoney, parseMoney } from '@/lib/money'
import { payOptions } from '@/lib/payments'
import { copy, shareOrCopy } from '@/lib/share'
import { errText } from '@/lib/errors'
import { usePageTitle } from '@/lib/brand'
import { canMarkPaid, payLinkUrl } from '@/lib/paylinks'
import { usePayLink } from '@/hooks/data'
import {
  computeTableTotals,
  extrasParts,
  formatCode,
  isExpired,
  MAX_SHARES,
  orderedItems,
  parseCode,
  participantOrder,
  sanitizeClaims,
  setShares,
  tableTotal,
  taxSplitHint,
  taxSplitOf,
  toggleClaim,
  validateName,
  type LiveTable,
  type ParticipantId,
  type TaxSplit,
  type TableTotals,
} from '@/lib/table'
import { Avatar } from '@/components/Avatar'
import { Empty, Loading, PageHeader, Segmented } from '@/components/Misc'
import { GuestPay } from '@/components/GuestPay'
import { MarkPaid } from '@/components/MarkPaid'
import { QrCode } from '@/components/QrCode'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'

// Uses useGroups (signed-in users only), so it's loaded just for the host.
const TableFinish = lazy(() => import('./TableFinish'))

const NAME_KEY = 'splitit-table-name'

const safeGet = (s: Storage, k: string) => {
  try {
    return s.getItem(k)
  } catch {
    return null
  }
}
const safeSet = (s: Storage, k: string, v: string) => {
  try {
    s.setItem(k, v)
  } catch {
    /* storage unavailable */
  }
}

interface Viewer {
  pid?: string
  name?: string
  signedIn: boolean
  error?: string
}

/**
 * Who is looking at the table. Firebase: the signed-in user, or an anonymous guest (signed in
 * automatically, no account). Demo: the demo user, or a per-tab guest (?guest=demo or signed out),
 * so a second tab can play a second phone.
 */
function useViewer(): Viewer {
  const { user, profile } = useAuth()
  const [params] = useSearchParams()
  const error = useAnonymousSignIn()
  if (repo.mode === 'demo' && (params.get('guest') === 'demo' || !user)) return { pid: demoGuestId(() => uid('guest_')), signedIn: false }
  if (!user) return { signedIn: false, error }
  return { pid: user.uid, name: user.isAnonymous ? undefined : (profile?.displayName ?? user.displayName), signedIn: !user.isAnonymous }
}

function useTable(code: string | undefined) {
  const [t, setT] = useState<LiveTable | null | undefined>(undefined)
  useEffect(() => (code ? repo.watchTable(code, setT) : undefined), [code])
  return t
}

/** /t — type a code. */
export function TableEntry() {
  usePageTitle('Join a table')
  const nav = useNavigate()
  const [code, setCode] = useState('')
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(env(safe-area-inset-top)+4rem)]">
      <div className="text-center">
        <div
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-100 to-duo-100 text-5xl dark:from-brand-900/50 dark:to-duo-900/30"
          aria-hidden
        >
          🍽️
        </div>
        <h1 className="mt-4 text-2xl font-extrabold">Join a table</h1>
        <p className="text-muted mt-1 text-sm">Enter the code shown on the host’s phone, or scan their QR code with your camera.</p>
      </div>
      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const c = parseCode(code)
          if (c) nav(`/t/${c}`)
        }}
      >
        <input
          className="input text-center text-2xl font-bold uppercase tracking-[0.3em]"
          placeholder="ABCD-2345"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          aria-label="Table code"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" className="btn-primary w-full" disabled={!parseCode(code)}>
          <Receipt size={18} aria-hidden /> Open the bill
        </button>
      </form>
    </div>
  )
}

export default function TablePage() {
  const { code: raw = '' } = useParams()
  const code = parseCode(raw)
  const viewer = useViewer()
  const table = useTable(viewer.pid ? code : undefined)
  usePageTitle(table === undefined ? undefined : (table?.merchant ?? 'Live table'))

  if (viewer.error)
    return (
      <Shell>
        <Empty emoji="🔌" title="Couldn’t open the table">
          {viewer.error}
        </Empty>
      </Shell>
    )
  if (!viewer.pid || table === undefined) return <Loading />
  if (table === null) {
    return (
      <Shell>
        <Empty emoji="🔍" title="Table not found">
          The code may be mistyped, or the bill was already closed or expired.
        </Empty>
      </Shell>
    )
  }
  const isHost = viewer.pid === table.hostUid
  if (table.status === 'closed') return <Closed table={table} viewer={viewer} isHost={isHost} />
  if (isExpired(table) && !isHost)
    return (
      <Shell>
        <Empty emoji="⌛" title="This table has expired">
          Tables stay open for 24 hours. Ask the host to finish the bill in Split Now.
        </Empty>
      </Shell>
    )
  if (!(viewer.pid in table.participants)) return <JoinForm table={table} viewer={viewer} />
  return <Live table={table} viewer={viewer} isHost={isHost} />
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+4rem)]">{children}</div>
}

function JoinForm({ table, viewer }: { table: LiveTable; viewer: Viewer }) {
  const toast = useToast()
  const [name, setName] = useState(viewer.name ?? safeGet(localStorage, NAME_KEY) ?? '')
  const host = table.participants[table.hostUid]?.name ?? 'The host'
  const join = async (e: FormEvent) => {
    e.preventDefault()
    const err = validateName(name)
    if (err) return toast(err, 'err')
    safeSet(localStorage, NAME_KEY, name.trim())
    try {
      await repo.joinTable(table.code, viewer.pid!, { name: name.trim(), uid: viewer.pid, joinedAt: Date.now() })
    } catch (er) {
      toast(errText(er), 'err')
    }
  }
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(env(safe-area-inset-top)+4rem)]">
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-100 to-duo-100 text-5xl dark:from-brand-900/50 dark:to-duo-900/30">
          🧾
        </div>
        <h1 className="mt-4 text-2xl font-extrabold">{table.merchant}</h1>
        <p className="mt-1 text-muted text-sm">
          {host} is splitting {formatMoney(tableTotal(table), table.currency)}. Tap what you had — no account needed.
        </p>
      </div>
      <form className="mt-6 space-y-3" onSubmit={join}>
        <input
          className="input"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={40}
          aria-label="Your name"
          autoComplete="given-name"
        />
        <button type="submit" className="btn-primary w-full">
          <LogIn size={18} aria-hidden /> Join the table
        </button>
      </form>
    </div>
  )
}

function Live({ table, viewer, isHost }: { table: LiveTable; viewer: Viewer; isHost: boolean }) {
  const toast = useToast()
  const order = useMemo(() => participantOrder(table), [table])
  const items = useMemo(() => orderedItems(table), [table])
  const totals = useMemo(() => computeTableTotals(table), [table])
  const me = viewer.pid!
  const [actingFor, setActingFor] = useState<ParticipantId>(me)
  const who = table.participants[actingFor] ? actingFor : me
  const [sheet, setSheet] = useState<'qr' | 'person' | 'edit' | 'finish' | null>(isHost && order.length === 1 ? 'qr' : null)
  const cur = table.currency
  const color = (p: ParticipantId) => colorFor(Math.max(0, order.indexOf(p)))
  const name = (p: ParticipantId) => (p === me ? 'You' : (table.participants[p]?.name ?? '?'))
  const link = `${location.origin}/t/${table.code}`
  const claims = sanitizeClaims(table.claims[who], table.items)
  const write = (next: Record<string, number>) => repo.setTableClaims(table.code, who, next).catch((e) => toast(errText(e), 'err'))
  const mine = totals.people[me]

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-40">
      <PageHeader
        title={table.merchant}
        back={viewer.signedIn ? '/' : undefined}
        subtitle={
          <>
            Live table · code <b className="tracking-wider">{formatCode(table.code)}</b>
          </>
        }
        right={
          isHost && (
            <button type="button" className="accent-live rounded-full bg-brand-600 p-2.5 text-white" onClick={() => setSheet('qr')} aria-label="Show QR code">
              <QrIcon size={20} />
            </button>
          )
        }
      />

      {isHost && isExpired(table) && (
        <div className="mb-3 rounded-2xl bg-amber-50 p-3 text-sm font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          This table has expired, so guests can’t claim any more. Finish it to add the expense.
        </div>
      )}

      <ClaimStatus totals={totals} currency={cur} />

      {isHost && order.length > 1 && (
        <div className="mt-3">
          <div className="label">Claiming for</div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1">
            {order.map((p) => (
              <button key={p} type="button" onClick={() => setActingFor(p)} className={`chip shrink-0 !py-1 !pl-1 ${who === p ? 'chip-on' : ''}`}>
                <Avatar name={table.participants[p].name} color={color(p)} size={22} />
                {name(p)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {items.map((it) => {
          const claimers = order.filter((p) => it.claims[p])
          const s = claims[it.id] ?? 0
          const unclaimed = claimers.length === 0
          return (
            <div
              key={it.id}
              className={`card overflow-hidden transition ${s ? 'ring-2 !ring-brand-500' : unclaimed ? 'ring-2 !ring-amber-400' : ''}`}
              data-testid="table-item"
            >
              <button
                type="button"
                onClick={() => write(toggleClaim(claims, it.id))}
                className="flex w-full items-center gap-3 p-3 text-left"
                aria-pressed={!!s}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${s ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-ink-700'}`}
                >
                  {s > 0 && <Check size={16} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{it.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-muted text-xs">
                    {unclaimed ? (
                      <span className="font-semibold text-amber-600 dark:text-amber-400">Unclaimed</span>
                    ) : (
                      claimers.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 dark:bg-ink-800">
                          <Avatar name={table.participants[p].name} color={color(p)} size={16} />
                          {name(p)}
                          {it.claims[p] > 1 && ` ×${it.claims[p]}`}
                        </span>
                      ))
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-bold tabular-nums">{formatMoney(it.amount, cur)}</span>
                  {s > 0 && claimers.length > 1 && (
                    <span className="block text-xs tabular-nums text-brand-600 dark:text-brand-300">
                      {formatMoney(totals.itemSplits[it.id]?.[who] ?? 0, cur)} {who === me ? 'yours' : name(who).split(' ')[0] + '’s'}
                    </span>
                  )}
                </span>
              </button>
              {s > 0 && claimers.length > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-sm dark:border-white/5">
                  <span className="text-muted">Shared — {who === me ? 'your' : `${name(who)}’s`} portions</span>
                  <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-ink-800">
                    <button type="button" className="rounded-xl p-1" onClick={() => write(setShares(claims, it.id, s - 1))} aria-label="Fewer portions">
                      <Minus size={16} />
                    </button>
                    <span className="w-6 text-center font-bold tabular-nums">{s}</span>
                    <button
                      type="button"
                      className="rounded-xl p-1 disabled:opacity-40"
                      disabled={s >= MAX_SHARES}
                      onClick={() => write(setShares(claims, it.id, s + 1))}
                      aria-label="More portions"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <People table={table} totals={totals} order={order} me={me} color={color} name={name} />

      {isHost && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="btn-secondary !px-2 text-sm"
            onClick={() =>
              shareOrCopy({ title: table.merchant, text: `Tap what you had at ${table.merchant}:`, url: link }).then(
                (r) => r === 'copied' && toast('Link copied'),
              )
            }
          >
            <Share2 size={16} /> Share
          </button>
          <button type="button" className="btn-secondary !px-2 text-sm" onClick={() => setSheet('person')}>
            <UserPlus size={16} /> Person
          </button>
          <button type="button" className="btn-secondary !px-2 text-sm" onClick={() => setSheet('edit')}>
            <Pencil size={16} /> Edit bill
          </button>
        </div>
      )}
      {isHost && repo.mode === 'demo' && (
        <a
          href={`/t/${table.code}?guest=demo`}
          target="_blank"
          rel="noopener"
          className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-300"
        >
          <ExternalLink size={14} /> Demo: open as another phone in a new tab
        </a>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/90 backdrop-blur-xl safe-bottom dark:border-white/5 dark:bg-ink-900/90">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-muted text-xs">
              Your total
              {mine && extrasParts(mine).length > 0
                ? ` (incl. ${extrasParts(mine)
                    .map((x) => `${formatMoney(x.amount, cur, { sign: true })} ${x.label}`)
                    .join(', ')})`
                : ''}
            </div>
            <div className="text-2xl font-extrabold tabular-nums" data-testid="my-total">
              {formatMoney(mine?.total ?? 0, cur)}
            </div>
          </div>
          {isHost && viewer.signedIn && (
            <button type="button" className="btn-primary" onClick={() => setSheet('finish')}>
              <Check size={18} aria-hidden /> Finish
            </button>
          )}
        </div>
      </div>

      <Sheet open={sheet === 'qr'} onClose={() => setSheet(null)} title="Scan to join">
        <div className="flex flex-col items-center text-center">
          <QrCode value={link} size={248} label="QR code to join this table" />
          <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">or enter code</div>
          <div className="text-3xl font-extrabold tracking-[0.2em]" data-testid="table-code">
            {formatCode(table.code)}
          </div>
          <div className="mt-1 break-all text-muted text-sm">{link.replace(/^https?:\/\//, '')}</div>
          <div className="mt-4 grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => copy(link).then((ok) => toast(ok ? 'Link copied' : 'Couldn’t copy', ok ? 'ok' : 'err'))}
            >
              <Copy size={16} /> Copy link
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => shareOrCopy({ title: table.merchant, text: `Tap what you had at ${table.merchant}:`, url: link })}
            >
              <Share2 size={16} /> Share
            </button>
          </div>
          <p className="mt-3 text-muted text-xs">Guests just enter their name. The table closes after 24 hours.</p>
        </div>
      </Sheet>
      <AddPersonSheet open={sheet === 'person'} onClose={() => setSheet(null)} table={table} onAdded={setActingFor} />
      {sheet === 'edit' && <EditBillSheet table={table} onClose={() => setSheet(null)} />}
      {sheet === 'finish' && (
        <Suspense fallback={null}>
          <TableFinish table={table} totals={totals} onClose={() => setSheet(null)} />
        </Suspense>
      )}
    </div>
  )
}

function ClaimStatus({ totals, currency }: { totals: TableTotals; currency: string }) {
  if (totals.allClaimed) {
    return (
      <div
        className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
        data-testid="claim-status"
      >
        <CircleCheck size={18} /> Everything claimed ✓
      </div>
    )
  }
  const n = totals.unclaimed.length
  return (
    <div
      className="flex items-center justify-between rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
      data-testid="claim-status"
    >
      <span>
        {n} item{n === 1 ? '' : 's'} unclaimed
      </span>
      <span className="tabular-nums">{formatMoney(totals.unclaimedAmount, currency)}</span>
    </div>
  )
}

function People({
  table,
  totals,
  order,
  me,
  color,
  name,
}: {
  table: LiveTable
  totals: TableTotals
  order: ParticipantId[]
  me: ParticipantId
  color: (p: ParticipantId) => string
  name: (p: ParticipantId) => string
}) {
  const cur = table.currency
  const e = table.extras
  return (
    <div className="card mt-4 p-4">
      <div className="label">Everyone</div>
      <div className="space-y-2">
        {order.map((p) => {
          const t = totals.people[p]
          return (
            <div key={p} className="flex items-center gap-3">
              <Avatar name={table.participants[p].name} color={color(p)} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {name(p)}
                  {p === table.hostUid && (
                    <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                      paid
                    </span>
                  )}
                </div>
                {extrasParts(t).length > 0 && (
                  <div className="text-muted text-xs tabular-nums">
                    {formatMoney(t.items, cur)}
                    {extrasParts(t).map((x) => ` ${x.amount < 0 ? '−' : '+'} ${formatMoney(Math.abs(x.amount), cur)} ${x.label}`)}
                  </div>
                )}
              </div>
              <div className="font-bold tabular-nums" data-testid={p === me ? undefined : 'person-total'}>
                {formatMoney(t.total, cur)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 space-y-0.5 border-t border-slate-100 pt-3 text-muted text-sm dark:border-white/5">
        {e.tax > 0 && <Line k="Tax / fees" v={formatMoney(e.tax, cur)} />}
        {e.tip > 0 && <Line k="Tip" v={formatMoney(e.tip, cur)} />}
        {e.discount > 0 && <Line k="Discount" v={formatMoney(-e.discount, cur)} />}
        <div className="flex justify-between font-bold text-slate-900 dark:text-white">
          <span>Bill total</span>
          <span className="tabular-nums">{formatMoney(totals.total, cur)}</span>
        </div>
      </div>
    </div>
  )
}

const Line = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between">
    <span>{k}</span>
    <span className="tabular-nums">{v}</span>
  </div>
)

function AddPersonSheet({ open, onClose, table, onAdded }: { open: boolean; onClose: () => void; table: LiveTable; onAdded: (p: ParticipantId) => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const add = (e: FormEvent) => {
    e.preventDefault()
    const err = validateName(name)
    if (err) return toast(err, 'err')
    const pid = uid('p_')
    repo.joinTable(table.code, pid, { name: name.trim(), joinedAt: Date.now() }).catch((er) => toast(errText(er), 'err'))
    onAdded(pid)
    setName('')
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add someone without a phone">
      <form onSubmit={add} className="space-y-3">
        <p className="text-muted text-sm">You’ll tap their items for them.</p>
        <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus aria-label="Name" />
        <button type="submit" className="btn-primary w-full">
          <UserPlus size={18} aria-hidden /> Add
        </button>
      </form>
    </Sheet>
  )
}

function EditBillSheet({ table, onClose }: { table: LiveTable; onClose: () => void }) {
  const toast = useToast()
  const cur = table.currency
  const [merchant, setMerchant] = useState(table.merchant)
  const [rows, setRows] = useState(() => orderedItems(table).map((it) => ({ id: it.id, name: it.name, amount: centsToInput(it.amount, cur) })))
  const [extras, setExtras] = useState(() => ({
    tax: table.extras.tax ? centsToInput(table.extras.tax, cur) : '',
    tip: table.extras.tip ? centsToInput(table.extras.tip, cur) : '',
    discount: table.extras.discount ? centsToInput(table.extras.discount, cur) : '',
  }))
  const [taxSplit, setTaxSplit] = useState<TaxSplit>(() => taxSplitOf(table))
  const money = (s: string) => (s.trim() ? parseMoney(s, cur) : 0)
  const save = () => {
    const parsed = rows.map((r) => ({ ...r, cents: money(r.amount) }))
    if (parsed.some((r) => !Number.isFinite(r.cents) || r.cents <= 0)) return toast('Every item needs an amount', 'err')
    const ex = { tax: money(extras.tax), tip: money(extras.tip), discount: money(extras.discount) }
    if (Object.values(ex).some((v) => !Number.isFinite(v) || v < 0)) return toast('Check tax, tip and discount', 'err')
    const items: NonNullable<TablePatch['items']> = {}
    parsed.forEach((r, i) => {
      items[r.id] = { name: r.name.trim() || `Item ${i + 1}`, amount: r.cents, pos: i }
    })
    for (const id of Object.keys(table.items)) if (!(id in items)) items[id] = null
    repo.updateTable(table.code, { merchant: merchant.trim() || table.merchant, items, extras: ex, taxSplit }).catch((e) => toast(errText(e), 'err'))
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Edit bill">
      <div className="space-y-3">
        <input className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} aria-label="Place" placeholder="Place" />
        {rows.map((r, i) => (
          <div key={r.id} className="flex gap-2">
            <input
              className="input !py-2"
              value={r.name}
              placeholder="Item"
              aria-label={`Item ${i + 1} name`}
              onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className="input !w-28 !py-2 text-right"
              inputMode="decimal"
              value={r.amount}
              placeholder="0.00"
              aria-label={`Item ${i + 1} amount`}
              onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, amount: e.target.value } : x)))}
            />
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center text-slate-500 hover:text-rose-600 dark:text-slate-400"
              onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
              aria-label="Remove item"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary w-full !min-h-0 !py-2.5 text-sm"
          onClick={() => setRows([...rows, { id: uid('i_'), name: '', amount: '' }])}
        >
          <Plus size={16} /> Add item
        </button>
        <div className="grid grid-cols-3 gap-2">
          {(['tax', 'tip', 'discount'] as const).map((k) => (
            <label key={k} className="block">
              <span className="label">{k === 'tax' ? 'Tax / fees' : k === 'tip' ? 'Tip' : 'Discount'}</span>
              <input
                className="input !py-2 text-right"
                inputMode="decimal"
                placeholder="0.00"
                value={extras[k]}
                onChange={(e) => setExtras({ ...extras, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div>
          <div className="label">Tax &amp; fees</div>
          <Segmented<TaxSplit>
            value={taxSplit}
            onChange={setTaxSplit}
            label="Tax & fees"
            testId="table-tax-split"
            options={[
              { value: 'items', label: 'By items' },
              { value: 'equal', label: 'Equally' },
            ]}
          />
        </div>
        <p className="text-muted text-xs">{taxSplitHint(taxSplit)}</p>
        <button type="button" className="btn-primary w-full" onClick={save}>
          <Check size={18} aria-hidden /> Save
        </button>
      </div>
    </Sheet>
  )
}

function Closed({ table, viewer, isHost }: { table: LiveTable; viewer: Viewer; isHost: boolean }) {
  const nav = useNavigate()
  const toast = useToast()
  const totals = useMemo(() => computeTableTotals(table), [table])
  const order = participantOrder(table)
  const cur = table.currency
  const me = viewer.pid!
  const host = table.participants[table.hostUid]?.name ?? 'the host'
  // The guest's own Pay me link (made when the host finished): "I've paid" goes through it and
  // its amount is exactly what the group expense charged them.
  const myCode = isHost ? undefined : table.payLinks?.[me]
  const link = usePayLink(myCode, me)
  const mine = link?.amount ?? totals.people[me]?.total ?? 0
  const options = isHost ? [] : payOptions(table.hostPayment, mine, cur, table.merchant)
  const paid = link?.status === 'paid'
  const remind = (p: ParticipantId) => {
    const amt = formatMoney(totals.people[p].total, cur)
    const code = table.payLinks?.[p]
    const handles = payOptions(table.hostPayment, totals.people[p].total, cur, table.merchant)
      .map((o) => `${o.label}: ${o.value}`)
      .join(' · ')
    const text = code
      ? `Hi ${table.participants[p].name}, your share of ${table.merchant} is ${amt}. Pay and mark it paid here, no account needed:`
      : `Hi ${table.participants[p].name}, your share of ${table.merchant} is ${amt}.${handles ? ` ${handles}` : ''}`
    shareOrCopy({ text, url: code ? payLinkUrl(location.origin, code) : undefined }).then((r) => r === 'copied' && toast('Copied'))
  }
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <PageHeader title={table.merchant} back={viewer.signedIn ? '/' : undefined} subtitle={`Bill closed · ${formatMoney(totals.total, cur)}`} />
      {!isHost && me in table.participants && (
        <div className="card p-5 text-center">
          <div className="text-muted text-sm">Your share</div>
          <div className="text-4xl font-extrabold tabular-nums">{formatMoney(mine, cur)}</div>
          <div className="text-muted mt-1 text-sm">{paid ? `Marked paid · ${host} can see it` : mine > 0 ? `Pay ${host} back` : 'Nothing to pay'}</div>
          {paid ? (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CircleCheck size={18} aria-hidden /> You marked this paid
            </div>
          ) : (
            <>
              {mine > 0 && options.length > 0 && <GuestPay options={options} amount={mine} currency={cur} />}
              {mine > 0 && link && canMarkPaid(link, Date.now(), me) && (
                <div className="mt-4">
                  <MarkPaid code={link.code} payee={host.split(' ')[0]} amount={mine} currency={cur} groupName={link.groupId ? link.groupName : undefined} />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {isHost && table.expenseId && table.closedGroupId && viewer.signedIn && (
        <button type="button" className="btn-primary w-full" onClick={() => nav(`/groups/${table.closedGroupId}/expenses/${table.expenseId}`)}>
          <ArrowRight size={18} aria-hidden /> Open the expense
        </button>
      )}
      <div className="card mt-4 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        {order.map((p, i) => (
          <div key={p} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={table.participants[p].name} color={colorFor(i)} size={32} />
            <span className="flex-1 font-medium">{p === me ? 'You' : table.participants[p].name}</span>
            {isHost && table.payLinks?.[p] && <PaidPill code={table.payLinks[p]} viewer={me} name={table.participants[p].name} />}
            <span className="font-bold tabular-nums" data-testid="final-total">
              {formatMoney(totals.people[p].total, cur)}
            </span>
            {isHost && p !== me && totals.people[p].total > 0 && (
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-brand-600"
                onClick={() => remind(p)}
                aria-label={`Send ${table.participants[p].name} their total`}
              >
                <Share2 size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!viewer.signedIn && (
        <p className="text-muted mt-6 text-center text-sm">
          Split bills like this with your own friends —{' '}
          <a className="font-semibold text-brand-600 dark:text-brand-300" href="/">
            get Split Now
          </a>
          .
        </p>
      )}
      {isHost && !table.expenseId && (
        <p className="text-muted mt-4 text-center text-xs">
          Not added to a group. Tap <Share2 size={12} className="inline" aria-hidden /> to send each person their total.
        </p>
      )}
    </div>
  )
}

/** The host's view of one guest's Pay me link: "Paid" once they tapped "I've paid" (opens the link, with any screenshot). */
function PaidPill({ code, viewer, name }: { code: string; viewer: string; name: string }) {
  const l = usePayLink(code, viewer)
  if (l?.status !== 'paid') return null
  return (
    <Link
      to={`/r/${code}`}
      className="inline-flex min-h-6 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      aria-label={`${name} marked it paid: open the Pay me link`}
      data-testid="table-paid"
    >
      <CircleCheck size={12} aria-hidden /> Paid
    </Link>
  )
}
