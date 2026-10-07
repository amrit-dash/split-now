import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, Camera, Copy, ExternalLink } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { computeGroupData, memberOrder, useExpenses, useGroup, useSettlements } from '@/hooks/data'
import { useOcr } from '@/hooks/useOcr'
import type { MemberId } from '@/types'
import type { MemberProfile } from '@/data/repo'
import { centsToInput, formatMoney, fromHundredths, parseMoney } from '@/lib/money'
import { payOptions } from '@/lib/payments'
import { matchMember, parsePaymentScreenshot, type ParsedPayment } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { copy } from '@/lib/share'
import { todayISO, uid } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { Empty, Loading, PageHeader, Spinner } from '@/components/Misc'
import { useToast } from '@/components/Toast'

const METHODS = ['PayID', 'Bank transfer', 'Cash', 'PayPal', 'UPI', 'Revolut', 'Other']

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
  const [method, setMethod] = useState('PayID')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [payee, setPayee] = useState<MemberProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [init, setInit] = useState(false)

  const applyPayment = (parsed: ParsedPayment) => {
    if (!d) return
    const p = { ...parsed, amount: parsed.amount && fromHundredths(parsed.amount, d.group.currency) }
    if (p.amount) setAmountStr(centsToInput(p.amount, d.group.currency))
    if (p.method && METHODS.includes(p.method)) setMethod(p.method)
    if (p.date) setDate(p.date)
    const members = Object.entries(d.group.members).map(([id, m]) => ({ id, name: m.name }))
    const match = matchMember(p.payee, members.filter((m) => m.id !== d.me))
    if (match && d.me) { setFrom(d.me); setTo(match) }
    toast(p.amount ? `Read ${formatMoney(p.amount, d.group.currency)}${match ? ` to ${d.group.members[match].name}` : ''}` : 'Couldn’t read an amount')
  }

  useEffect(() => {
    if (!d || init) return
    setInit(true)
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
  const options = payOptions(payee?.payment, Number.isFinite(amount) ? amount : 0, cur, `Split It: ${group.name}`)

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
          <span className="text-2xl font-bold text-slate-400">{cur}</span>
          <input className="w-48 bg-transparent text-center text-5xl font-extrabold tabular-nums outline-none" inputMode="decimal" placeholder="0.00" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
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
          <div className="label">Pay {name(to)} with</div>
          {options.length === 0 ? (
            <p className="text-sm text-slate-500">{toUid ? `${name(to)} hasn’t added payment details yet.` : `${name(to)} hasn’t joined Split It yet — ask them for their PayID or bank details.`}</p>
          ) : (
            <div className="space-y-2">
              {options.map((o) => (
                <div key={o.key} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-500">{o.label}</div>
                    <div className="truncate font-mono text-sm">{o.value}</div>
                  </div>
                  <button className="rounded-xl p-2 hover:bg-white dark:hover:bg-ink-700" onClick={async () => { await copy(o.value); setMethod(o.label.startsWith('Bank') ? 'Bank transfer' : o.label); toast(`${o.label} copied`) }} aria-label={`Copy ${o.label}`}><Copy size={18} /></button>
                  {o.href && <a className="rounded-xl bg-brand-600 p-2 text-white" href={o.href} target="_blank" rel="noreferrer" onClick={() => setMethod(o.label)} aria-label={`Open ${o.label}`}><ExternalLink size={18} /></a>}
                </div>
              ))}
              <p className="text-xs text-slate-500">Pay in your banking app, then record it below. Split It never moves money itself.</p>
            </div>
          )}
        </div>
      )}

      <div className="card mt-3 space-y-3 p-4">
        <div>
          <div className="label">Method</div>
          <div className="flex flex-wrap gap-2">{METHODS.map((m) => <button key={m} onClick={() => setMethod(m)} className={`chip ${m === method ? 'chip-on' : ''}`}>{m}</button>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
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
    <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
      {m ? <Avatar name={m.name} color={m.color} size={40} /> : <div className="h-10 w-10 rounded-full bg-slate-200" />}
      <div className="flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <select className="w-full appearance-none bg-transparent font-bold outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
          {order.map((id) => <option key={id} value={id}>{name(id)}</option>)}
        </select>
      </div>
    </label>
  )
}
