import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, Camera, CheckCheck, ChevronDown, Copy, ExternalLink, QrCode as QrIcon } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { ChequeIcon } from '@/components/ChequeIcon'
import { computeGroupData, memberOrder, useAllGroupData, useExpenses, useGroup, useSettlements } from '@/hooks/data'
import { useOcr } from '@/hooks/useOcr'
import type { Cents, MemberId, PaymentHandles } from '@/types'
import type { MemberProfile } from '@/data/repo'
import { centsToInput, currencySymbol, formatMoney, fromHundredths } from '@/lib/money'
import { isSettled } from '@/lib/members'
import { isIOS, isUpiId, methodFor, methodLabel, payOptions, roundSuggestions, settleMethods, type PayOption } from '@/lib/payments'
import { matchMember, parsePaymentScreenshot, type ParsedPayment } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { linkToClose } from '@/lib/paylinks'
import { pendingSettlements, personBalances, signedAmount, type PersonBalance } from '@/lib/settleAll'
import { allocateAcrossGroups } from '@/lib/settleMulti'
import { lastMethod, rememberMethod } from '@/lib/recents'
import { copy } from '@/lib/share'
import { errText } from '@/lib/errors'
import { todayISO, uid } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { QrCode } from '@/components/QrCode'
import { encodeQr } from '@/lib/qr'
import { Empty, Loading, PageHeader, Spinner } from '@/components/Misc'
import { MoneyInput } from '@/components/MoneyInput'
import { CardSkeleton, ListSkeleton } from '@/components/Skeleton'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { usePageTitle } from '@/lib/brand'
import { Select } from '@/components/Select'
import { DateField } from '@/components/DateField'

