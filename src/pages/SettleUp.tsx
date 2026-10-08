import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, Camera, Check, ChevronDown, Copy, ExternalLink, QrCode as QrIcon } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { computeGroupData, memberOrder, useExpenses, useGroup, useSettlements } from '@/hooks/data'
import { useOcr } from '@/hooks/useOcr'
import type { MemberId } from '@/types'
import type { MemberProfile } from '@/data/repo'
import { centsToInput, currencySymbol, formatMoney, fromHundredths } from '@/lib/money'
import { isIOS, isUpiId, methodFor, methodLabel, payOptions, roundSuggestions, settleMethods, type PayOption } from '@/lib/payments'
import { matchMember, parsePaymentScreenshot, type ParsedPayment } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { lastMethod, rememberMethod } from '@/lib/recents'
import { copy } from '@/lib/share'
import { errText } from '@/lib/errors'
import { todayISO, uid } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { QrCode } from '@/components/QrCode'
import { encodeQr } from '@/lib/qr'
import { Empty, Loading, PageHeader, Spinner } from '@/components/Misc'
import { MoneyInput } from '@/components/MoneyInput'
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
  /** a UPI ID typed in for someone who hasn't joined (or hasn't added one) */
  const [manualUpi, setManualUpi] = useState('')
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
    const members = Object.entries(d.group.members).map(([id, m]) => ({ id, name: m.name }))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, init])

  // A different pair of people: offer what they owe, until the amount is typed by hand.
  useEffect(() => {
    if (!d || !init || amountTouched || !from || !to) return
    setAmount(d.debts.find((x) => x.from === from && x.to === to)?.amount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, init])

  const toUid = group?.members[to]?.uid
  useEffect(() => {
    setPayee(null)
    setManualUpi('')
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
  useEffect(() => {
    if (!d || !init || methodTouched || !to) return
    const ms = settleMethods(d.group.currency)
    const remembered = lastMethod(d.group.id, to)
    setMethod(remembered && ms.includes(remembered) ? remembered : payeeUpi && ms.includes('UPI') ? 'UPI' : ms[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const order = memberOrder(group)
  const name = (id: MemberId) => (id === d.me ? 'You' : (group.members[id]?.name ?? ''))
  const owed = d.debts.find((x) => x.from === from && x.to === to)?.amount
  const methods = settleMethods(cur)
  const validAmount = amount !== undefined && amount > 0
  const payAmount = validAmount ? amount : 0
  const payNote = `Split Now ${group.name}`
  const payeeName = payee?.displayName ?? group.members[to]?.name
  const options = payOptions(payee?.payment, payAmount, cur, payNote, payeeName)
  // No UPI on file: let the payer paste the recipient's UPI ID to get the same QR / app links.
  const canTypeUpi = cur === 'INR' && to !== d.me && !options.some((o) => o.key === 'upi')
  const typed = canTypeUpi && isUpiId(manualUpi) ? payOptions({ upi: manualUpi.trim() }, payAmount, cur, payNote, payeeName) : []
  const shown = [...options, ...typed]
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
      await repo.saveSettlement({ id: uid('s_'), ...base, amount, method, note: note.trim() || undefined })
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
        <div className="card mt-3 p-4">
          <div className="label">{toMe ? `Get paid by ${name(from)}` : `Pay ${name(to)} with`}</div>
          {shown.length === 0 && (
            <p className="text-sm text-muted">
              {toMe
                ? 'Add your UPI ID in Profile so friends can scan a QR to pay you.'
                : toUid
                  ? `${name(to)} hasn’t added payment details yet.`
                  : `${name(to)} hasn’t joined Split Now yet. Ask them for their ${cur === 'INR' ? 'UPI ID' : cur === 'AUD' ? 'PayID or bank details' : 'payment details'}.`}
            </p>
          )}
          {canTypeUpi && (
            <input
              className="input mt-2"
              placeholder={`${name(to)}’s UPI ID (e.g. name@okaxis)`}
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
                    amount={payAmount}
                    cur={cur}
                    toMe={toMe}
                    payer={name(from)}
                    onPick={() => pickMethod('UPI')}
                    onCopy={async () => {
                      await copy(o.value)
                      pickMethod('UPI')
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
                        pickMethod(methodFor(o))
                        toast(`${o.label} copied`)
                      }}
                      aria-label={`Copy ${o.label}`}
                    >
                      <Copy size={18} />
                    </button>
                    {o.href && (
                      <a
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"
                        href={o.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => pickMethod(methodFor(o))}
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
        <Check size={18} aria-hidden /> Record {validAmount ? formatMoney(amount, cur) : 'payment'}
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
        icon: <Avatar name={group.members[id].name} color={group.members[id].color} size={28} />,
      }))}
      triggerClassName="rounded-2xl bg-slate-50 p-3 transition active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-ink-800"
      renderTrigger={(_, open) => (
        <span className="flex items-center gap-3">
          {m ? <Avatar name={m.name} color={m.color} size={40} /> : <span className="h-10 w-10 rounded-full bg-slate-200" />}
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
