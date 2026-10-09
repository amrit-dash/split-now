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
import { centsToInput, currencySymbol, formatMoney, fromHundredths, parseMoney } from '@/lib/money'
import { isIOS, isUpiId, methodFor, payOptions, settleMethods, type PayOption } from '@/lib/payments'
import { matchMember, parsePaymentScreenshot, type ParsedPayment } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { pendingSettlements, personBalances, signedAmount, type PersonBalance } from '@/lib/settleAll'
import { allocateAcrossGroups } from '@/lib/settleMulti'
import { lastMethod, rememberMethod } from '@/lib/recents'
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
  /** typed, read from a screenshot or given in the link: changing the people no longer refills it */
  const [amountTouched, setAmountTouched] = useState(false)
  const [method, setMethod] = useState('')
  /** picked by hand (or implied by a pay option / screenshot): stop choosing a default */
  const [methodTouched, setMethodTouched] = useState(false)
  const pickMethod = (m: string) => { setMethod(m); setMethodTouched(true) }
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [payee, setPayee] = useState<MemberProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [init, setInit] = useState(false)

  const applyPayment = (parsed: ParsedPayment) => {
    if (!d) return
    const p = { ...parsed, amount: parsed.amount && fromHundredths(parsed.amount, d.group.currency) }
    if (p.amount) { setAmountStr(centsToInput(p.amount, d.group.currency)); setAmountTouched(true) }
    if (p.method && settleMethods(d.group.currency).includes(p.method)) pickMethod(p.method)
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
      if (qa) { setAmountStr(centsToInput(Number(qa), d.group.currency)); setAmountTouched(true) }
    } else {
      const mine = d.debts.find((x) => x.from === d.me) ?? d.debts.find((x) => x.to === d.me) ?? d.debts[0]
      if (mine) { setFrom(mine.from); setTo(mine.to); setAmountStr(centsToInput(mine.amount, d.group.currency)) }
      else { const o = memberOrder(d.group); setFrom(d.me ?? o[0]); setTo(o.find((x) => x !== d.me) ?? o[0]) }
    }
    if (pending.payment) { applyPayment(pending.payment.parsed); pending.payment = undefined }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, init])

  // A different pair of people: offer what they owe, until the amount is typed by hand.
  useEffect(() => {
    if (!d || !init || amountTouched || !from || !to) return
    const o = d.debts.find((x) => x.from === from && x.to === to)?.amount
    setAmountStr(o ? centsToInput(o, d.group.currency) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, init])

  const toUid = group?.members[to]?.uid
  useEffect(() => {
    setPayee(null)
    // Payment handles are shared per group (only co-members can read them).
    if (toUid && groupId) repo.getMemberProfile(groupId, toUid).then(setPayee).catch(() => {})
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
  const toMe = to === d.me

  const save = async () => {
    if (!Number.isFinite(amount) || amount <= 0) return toast('Enter an amount', 'err')
    if (!from || !to || from === to) return toast('Pick two different people', 'err')
    setBusy(true)
    try {
      await repo.saveSettlement({ id: uid('s_'), groupId: group.id, from, to, amount, method, note: note.trim() || undefined, date, createdBy: user.uid, createdAt: Date.now() })
      rememberMethod(group.id, to, method)
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
          <input className={`w-full min-w-0 max-w-[15rem] bg-transparent text-center font-extrabold tabular-nums outline-none ${amountStr.length > 7 ? 'text-4xl' : 'text-5xl'}`} inputMode="decimal" placeholder="0.00" value={amountStr} onChange={(e) => { setAmountStr(e.target.value); setAmountTouched(true) }} />
        </div>
        {owed !== undefined && <div className="mt-1 text-center text-sm text-slate-500">{name(from)} owe{from === d.me ? '' : 's'} {name(to)} {formatMoney(owed, cur)} <button className="font-semibold text-brand-600" onClick={() => { setAmountStr(centsToInput(owed, cur)); setAmountTouched(false) }}>Use</button></div>}

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
        <PayWith key={to} cur={cur} toMe={toMe} payer={name(from)} recipient={name(to)} recipientJoined={!!toUid}
          payment={payee?.payment} payeeName={payeeName} amount={payAmount} payNote={payNote} onPick={pickMethod} />
      )}

      <div className="card mt-3 space-y-3 p-4">
        <div>
          <div className="label">Method</div>
          <div className="flex flex-wrap gap-2">{methods.map((m) => <button key={m} onClick={() => pickMethod(m)} className={`chip ${m === method ? 'chip-on' : ''}`}>{m}</button>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DateField aria-label="Date" value={date} onChange={(v) => setDate(v || todayISO())} />
          <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <button className="btn-primary mt-5 w-full" onClick={save} disabled={busy}><ChequeIcon size={22} /> Record {Number.isFinite(amount) && amount > 0 ? formatMoney(amount, cur) : 'payment'}</button>
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
      options={order.map((id) => ({ value: id, text: name(id), label: name(id), icon: <Avatar name={group.members[id].name} photoURL={group.members[id].photoURL} color={group.members[id].color} size={28} /> }))}
      triggerClassName="rounded-2xl bg-slate-50 p-3 transition active:scale-[0.99] dark:bg-ink-800"
      renderTrigger={(_, open) => (
        <span className="flex items-center gap-3">
          {m ? <Avatar name={m.name} photoURL={m.photoURL} color={m.color} size={40} /> : <span className="h-10 w-10 rounded-full bg-slate-200" />}
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

/**
 * "Pay X with" / "Get paid by X": the recipient's payment handles (UPI QR + app links, PayID,
 * bank, PayPal…), or a box to paste their UPI ID when none is on file. Shared by the single-group
 * and cross-group settle screens. Key it by recipient so a typed UPI ID doesn't carry over.
 */
function PayWith({ cur, toMe, payer, recipient, recipientJoined, payment, payeeName, amount, payNote, onPick }: {
  cur: string; toMe: boolean; payer: string; recipient: string; recipientJoined: boolean
  payment?: PaymentHandles; payeeName?: string; amount: Cents; payNote: string; onPick: (method: string) => void
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
        <p className="text-sm text-slate-500">{toMe ? 'Add your UPI ID in Profile so friends can scan a QR to pay you.' : recipientJoined ? `${recipient} hasn’t added payment details yet.` : `${recipient} hasn’t joined Split Now yet — ask them for their ${cur === 'INR' ? 'UPI ID' : cur === 'AUD' ? 'PayID or bank details' : 'payment details'}.`}</p>
      )}
      {canTypeUpi && (
        <input className="input mt-2" placeholder={`${recipient}’s UPI ID (e.g. name@okaxis)`} value={manualUpi} onChange={(e) => setManualUpi(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Recipient UPI ID" data-testid="manual-upi" />
      )}
      {shown.length > 0 && (
        <div className="mt-2 space-y-2">
          {shown.map((o) => o.qr ? (
            <UpiCard key={`${o.key}-${o.value}`} o={o} amount={amount} cur={cur} toMe={toMe} payer={payer} onPick={() => onPick('UPI')} onCopy={async () => { await copy(o.value); onPick('UPI'); toast('UPI ID copied') }} />
          ) : (
            <div key={`${o.key}-${o.value}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-500">{o.label}</div>
                <div className="truncate font-mono text-sm">{o.value}</div>
              </div>
              <button className="rounded-xl p-2 hover:bg-white dark:hover:bg-ink-700" onClick={async () => { await copy(o.value); onPick(methodFor(o)); toast(`${o.label} copied`) }} aria-label={`Copy ${o.label}`}><Copy size={18} /></button>
              {o.href && <a className="accent-live rounded-xl bg-brand-600 p-2 text-white" href={o.href} target="_blank" rel="noreferrer" onClick={() => onPick(methodFor(o))} aria-label={`Open ${o.label}`}><ExternalLink size={18} /></a>}
            </div>
          ))}
          <p className="text-xs text-slate-500">Pay in your UPI or banking app, then record it below. Split Now never moves money itself.</p>
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
  const { key = '' } = useParams()
  const { user, profile } = useMe()
  const data = useAllGroupData()
  const nav = useNavigate()
  const toast = useToast()
  const people = useMemo(() => (data ? personBalances(pendingSettlements(data, profile.currency)) : null), [data, profile.currency])
  /** frozen while saving: each saved settlement changes the live balance under us */
  const [snap, setSnap] = useState<PersonBalance | null>(null)
  const p = snap ?? people?.find((x) => x.key === key) ?? null
  const [amountStr, setAmountStr] = useState('')
  const [method, setMethod] = useState('')
  const [methodTouched, setMethodTouched] = useState(false)
  const pickMethod = (m: string) => { setMethod(m); setMethodTouched(true) }
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
    setAmountStr(p.net === 0 ? '' : centsToInput(Math.abs(p.net), p.currency))
    setMethod(settleMethods(p.currency)[0])
  }, [p, init])

  // The recipient's payment handles: per group, so try each shared group until one has some.
  const recipientUid = toMe ? user.uid : p?.parts.find((r) => r.uid)?.uid
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
        if (m && payOptions(m.payment, 0, cur, '').length > 0) { setPayee(m); return }
        first ??= m
      }
      if (!off && first) setPayee(first)
    })()
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [majorKey, toMe, cur, user.uid, p?.net === 0])

  // Method: what was last used to pay this person in one of these groups, else UPI when they have a UPI ID.
  const payeeUpi = !!payee?.payment?.upi?.trim()
  useEffect(() => {
    if (!p || !init || methodTouched) return
    const ms = settleMethods(cur)
    const remembered = major.map((r) => lastMethod(r.groupId, toMe ? r.me : r.memberId)).find((m) => m && ms.includes(m))
    setMethod(remembered ?? (payeeUpi && ms.includes('UPI') ? 'UPI' : ms[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [majorKey, payeeUpi, init])

  if (!people && !snap) return <Loading />
  if (!p) {
    return (
      <>
        <PageHeader title="Settle up" back="/settle" />
        <Empty emoji="🎉" title="Nothing left to settle">You’re all square with this person. <Link to="/settle" className="font-semibold text-brand-600">Back to Balances</Link></Empty>
      </>
    )
  }

  const n = new Set(p.parts.map((r) => r.groupId)).size
  const even = p.net === 0
  const owedTotal = Math.abs(p.net)
  const typedAmount = parseMoney(amountStr, cur)
  const amount = even ? 0 : Number.isFinite(typedAmount) ? typedAmount : 0
  const tooMuch = !even && amount > owedTotal
  const plan = allocateAcrossGroups(p.parts.map((r) => ({ key: r.key, signed: signedAmount(r) })), amount)
  const recorded = new Map(plan.allocations.map((a) => [a.key, a]))
  const mixed = p.parts.some((r) => r.dir === 'owe') && p.parts.some((r) => r.dir === 'owed')
  const partial = !even && amount > 0 && amount < owedTotal
  const fmt = (c: Cents) => formatMoney(c, cur)
  const recordCount = new Set(p.parts.filter((r) => (recorded.get(r.key)?.amount ?? 0) > 0).map((r) => r.groupId)).size
  const meName = profile.displayName || 'You'
  // Same person, other currencies: separate balances, never netted with this one.
  const personPart = p.key.slice(0, p.key.lastIndexOf('|'))
  const otherCur = (people ?? []).filter((x) => x.key !== p.key && x.key.slice(0, x.key.lastIndexOf('|')) === personPart)

  const save = async () => {
    if (!even && amount <= 0) return toast('Enter an amount', 'err')
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
          id: uid('s_'), groupId: r.groupId, from, to, amount: a.amount,
          method: counter ? 'Cross-group netting' : method,
          note: note.trim() || auto, date, createdBy: user.uid, createdAt: Date.now(),
        })
        if (!counter) rememberMethod(r.groupId, to, method)
        saved++
      }
      toast(even ? `Cleared ${n} groups with ${p.name}` : plan.clearsAll ? `Settled up with ${p.name} across ${n} groups 💸` : `Recorded ${fmt(plan.payment)} ${toMe ? 'from' : 'to'} ${p.name} 💸`)
      nav('/settle', { replace: true })
    } catch (e) {
      toast(saved ? `Saved ${saved} of the groups, then: ${(e as Error).message}` : (e as Error).message, 'err')
      // Start over from what's actually left now.
      setSnap(null)
      setInit(false)
      setBusy(false)
    }
  }

  return (
    <div data-testid="settle-person">
      <PageHeader title="Settle up" subtitle={`with ${p.name} · ${n} groups`} back />
      <div className="card p-5">
        <div className="flex flex-col items-center text-center">
          <Avatar name={p.name} photoURL={p.photoURL} color={p.color} size={56} />
          <div className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400" data-testid="settle-person-dir">
            {even ? `You and ${p.name} are even overall` : toMe ? `${p.name} pays you` : `You pay ${p.name}`}
          </div>
        </div>
        {even ? (
          <div className="mt-3 text-center">
            <div className="text-3xl font-extrabold">No money changes hands</div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">What you owe in one group cancels what {p.name} owes in another. Clearing records it in each group.</p>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-baseline justify-center gap-2">
              <span className="text-2xl font-bold text-slate-400" aria-label={cur}>{currencySymbol(cur)}</span>
              <input className={`w-full min-w-0 max-w-[15rem] bg-transparent text-center font-extrabold tabular-nums outline-none ${tooMuch ? 'neg' : ''} ${amountStr.length > 7 ? 'text-4xl' : 'text-5xl'}`}
                inputMode="decimal" placeholder="0.00" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} aria-label="Total amount" data-testid="settle-person-amount" />
            </div>
            <div className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
              {tooMuch ? <span className="neg">More than the {fmt(owedTotal)} owed overall. </span>
                : amount === owedTotal ? `Total across ${n} groups` : `${toMe ? `${p.name} owes you` : `You owe ${p.name}`} ${fmt(owedTotal)} overall. `}
              {amount !== owedTotal && <button className="font-semibold text-brand-600" onClick={() => setAmountStr(centsToInput(owedTotal, cur))}>Use</button>}
            </div>
          </>
        )}
      </div>

      <div className="card mt-3 p-4" data-testid="settle-person-breakdown">
        <div className="label">Recorded in each group</div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {p.parts.map((r) => {
            const a = recorded.get(r.key)
            const s = Math.sign(signedAmount(r))
            return (
              <div key={r.key} className="flex items-center gap-3 py-2.5" data-testid="settle-person-part">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-ink-800" aria-hidden>{r.groupEmoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.groupName}</div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {r.dir === 'owed' ? `${p.name} owes you ${fmt(r.amount)}` : `You owe ${p.name} ${fmt(r.amount)}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-bold tabular-nums ${a?.amount ? (s > 0 ? 'pos' : 'neg') : 'text-slate-400'}`} data-testid="settle-person-part-amount">
                    {formatMoney(s * (a?.amount ?? 0), cur, { sign: true })}
                  </div>
                  <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{a && a.left > 0 ? `${fmt(a.left)} left` : 'clears'}</div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex items-center gap-3 border-t border-slate-200 pt-2.5 dark:border-white/10">
          <span className="flex-1 font-bold">{even ? 'Net' : toMe ? `${p.name} pays you` : `You pay ${p.name}`}</span>
          <span className={`font-extrabold tabular-nums ${even ? 'text-slate-400' : toMe ? 'pos' : 'neg'}`} data-testid="settle-person-total">
            {formatMoney(Math.sign(p.net) * plan.payment, cur, { sign: !even })}
          </span>
        </div>
        {(mixed || partial) && (
          <div className="mt-3 space-y-1.5 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
            {mixed && !even && <p>💡 You owe each other in different groups. Those cancel out, so they’re cleared in full and only {fmt(plan.payment)} changes hands.</p>}
            {partial && <p>Paying part of it: the amount is shared across the groups in proportion to what’s owed in each, so every group goes down by the same share.</p>}
          </div>
        )}
        {otherCur.length > 0 && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {p.name} also has balances in {otherCur.map((x) => x.currency).join(', ')}. Different currencies are never netted together: settle those separately from Balances.
          </p>
        )}
      </div>

      {!even && (
        <PayWith key={toMe ? 'me' : p.key} cur={cur} toMe={toMe} payer={toMe ? p.name : 'You'} recipient={toMe ? 'You' : p.name}
          recipientJoined={!!recipientUid} payment={payee?.payment} payeeName={payee?.displayName ?? (toMe ? meName : p.name)}
          amount={tooMuch ? 0 : amount} payNote="Split Now settle up" onPick={pickMethod} />
      )}

      <div className="card mt-3 space-y-3 p-4">
        {!even && (
          <div>
            <div className="label">Method</div>
            <div className="flex flex-wrap gap-2">{settleMethods(cur).map((m) => <button key={m} onClick={() => pickMethod(m)} className={`chip ${m === method ? 'chip-on' : ''}`}>{m}</button>)}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <DateField aria-label="Date" value={date} onChange={(v) => setDate(v || todayISO())} />
          <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <button className="btn-primary mt-5 w-full" onClick={save} disabled={busy || tooMuch || (!even && amount <= 0)} data-testid="settle-person-confirm">
        {even ? <><CheckCheck size={18} aria-hidden /> Clear {n} groups</> : <><ChequeIcon size={22} /> Record {amount > 0 ? fmt(amount) : 'payment'}</>}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
        {recordCount > 0 && <>Records a settlement in {recordCount} group{recordCount === 1 ? '' : 's'}{plan.clearsAll ? ', clearing every one' : ''}.</>}
      </p>
    </div>
  )
}