export default function SettleUp() {
  usePageTitle('Settle up')
  const { groupId } = useParams()
  const [params] = useSearchParams()
  const { user } = useMe()
  const group = useGroup(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)
  const nav = useNavigate()
  const toast = useToast()
  const ocr = useOcr()
  const fileRef = useRef<HTMLInputElement>(null)

  const d = useMemo(
    () => (group && expenses && settlements ? computeGroupData(group, expenses, settlements, user.uid) : null),
    [group, expenses, settlements, user.uid],
  )
  const [from, setFrom] = useState<MemberId>('')
  const [to, setTo] = useState<MemberId>('')
  /** minor units of the group currency; undefined while empty */
  const [amount, setAmount] = useState<number>()
  /** typed, read from a screenshot or given in the link: changing the people no longer refills it */
  const [amountTouched, setAmountTouched] = useState(false)
  const [amountError, setAmountError] = useState<string>()
  const [method, setMethod] = useState('')
  /** picked by hand (or implied by a pay option / screenshot): stop choosing a default */
  const [methodTouched, setMethodTouched] = useState(false)
  const pickMethod = (m: string) => {
    setMethod(m)
    setMethodTouched(true)
  }
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  /** part payment: record the rest as waived, so nothing stays owed */
  const [waive, setWaive] = useState(false)
  const [payee, setPayee] = useState<MemberProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [init, setInit] = useState(false)
  const typeAmount = (v: number | undefined) => {
    setAmount(v)
    setAmountTouched(true)
    setAmountError(undefined)
  }

  const applyPayment = (parsed: ParsedPayment) => {
    if (!d) return
    const p = { ...parsed, amount: parsed.amount && fromHundredths(parsed.amount, d.group.currency) }
    if (p.amount) typeAmount(p.amount)
    if (p.method && settleMethods(d.group.currency).includes(p.method)) pickMethod(p.method)
    if (p.date) setDate(p.date)
    const members = memberOrder(d.group).map((id) => ({ id, name: d.group.members[id].name }))
    const match = matchMember(
      p.payee,
      members.filter((m) => m.id !== d.me),
    )
    if (match && d.me) {
      setFrom(d.me)
      setTo(match)
    }
    toast(p.amount ? `Read ${formatMoney(p.amount, d.group.currency)}${match ? ` to ${d.group.members[match].name}` : ''}` : 'Couldn’t read an amount')
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time set-up once the group has loaded (guarded by init); later live updates must not reset what the person entered.
  useEffect(() => {
    if (!d || init) return
    setInit(true)
    setMethod(settleMethods(d.group.currency)[0])
    // "Pay me" links: /groups/:id/settle?from=&to=&amount=<minor units>.
    const qf = params.get('from'),
      qt = params.get('to'),
      qa = params.get('amount')
    if (qf && qt) {
      setFrom(qf)
      setTo(qt)
      const n = Number(qa)
      if (qa && Number.isFinite(n) && n > 0) {
        setAmount(Math.round(n))
        setAmountTouched(true)
      }
    } else {
      const mine = d.debts.find((x) => x.from === d.me) ?? d.debts.find((x) => x.to === d.me) ?? d.debts[0]
      if (mine) {
        setFrom(mine.from)
        setTo(mine.to)
        setAmount(mine.amount)
      } else {
        const o = memberOrder(d.group)
        setFrom(d.me ?? o[0])
        setTo(o.find((x) => x !== d.me) ?? o[0])
      }
    }
    if (pending.payment) {
      applyPayment(pending.payment.parsed)
      pending.payment = undefined
    }
  }, [d, init])

  // A different pair of people: offer what they owe, until the amount is typed by hand.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-offer only when the pair changes, not on every live balance update, so the amount does not change under the person.
  useEffect(() => {
    if (!d || !init || amountTouched || !from || !to) return
    setAmount(d.debts.find((x) => x.from === from && x.to === to)?.amount)
  }, [from, to, init])

  const toUid = group?.members[to]?.uid
  useEffect(() => {
    setPayee(null)
    // Payment handles are shared per group (only co-members can read them). A slower answer for
    // an earlier recipient must not land after a quicker one for the current recipient.
    if (!toUid || !groupId) return
    let live = true
    repo
      .getMemberProfile(groupId, toUid)
      .then((p) => {
        if (live) setPayee(p)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [toUid, groupId])

  // Method: what was used to pay this person last time, else UPI when they have a UPI ID.
  const payeeUpi = !!payee?.payment?.upi?.trim()
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-pick the method only when the recipient or their UPI ID changes; a method picked by hand (methodTouched) is kept.
  useEffect(() => {
    if (!d || !init || methodTouched || !to) return
    const ms = settleMethods(d.group.currency)
    const remembered = lastMethod(d.group.id, to)
    setMethod(remembered && ms.includes(remembered) ? remembered : payeeUpi && ms.includes('UPI') ? 'UPI' : ms[0])
  }, [to, payeeUpi, init])

  if (group === null)
    return (
      <>
        <PageHeader title="Settle up" back />
        <Empty emoji="🔍" title="This group doesn’t exist or you’re not a member" />
      </>
    )
  if (!d || !group) return <Loading />
  const cur = group.currency
  // People in the group now, plus anyone who left with money still owed (old data) or is prefilled here.
  const order = memberOrder(group, [...Object.keys(d.net).filter((id) => !isSettled(d.net[id] ?? 0)), from, to])
  const name = (id: MemberId) => (id === d.me ? 'You' : (group.members[id]?.name ?? ''))
  const owed = d.debts.find((x) => x.from === from && x.to === to)?.amount
  const methods = settleMethods(cur)
  const validAmount = amount !== undefined && amount > 0
  const payAmount = validAmount ? amount : 0
  const payNote = `Split Now ${group.name}`
  const payeeName = payee?.displayName ?? group.members[to]?.name
  const toMe = to === d.me
  /** what would still be owed after this payment */
  const rest = owed !== undefined && validAmount && amount < owed ? owed - amount : 0
  const suggestions = owed ? roundSuggestions(owed, cur) : []
  const big = amount !== undefined && centsToInput(amount, cur).length > 7

  const save = async () => {
    if (!validAmount) {
      setAmountError('Enter an amount')
      document.getElementById('settle-amount')?.focus()
      return
    }
    if (!from || !to || from === to) return toast('Pick two different people', 'err')
    setBusy(true)
    try {
      const base = { groupId: group.id, from, to, date, createdBy: user.uid, createdAt: Date.now() }
      // Opened from a Pay me link (/r/{code} → here): this payment clears it, so the link reads
      // as paid for the payee and can't be recorded a second time by the server.
      const link = linkToClose(params.get('link'), { from: params.get('from') ?? '', to: params.get('to') ?? '' }, { from, to })
      const id = uid('s_')
      await repo.saveSettlement({ id, ...base, amount, method, note: note.trim() || undefined, payLink: link })
      if (link) repo.markPayLinkPaid(link, { method, settlementId: id }).catch((e) => console.warn('Pay me link not updated', e))
      // The rest is let go as its own record, so the history shows what was paid and what was waived.
      if (waive && rest > 0) await repo.saveSettlement({ id: uid('s_'), ...base, amount: rest, method: 'waived', note: 'Rest waived' })
      rememberMethod(group.id, to, method)
      toast(waive && rest > 0 ? 'Payment recorded, rest waived' : 'Payment recorded')
      nav(`/groups/${group.id}`, { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      noValidate
    >
      <PageHeader
        title="Settle up"
        subtitle={
          <>
            <span aria-hidden>{group.emoji}</span> {group.name}
          </>
        }
        back
      />
      <div className="card p-5">
        <PersonSelect
          label="Payer"
          value={from}
          onChange={(v) => {
            setFrom(v)
            if (v === to) setTo(order.find((x) => x !== v) ?? '')
          }}
          order={order}
          group={group}
          name={name}
        />
        <div className="my-2 flex justify-center">
          <span className="rounded-full bg-slate-100 p-2 dark:bg-ink-800" aria-hidden>
            <ArrowDown size={18} />
          </span>
        </div>
        <PersonSelect label="Recipient" value={to} onChange={setTo} order={order.filter((x) => x !== from)} group={group} name={name} />

        <div className="mt-5 flex items-baseline justify-center gap-2">
          <span className="text-2xl font-bold text-muted" aria-hidden>
            {currencySymbol(cur)}
          </span>
          <MoneyInput
            bare
            id="settle-amount"
            className={`w-full min-w-0 max-w-[15rem] rounded-lg bg-transparent text-center font-extrabold tabular-nums outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-brand-500 ${big ? 'text-4xl' : 'text-5xl'}`}
            placeholder={centsToInput(0, cur)}
            aria-label={`Amount in ${cur}`}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? 'settle-amount-error' : undefined}
            enterKeyHint="done"
            value={amount}
            currency={cur}
            onChange={typeAmount}
          />
        </div>
        {amountError && (
          <p id="settle-amount-error" role="alert" className="neg mt-1 text-center text-sm">
            {amountError}
          </p>
        )}
        {owed !== undefined && (
          <div className="mt-2 text-center text-sm text-muted">
            {name(from)} owe{from === d.me ? '' : 's'} {name(to)} {formatMoney(owed, cur)}
            {/* Round figures for a part payment; the full amount when something else is typed. */}
            <div className="mt-2 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Amount suggestions">
              {[owed, ...suggestions].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setAmount(v)
                    setAmountTouched(v !== owed)
                    setAmountError(undefined)
                  }}
                  aria-pressed={amount === v}
                  className={`chip min-h-9 tabular-nums ${amount === v ? 'chip-on' : ''}`}
                  data-testid={v === owed ? 'settle-full' : 'settle-round'}
                >
                  {v === owed ? `Full ${formatMoney(v, cur)}` : formatMoney(v, cur)}
                </button>
              ))}
            </div>
          </div>
        )}
        {rest > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800" data-testid="waive-rest">
            <div className="min-w-0">
              <div className="font-semibold">Waive the rest ({formatMoney(rest, cur)})</div>
              <div className="text-xs text-muted">Records that nothing more is owed for this.</div>
            </div>
            <Switch checked={waive} onChange={setWaive} label={`Waive the remaining ${formatMoney(rest, cur)}`} testId="waive-switch" />
          </div>
        )}

        <button
          type="button"
          className="btn-secondary btn-sm mt-4 w-full"
          onClick={() => fileRef.current?.click()}
          disabled={ocr.busy}
          aria-busy={ocr.busy || undefined}
        >
          {ocr.busy ? (
            <>
              <Spinner className="!h-4 !w-4" label="Reading the screenshot" /> Reading {Math.round(ocr.progress * 100)}%
            </>
          ) : (
            <>
              <Camera size={16} aria-hidden /> Read from payment screenshot
            </>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              applyPayment(parsePaymentScreenshot(await ocr.run(f)))
            } catch (err) {
              toast(`Couldn’t read the image: ${errText(err)}`, 'err')
            }
          }}
        />
      </div>

      {to && (
        <PayWith
          key={to}
          cur={cur}
          toMe={toMe}
          payer={name(from)}
          recipient={name(to)}
          recipientJoined={!!toUid}
          payment={payee?.payment}
          payeeName={payeeName}
          amount={payAmount}
          payNote={payNote}
          onPick={pickMethod}
        />
      )}

      <div className="card mt-3 space-y-3 p-4">
        <div>
          <div className="label" id="settle-method-label">
            Method
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="settle-method-label">
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={m === method}
                onClick={() => pickMethod(m)}
                className={`chip min-h-10 ${m === method ? 'chip-on' : ''}`}
              >
                {methodLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DateField aria-label="Date" value={date} onChange={(v) => setDate(v || todayISO())} />
          <input className="input" placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <button type="submit" className="btn-primary mt-5 w-full" disabled={busy} data-testid="settle-record">
        <ChequeIcon size={22} /> Record {validAmount ? formatMoney(amount, cur) : 'payment'}
      </button>
    </form>
  )
}

function PersonSelect({
  label,
  value,
  onChange,
  order,
  group,
  name,
}: {
  label: string
  value: MemberId
  onChange: (v: MemberId) => void
  order: MemberId[]
  group: NonNullable<ReturnType<typeof useGroup>>
  name: (id: MemberId) => string
}) {
  const m = group.members[value]
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={onChange}
      options={order.map((id) => ({
        value: id,
        text: name(id),
        label: name(id),
        icon: <Avatar name={group.members[id].name} photoURL={group.members[id].photoURL} color={group.members[id].color} size={28} />,
      }))}
      triggerClassName="rounded-2xl bg-slate-50 p-3 transition active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-ink-800"
      renderTrigger={(_, open) => (
        <span className="flex items-center gap-3">
          {m ? <Avatar name={m.name} photoURL={m.photoURL} color={m.color} size={40} /> : <span className="h-10 w-10 rounded-full bg-slate-200" />}
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
            <span className="block truncate font-bold">{name(value)}</span>
          </span>
          <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      )}
    />
  )
}

