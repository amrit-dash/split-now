import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, Camera, ChevronDown, Copy, ExternalLink, QrCode as QrIcon } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { computeGroupData, memberOrder, useExpenses, useGroup, useSettlements } from '@/hooks/data'
import { useOcr } from '@/hooks/useOcr'
import type { MemberId } from '@/types'
import type { MemberProfile } from '@/data/repo'
import { centsToInput, currencySymbol, formatMoney, fromHundredths, parseMoney } from '@/lib/money'
import { isIOS, isUpiId, methodFor, payOptions, settleMethods, type PayOption } from '@/lib/payments'
import { matchMember, parsePaymentScreenshot, type ParsedPayment } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { copy } from '@/lib/share'
import { todayISO, uid } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { QrCode } from '@/components/QrCode'
import { encodeQr } from '@/lib/qr'
import { Empty, Loading, PageHeader, Spinner } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { Select } from '@/components/Select'
import { DateField } from '@/components/DateField'

export default function SettleUp() {
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

  const d = useMemo(() => (group && expenses && settlements ? computeGroupData(group, expenses, settlements, user.uid) : null), [group, expenses, settlements, user.uid])
  const [from, setFrom] = useState<MemberId>('')
  const [to, setTo] = useState<MemberId>('')
  const [amountStr, setAmountStr] = useState('')
  const [method, setMethod] = useState('')
  /** a UPI ID typed in for someone who hasn't joined (or hasn't added one) */
  const [manualUpi, setManualUpi] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [payee, setPayee] = useState<MemberProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [init, setInit] = useState(false)

  const applyPayment = (parsed: ParsedPayment) => {
    if (!d) return
    const p = { ...parsed, amount: parsed.amount && fromHundredths(parsed.amount, d.group.currency) }
    if (p.amount) setAmountStr(centsToInput(p.amount, d.group.currency))
    if (p.method && settleMethods(d.group.currency).includes(p.method)) setMethod(p.method)
    if (p.date) setDate(p.date)
    const members = Object.entries(d.group.members).map(([id, m]) => ({ id, name: m.name }))
    const match = matchMember(p.payee, members.filter((m) => m.id !== d.me))
    if (match && d.me) { setFrom(d.me); setTo(match) }
    toast(p.amount ? `Read ${formatMoney(p.amount, d.group.currency)}${match ? ` to ${d.group.members[match].name}` : ''}` : 'Couldn’t read an amount')
  }

  useEffect(() => {
    if (!d || init) return
    setInit(true)
    setMethod(settleMethods(d.group.currency)[0])
    const qf = params.get('from'), qt = params.get('to'), qa = params.get('amount')
    if (qf && qt) {
      setFrom(qf); setTo(qt)
      if (qa) setAmountStr(centsToInput(Number(qa), d.group.currency))
    } else {
      const mine = d.debts.find((x) => x.from === d.me) ?? d.debts.find((x) => x.to === d.me) ?? d.debts[0]
      if (mine) { setFrom(mine.from); setTo(mine.to); setAmountStr(centsToInput(mine.amount, d.group.currency)) }
      else { const o = memberOrder(d.group); setFrom(d.me ?? o[0]); setTo(o.find((x) => x !== d.me) ?? o[0]) }
    }
    if (pending.payment) { applyPayment(pending.payment.parsed); pending.payment = undefined }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, init])

  const toUid = group?.members[to]?.uid
  useEffect(() => {
    setPayee(null)
    setManualUpi('')
    // Payment handles are shared per group (only co-members can read them).
    if (toUid && groupId) repo.getMemberProfile(groupId, toUid).then(setPayee).catch(() => {})
  }, [toUid, groupId])

  if (group === null) return <><PageHeader title="Settle up" back /><Empty emoji="🔍" title="This group doesn’t exist or you’re not a member" /></>
  if (!d || !group) return <Loading />
  const cur = group.currency
  const order = memberOrder(group)
  const amount = parseMoney(amountStr, cur)
  const name = (id: MemberId) => (id === d.me ? 'You' : group.members[id]?.name ?? '')
  const owed = d.debts.find((x) => x.from === from && x.to === to)?.amount
  const methods = settleMethods(cur)
  const payAmount = Number.isFinite(amount) ? amount : 0
  const payNote = `Split Now ${group.name}`
  const payeeName = payee?.displayName ?? group.members[to]?.name
  const options = payOptions(payee?.payment, payAmount, cur, payNote, payeeName)
  // No UPI on file: let the payer paste the recipient's UPI ID to get the same QR / app links.
  const canTypeUpi = cur === 'INR' && to !== d.me && !options.some((o) => o.key === 'upi')
  const typed = canTypeUpi && isUpiId(manualUpi) ? payOptions({ upi: manualUpi.trim() }, payAmount, cur, payNote, payeeName) : []
  const shown = [...options, ...typed]
  const toMe = to === d.me

  const save = async () => {
    if (!Number.isFinite(amount) || amount <= 0) return toast('Enter an amount', 'err')
    if (!from || !to || from === to) return toast('Pick two different people', 'err')
    setBusy(true)
    try {
      await repo.saveSettlement({ id: uid('s_'), groupId: group.id, from, to, amount, method, note: note.trim() || undefined, date, createdBy: user.uid, createdAt: Date.now() })
      toast('Payment recorded 💸')
      nav(`/groups/${group.id}`, { replace: true })
    } catch (e) {
      toast((e as Error).message, 'err')
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Settle up" subtitle={`${group.emoji} ${group.name}`} back />
      <div className="card p-5">
        <PersonSelect label="Payer" value={from} onChange={(v) => { setFrom(v); if (v === to) setTo(order.find((x) => x !== v) ?? '') }} order={order} group={group} name={name} />
        <div className="my-2 flex justify-center"><span className="rounded-full bg-slate-100 p-2 dark:bg-ink-800"><ArrowDown size={18} /></span></div>
        <PersonSelect label="Recipient" value={to} onChange={setTo} order={order.filter((x) => x !== from)} group={group} name={name} />

        <div className="mt-5 flex items-baseline justify-center gap-2">
          <span className="text-2xl font-bold text-slate-400" aria-label={cur}>{currencySymbol(cur)}</span>
          <input className={`w-full min-w-0 max-w-[15rem] bg-transparent text-center font-extrabold tabular-nums outline-none ${amountStr.length > 7 ? 'text-4xl' : 'text-5xl'}`} inputMode="decimal" placeholder="0.00" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
        </div>
        {owed !== undefined && <div className="mt-1 text-center text-sm text-slate-500">{name(from)} owe{from === d.me ? '' : 's'} {name(to)} {formatMoney(owed, cur)} <button className="font-semibold text-brand-600" onClick={() => setAmountStr(centsToInput(owed, cur))}>Use</button></div>}

        <button className="btn-secondary mt-4 w-full !min-h-0 !py-2.5 text-sm" onClick={() => fileRef.current?.click()} disabled={ocr.busy}>
          {ocr.busy ? <><Spinner className="!h-4 !w-4" /> Reading {Math.round(ocr.progress * 100)}%</> : <><Camera size={16} /> Read from payment screenshot</>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ''
          if (!f) return
          try { applyPayment(parsePaymentScreenshot(await ocr.run(f))) } catch (err) { toast((err as Error).message, 'err') }
        }} />
      </div>

      {to && (
        <div className="card mt-3 p-4">
          <div className="label">{toMe ? `Get paid by ${name(from)}` : `Pay ${name(to)} with`}</div>
          {shown.length === 0 && (
            <p className="text-sm text-slate-500">{toMe ? 'Add your UPI ID in Profile so friends can scan a QR to pay you.' : toUid ? `${name(to)} hasn’t added payment details yet.` : `${name(to)} hasn’t joined Split Now yet — ask them for their ${cur === 'INR' ? 'UPI ID' : cur === 'AUD' ? 'PayID or bank details' : 'payment details'}.`}</p>
          )}
          {canTypeUpi && (
            <input className="input mt-2" placeholder={`${name(to)}’s UPI ID (e.g. name@okaxis)`} value={manualUpi} onChange={(e) => setManualUpi(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Recipient UPI ID" data-testid="manual-upi" />
          )}
          {shown.length > 0 && (
            <div className="mt-2 space-y-2">
              {shown.map((o) => o.qr ? (
                <UpiCard key={`${o.key}-${o.value}`} o={o} amount={payAmount} cur={cur} toMe={toMe} payer={name(from)} onPick={() => setMethod('UPI')} onCopy={async () => { await copy(o.value); setMethod('UPI'); toast('UPI ID copied') }} />
              ) : (
                <div key={`${o.key}-${o.value}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-500">{o.label}</div>
                    <div className="truncate font-mono text-sm">{o.value}</div>
                  </div>
                  <button className="rounded-xl p-2 hover:bg-white dark:hover:bg-ink-700" onClick={async () => { await copy(o.value); setMethod(methodFor(o)); toast(`${o.label} copied`) }} aria-label={`Copy ${o.label}`}><Copy size={18} /></button>
                  {o.href && <a className="rounded-xl bg-brand-600 p-2 text-white" href={o.href} target="_blank" rel="noreferrer" onClick={() => setMethod(methodFor(o))} aria-label={`Open ${o.label}`}><ExternalLink size={18} /></a>}
                </div>
              ))}
              <p className="text-xs text-slate-500">Pay in your UPI or banking app, then record it below. Split Now never moves money itself.</p>
            </div>
          )}
        </div>
      )}

      <div className="card mt-3 space-y-3 p-4">
        <div>
          <div className="label">Method</div>
          <div className="flex flex-wrap gap-2">{methods.map((m) => <button key={m} onClick={() => setMethod(m)} className={`chip ${m === method ? 'chip-on' : ''}`}>{m}</button>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DateField aria-label="Date" value={date} onChange={(v) => setDate(v || todayISO())} />
          <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <button className="btn-primary mt-5 w-full" onClick={save} disabled={busy}>Record {Number.isFinite(amount) && amount > 0 ? formatMoney(amount, cur) : 'payment'}</button>
    </div>
  )
}

function PersonSelect({ label, value, onChange, order, group, name }: { label: string; value: MemberId; onChange: (v: MemberId) => void; order: MemberId[]; group: NonNullable<ReturnType<typeof useGroup>>; name: (id: MemberId) => string }) {
  const m = group.members[value]
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={onChange}
      options={order.map((id) => ({ value: id, text: name(id), label: name(id), icon: <Avatar name={group.members[id].name} color={group.members[id].color} size={28} /> }))}
      triggerClassName="rounded-2xl bg-slate-50 p-3 transition active:scale-[0.99] dark:bg-ink-800"
      renderTrigger={(_, open) => (
        <span className="flex items-center gap-3">
          {m ? <Avatar name={m.name} color={m.color} size={40} /> : <span className="h-10 w-10 rounded-full bg-slate-200" />}
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            <span className="block truncate font-bold">{name(value)}</span>
          </span>
          <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      )}
    />
  )
}

/** UPI: a scannable QR for the exact amount, plus buttons that open a UPI app on this phone. */
function UpiCard({ o, amount, cur, toMe, payer, onPick, onCopy }: { o: PayOption; amount: number; cur: string; toMe: boolean; payer: string; onPick: () => void; onCopy: () => void }) {
  const ios = isIOS()
  let qrOk = true
  try { if (o.qr) encodeQr(o.qr) } catch { qrOk = false }
  return (
    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-ink-800" data-testid="upi-card">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-500">UPI</div>
          <div className="truncate font-mono text-sm">{o.value}</div>
        </div>
        <button className="rounded-xl p-2 hover:bg-white dark:hover:bg-ink-700" onClick={onCopy} aria-label="Copy UPI ID"><Copy size={18} /></button>
      </div>
      {o.qr && qrOk && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <QrCode value={o.qr} size={196} label={`UPI QR code to pay ${o.value}${amount > 0 ? ` ${formatMoney(amount, cur)}` : ''}`} />
          <div className="flex items-center gap-1.5 text-center text-xs text-slate-500"><QrIcon size={14} className="shrink-0" />
            {toMe ? `Show this to ${payer}: they scan it with any UPI app` : 'Scan with any UPI app on another phone'}{amount > 0 ? ` · ${formatMoney(amount, cur)}` : ''}
          </div>
        </div>
      )}
      {!toMe && o.href && (
        <div className="mt-3 space-y-2">
          <a className="btn-primary w-full !min-h-0 !py-2.5 text-sm" href={o.href} onClick={onPick} data-testid="upi-open">Pay {amount > 0 ? formatMoney(amount, cur) : ''} with a UPI app <ExternalLink size={16} /></a>
          <div className="grid grid-cols-3 gap-2">
            {o.apps?.map((a) => <a key={a.id} className="btn !min-h-0 !px-2 !py-2 text-xs bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-ink-700 dark:text-slate-100 dark:ring-white/10" href={a.href} onClick={onPick} data-testid={`upi-${a.id}`}>{a.label}</a>)}
          </div>
          <p className="text-[11px] leading-snug text-slate-400">{ios ? 'On iPhone, pick your app: “Pay with a UPI app” opens whichever UPI app iOS chooses.' : 'Android shows a list of your UPI apps.'} If an app refuses the link, scan the QR or pay to the UPI ID.</p>
        </div>
      )}
    </div>
  )
}