/** UPI: a scannable QR for the exact amount, plus buttons that open a UPI app on this phone. */
function UpiCard({
  o,
  amount,
  cur,
  toMe,
  payer,
  onPick,
  onCopy,
}: {
  o: PayOption
  amount: number
  cur: string
  toMe: boolean
  payer: string
  onPick: () => void
  onCopy: () => void
}) {
  const ios = isIOS()
  let qrOk = true
  try {
    if (o.qr) encodeQr(o.qr)
  } catch {
    qrOk = false
  }
  return (
    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-ink-800" data-testid="upi-card">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">UPI</div>
          <div className="truncate font-mono text-sm">{o.value}</div>
        </div>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white dark:hover:bg-ink-700"
          onClick={onCopy}
          aria-label="Copy UPI ID"
        >
          <Copy size={18} />
        </button>
      </div>
      {o.qr && qrOk && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <QrCode value={o.qr} size={196} label={`UPI QR code to pay ${o.value}${amount > 0 ? ` ${formatMoney(amount, cur)}` : ''}`} />
          <div className="flex items-center gap-1.5 text-center text-xs text-muted">
            <QrIcon size={14} className="shrink-0" aria-hidden />
            {toMe ? `Show this to ${payer}: they scan it with any UPI app` : 'Scan with any UPI app on another phone'}
            {amount > 0 ? ` · ${formatMoney(amount, cur)}` : ''}
          </div>
        </div>
      )}
      {!toMe && o.href && (
        <div className="mt-3 space-y-2">
          <a className="btn-primary btn-sm w-full" href={o.href} onClick={onPick} data-testid="upi-open">
            Pay {amount > 0 ? formatMoney(amount, cur) : ''} with a UPI app <ExternalLink size={16} aria-hidden />
          </a>
          <div className="grid grid-cols-3 gap-2">
            {o.apps?.map((a) => (
              <a
                key={a.id}
                className="btn btn-sm !px-2 text-xs bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-ink-700 dark:text-slate-100 dark:ring-white/10"
                href={a.href}
                onClick={onPick}
                data-testid={`upi-${a.id}`}
              >
                {a.label}
              </a>
            ))}
          </div>
          <p className="text-xs leading-snug text-muted">
            {ios ? 'On iPhone, pick your app: “Pay with a UPI app” opens whichever UPI app iOS chooses.' : 'Android shows a list of your UPI apps.'} If an app
            refuses the link, scan the QR or pay to the UPI ID.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * "Pay X with" / "Get paid by X": the recipient's payment handles (UPI QR + app links, PayID,
 * bank, PayPal…), or a box to paste their UPI ID when none is on file. Shared by the single-group
 * and cross-group settle screens. Key it by recipient so a typed UPI ID doesn't carry over.
 */
function PayWith({
  cur,
  toMe,
  payer,
  recipient,
  recipientJoined,
  payment,
  payeeName,
  amount,
  payNote,
  onPick,
}: {
  cur: string
  toMe: boolean
  payer: string
  recipient: string
  recipientJoined: boolean
  payment?: PaymentHandles
  payeeName?: string
  amount: Cents
  payNote: string
  onPick: (method: string) => void
}) {
  const toast = useToast()
  /** a UPI ID typed in for someone who hasn't joined (or hasn't added one) */
  const [manualUpi, setManualUpi] = useState('')
  const options = payOptions(payment, amount, cur, payNote, payeeName)
  // No UPI on file: let the payer paste the recipient's UPI ID to get the same QR / app links.
  const canTypeUpi = cur === 'INR' && !toMe && !options.some((o) => o.key === 'upi')
  const typed = canTypeUpi && isUpiId(manualUpi) ? payOptions({ upi: manualUpi.trim() }, amount, cur, payNote, payeeName) : []
  const shown = [...options, ...typed]
  return (
    <div className="card mt-3 p-4">
      <div className="label">{toMe ? `Get paid by ${payer}` : `Pay ${recipient} with`}</div>
      {shown.length === 0 && (
        <p className="text-sm text-muted">
          {toMe
            ? 'Add your UPI ID in Profile so friends can scan a QR to pay you.'
            : recipientJoined
              ? `${recipient} hasn’t added payment details yet.`
              : `${recipient} hasn’t joined Split Now yet. Ask them for their ${cur === 'INR' ? 'UPI ID' : cur === 'AUD' ? 'PayID or bank details' : 'payment details'}.`}
        </p>
      )}
      {canTypeUpi && (
        <input
          className="input mt-2"
          placeholder={`${recipient}’s UPI ID (e.g. name@okaxis)`}
          value={manualUpi}
          onChange={(e) => setManualUpi(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          aria-label="Recipient UPI ID"
          data-testid="manual-upi"
        />
      )}
      {shown.length > 0 && (
        <div className="mt-2 space-y-2">
          {shown.map((o) =>
            o.qr ? (
              <UpiCard
                key={`${o.key}-${o.value}`}
                o={o}
                amount={amount}
                cur={cur}
                toMe={toMe}
                payer={payer}
                onPick={() => onPick('UPI')}
                onCopy={async () => {
                  await copy(o.value)
                  onPick('UPI')
                  toast('UPI ID copied')
                }}
              />
            ) : (
              <div key={`${o.key}-${o.value}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-muted">{o.label}</div>
                  <div className="truncate font-mono text-sm">{o.value}</div>
                </div>
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white dark:hover:bg-ink-700"
                  onClick={async () => {
                    await copy(o.value)
                    onPick(methodFor(o))
                    toast(`${o.label} copied`)
                  }}
                  aria-label={`Copy ${o.label}`}
                >
                  <Copy size={18} />
                </button>
                {o.href && (
                  <a
                    className="accent-live flex h-11 w-11 items-center justify-center rounded-xl bg-fill text-on-fill"
                    href={o.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onPick(methodFor(o))}
                    aria-label={`Open ${o.label} (opens in a new tab)`}
                  >
                    <ExternalLink size={18} />
                  </a>
                )}
              </div>
            ),
          )}
          <p className="text-xs text-muted">Pay in your UPI or banking app, then record it below. Split Now never moves money itself.</p>
        </div>
      )}
    </div>
  )
}

/* ───────────────────── Settle up with one person, across groups ───────────────────── */

/**
 * /settle/with/:key — everything with one person in one currency (a PersonBalance from
 * Balances → By person), settled with one real payment. Prefilled with the net; editing it
 * records a partial payment, shared across the groups by allocateAcrossGroups (lib/settleMulti).
 * Each group gets its own settlement, in its own direction, so they all clear (or shrink).
 * People with balances in several currencies get one of these per currency: never netted.
 */
export function SettleWithPerson() {
  usePageTitle('Settle up')
  const { key = '' } = useParams()
  const { user, profile } = useMe()
  const data = useAllGroupData()
  const nav = useNavigate()
  const toast = useToast()
  const people = useMemo(() => (data ? personBalances(pendingSettlements(data, profile.currency)) : null), [data, profile.currency])
  /** frozen while saving: each saved settlement changes the live balance under us */
  const [snap, setSnap] = useState<PersonBalance | null>(null)
  const p = snap ?? people?.find((x) => x.key === key) ?? null
  /** minor units; undefined while empty */
  const [amount, setAmount] = useState<number>()
  const [method, setMethod] = useState('')
  const [methodTouched, setMethodTouched] = useState(false)
  const pickMethod = (m: string) => {
    setMethod(m)
    setMethodTouched(true)
  }
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [payee, setPayee] = useState<MemberProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [init, setInit] = useState(false)

  const cur = p?.currency ?? 'INR'
  const toMe = !!p && p.net > 0
  /** groups in the net direction (where the money goes); the others are netted out */
  const major = p ? p.parts.filter((r) => (p.net > 0 ? r.dir === 'owed' : r.dir === 'owe')) : []
  const majorKey = major.map((r) => `${r.groupId}:${r.memberId}`).join(',')

  useEffect(() => {
    if (!p || init) return
    setInit(true)
    setAmount(p.net === 0 ? undefined : Math.abs(p.net))
    setMethod(settleMethods(p.currency)[0])
  }, [p, init])

  // The recipient's payment handles: per group, so try each shared group until one has some.
  const recipientUid = toMe ? user.uid : p?.parts.find((r) => r.uid)?.uid
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the groups' values (majorKey), not the live balance object, so a saved settlement does not refetch the handles.
  useEffect(() => {
    setPayee(null)
    if (!p || p.net === 0) return
    let off = false
    const tries = major.map((r) => ({ groupId: r.groupId, uid: toMe ? user.uid : r.uid })).filter((t): t is { groupId: string; uid: string } => !!t.uid)
    ;(async () => {
      let first: MemberProfile | null = null
      for (const t of tries) {
        const m = await repo.getMemberProfile(t.groupId, t.uid).catch(() => null)
        if (off) return
        if (m && payOptions(m.payment, 0, cur, '').length > 0) {
          setPayee(m)
          return
        }
        first ??= m
      }
      if (!off && first) setPayee(first)
    })()
    return () => {
      off = true
    }
  }, [majorKey, toMe, cur, user.uid, p?.net === 0])

  // Method: what was last used to pay this person in one of these groups, else UPI when they have a UPI ID.
  const payeeUpi = !!payee?.payment?.upi?.trim()
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-pick only when the groups (majorKey) or the UPI ID change, not on every live balance update; a method picked by hand is kept.
  useEffect(() => {
    if (!p || !init || methodTouched) return
    const ms = settleMethods(cur)
    const remembered = major.map((r) => lastMethod(r.groupId, toMe ? r.me : r.memberId)).find((m) => m && ms.includes(m))
    setMethod(remembered ?? (payeeUpi && ms.includes('UPI') ? 'UPI' : ms[0]))
  }, [majorKey, payeeUpi, init])

  if (!people && !snap)
    return (
      <>
        <PageHeader title="Settle up" back="/settle" />
        <CardSkeleton className="h-48" />
        <ListSkeleton rows={3} />
      </>
    )
  if (!p) {
    return (
      <>
        <PageHeader title="Settle up" back="/settle" />
        <Empty emoji="🎉" title="Nothing left to settle">
          You’re all square with this person.{' '}
          <Link to="/settle" className="font-semibold text-brand-600 dark:text-brand-300">
            Back to Balances
          </Link>
        </Empty>
      </>
    )
  }

  const n = new Set(p.parts.map((r) => r.groupId)).size
  const even = p.net === 0
  const owedTotal = Math.abs(p.net)
  const value = even ? 0 : (amount ?? 0)
  const tooMuch = !even && value > owedTotal
  const plan = allocateAcrossGroups(
    p.parts.map((r) => ({ key: r.key, signed: signedAmount(r) })),
    value,
  )
  const recorded = new Map(plan.allocations.map((a) => [a.key, a]))
  const mixed = p.parts.some((r) => r.dir === 'owe') && p.parts.some((r) => r.dir === 'owed')
  const partial = !even && value > 0 && value < owedTotal
  const fmt = (c: Cents) => formatMoney(c, cur)
  const recordCount = new Set(p.parts.filter((r) => (recorded.get(r.key)?.amount ?? 0) > 0).map((r) => r.groupId)).size
  const meName = profile.displayName || 'You'
  // Same person, other currencies: separate balances, never netted with this one.
  const personPart = p.key.slice(0, p.key.lastIndexOf('|'))
  const otherCur = (people ?? []).filter((x) => x.key !== p.key && x.key.slice(0, x.key.lastIndexOf('|')) === personPart)

  const save = async () => {
    if (!even && value <= 0) return toast('Enter an amount', 'err')
    if (tooMuch) return toast(`That’s more than the ${fmt(owedTotal)} owed overall`, 'err')
    setSnap(p)
    setBusy(true)
    const auto = even
      ? `Netted out across ${n} groups (no payment)`
      : `Part of one payment of ${fmt(plan.payment)} ${toMe ? `from ${p.name}` : `to ${p.name}`} across ${n} groups`
    let saved = 0
    try {
      for (const r of p.parts) {
        const a = recorded.get(r.key)
        if (!a || a.amount <= 0) continue
        const from = r.dir === 'owed' ? r.memberId : r.me
        const to = r.dir === 'owed' ? r.me : r.memberId
        const counter = even || Math.sign(signedAmount(r)) !== Math.sign(p.net)
        await repo.saveSettlement({
          id: uid('s_'),
          groupId: r.groupId,
          from,
          to,
          amount: a.amount,
          method: counter ? 'Cross-group netting' : method,
          note: note.trim() || auto,
          date,
          createdBy: user.uid,
          createdAt: Date.now(),
        })
        if (!counter) rememberMethod(r.groupId, to, method)
        saved++
      }
      toast(
        even
          ? `Cleared ${n} groups with ${p.name}`
          : plan.clearsAll
            ? `Settled up with ${p.name} across ${n} groups 💸`
            : `Recorded ${fmt(plan.payment)} ${toMe ? 'from' : 'to'} ${p.name} 💸`,
      )
      nav('/settle', { replace: true })
    } catch (e) {
      toast(saved ? `Saved ${saved} of the groups, then: ${errText(e)}` : errText(e), 'err')
      // Start over from what's actually left now.
      setSnap(null)
      setInit(false)
      setBusy(false)
    }
  }

  const big = amount !== undefined && centsToInput(amount, cur).length > 7

  return (
    <form
      data-testid="settle-person"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      noValidate
    >
      <PageHeader title="Settle up" subtitle={`with ${p.name} · ${n} groups`} back />
      <div className="card p-5">
        <div className="flex flex-col items-center text-center">
          <Avatar name={p.name} photoURL={p.photoURL} color={p.color} size={56} />
          <div className="text-muted mt-2 text-sm font-semibold" data-testid="settle-person-dir">
            {even ? `You and ${p.name} are even overall` : toMe ? `${p.name} pays you` : `You pay ${p.name}`}
          </div>
        </div>
        {even ? (
          <div className="mt-3 text-center">
            <div className="text-3xl font-extrabold">No money changes hands</div>
            <p className="text-muted mt-1 text-sm">What you owe in one group cancels what {p.name} owes in another. Clearing records it in each group.</p>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-baseline justify-center gap-2">
              <span className="text-muted text-2xl font-bold" aria-hidden>
                {currencySymbol(cur)}
              </span>
              <MoneyInput
                bare
                id="settle-person-amount"
                className={`w-full min-w-0 max-w-[15rem] rounded-lg bg-transparent text-center font-extrabold tabular-nums outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-brand-500 ${tooMuch ? 'neg' : ''} ${big ? 'text-4xl' : 'text-5xl'}`}
                placeholder={centsToInput(0, cur)}
                aria-label={`Total amount in ${cur}`}
                aria-invalid={tooMuch || undefined}
                aria-describedby="settle-person-hint"
                enterKeyHint="done"
                value={amount}
                currency={cur}
                onChange={setAmount}
                data-testid="settle-person-amount"
              />
            </div>
            <div id="settle-person-hint" className="text-muted mt-1 text-center text-sm" aria-live="polite">
              {tooMuch ? (
                <span className="neg">More than the {fmt(owedTotal)} owed overall. </span>
              ) : value === owedTotal ? (
                `Total across ${n} groups`
              ) : (
                `${toMe ? `${p.name} owes you` : `You owe ${p.name}`} ${fmt(owedTotal)} overall. `
              )}
              {value !== owedTotal && (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center font-semibold text-brand-600 dark:text-brand-300"
                  onClick={() => setAmount(owedTotal)}
                >
                  Use
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card mt-3 p-4" data-testid="settle-person-breakdown">
        <h2 className="label">Recorded in each group</h2>
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {p.parts.map((r) => {
            const a = recorded.get(r.key)
            const s = Math.sign(signedAmount(r))
            return (
              <li key={r.key} className="flex items-center gap-3 py-2.5" data-testid="settle-person-part">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-ink-800" aria-hidden>
                  {r.groupEmoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.groupName}</div>
                  <div className="text-muted truncate text-xs">
                    {r.dir === 'owed' ? `${p.name} owes you ${fmt(r.amount)}` : `You owe ${p.name} ${fmt(r.amount)}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-bold tabular-nums ${a?.amount ? (s > 0 ? 'pos' : 'neg') : 'text-muted'}`} data-testid="settle-person-part-amount">
                    {formatMoney(s * (a?.amount ?? 0), cur, { sign: true })}
                  </div>
                  <div className="text-muted text-[11px] tabular-nums">{a && a.left > 0 ? `${fmt(a.left)} left` : 'clears'}</div>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-1 flex items-center gap-3 border-t border-slate-200 pt-2.5 dark:border-white/10">
          <span className="flex-1 font-bold">{even ? 'Net' : toMe ? `${p.name} pays you` : `You pay ${p.name}`}</span>
          <span className={`font-extrabold tabular-nums ${even ? 'text-muted' : toMe ? 'pos' : 'neg'}`} data-testid="settle-person-total">
            {formatMoney(Math.sign(p.net) * plan.payment, cur, { sign: !even })}
          </span>
        </div>
        {(mixed || partial) && (
          <div className="mt-3 space-y-1.5 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
            {mixed && !even && (
              <p>
                <span aria-hidden>💡 </span>You owe each other in different groups. Those cancel out, so they’re cleared in full and only {fmt(plan.payment)}{' '}
                changes hands.
              </p>
            )}
            {partial && (
              <p>
                Paying part of it: the amount is shared across the groups in proportion to what’s owed in each, so every group goes down by the same share. To
                round down or waive the rest in one group, settle it from that group.
              </p>
            )}
          </div>
        )}
        {otherCur.length > 0 && (
          <p className="text-muted mt-3 text-xs">
            {p.name} also has balances in {otherCur.map((x) => x.currency).join(', ')}. Different currencies are never netted together: settle those separately
            from Balances.
          </p>
        )}
      </div>

      {!even && (
        <PayWith
          key={toMe ? 'me' : p.key}
          cur={cur}
          toMe={toMe}
          payer={toMe ? p.name : 'You'}
          recipient={toMe ? 'You' : p.name}
          recipientJoined={!!recipientUid}
          payment={payee?.payment}
          payeeName={payee?.displayName ?? (toMe ? meName : p.name)}
          amount={tooMuch ? 0 : value}
          payNote="Split Now settle up"
          onPick={pickMethod}
        />
      )}

      <div className="card mt-3 space-y-3 p-4">
        {!even && (
          <div>
            <div className="label" id="settle-person-method-label">
              Method
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="settle-person-method-label">
              {settleMethods(cur).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={m === method}
                  onClick={() => pickMethod(m)}
                  className={`chip min-h-10 ${m === method ? 'chip-on' : ''}`}
                >
                  {methodLabel(m)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <DateField aria-label="Date" value={date} onChange={(v) => setDate(v || todayISO())} />
          <input className="input" placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <button type="submit" className="btn-primary mt-5 w-full" disabled={busy || tooMuch || (!even && value <= 0)} data-testid="settle-person-confirm">
        {even ? (
          <>
            <CheckCheck size={18} aria-hidden /> Clear {n} groups
          </>
        ) : (
          <>
            <ChequeIcon size={22} /> Record {value > 0 ? fmt(value) : 'payment'}
          </>
        )}
      </button>
      <p className="text-muted mt-2 text-center text-xs">
        {recordCount > 0 && (
          <>
            Records a settlement in {recordCount} group{recordCount === 1 ? '' : 's'}
            {plan.clearsAll ? ', clearing every one' : ''}.
          </>
        )}
      </p>
    </form>
  )
}
