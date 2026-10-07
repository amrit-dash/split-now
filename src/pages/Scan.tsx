import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ImageUp, Receipt, Send } from 'lucide-react'
import { useAllGroupData } from '@/hooks/data'
import { useOcr } from '@/hooks/useOcr'
import { defaultCurrency } from '@/lib/locale'
import { formatMoney, fromHundredths } from '@/lib/money'
import { matchMember, parsePaymentScreenshot, parseReceipt, type ParsedPayment, type ParsedReceipt } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { todayISO } from '@/lib/id'
import { GroupIcon } from '@/components/GroupIcon'
import { Loading, PageHeader, Segmented } from '@/components/Misc'
import { StartTableButton } from '@/components/StartTableButton'
import { useToast } from '@/components/Toast'

type Mode = 'receipt' | 'payment'

export default function Scan() {
  const data = useAllGroupData()
  const nav = useNavigate()
  const toast = useToast()
  const ocr = useOcr()
  const camRef = useRef<HTMLInputElement>(null)
  const libRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('receipt')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>()
  const [text, setText] = useState('')
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null)
  const [payment, setPayment] = useState<ParsedPayment | null>(null)
  const [params, setParams] = useSearchParams()

  // An image shared from another app (Android share target): the service worker parked it in Cache Storage.
  useEffect(() => {
    if (!params.get('shared') || !('caches' in window)) return
    setParams({}, { replace: true })
    ;(async () => {
      const cache = await caches.open('splitit-share')
      const res = await cache.match('/shared-image')
      if (!res) return
      await cache.delete('/shared-image')
      const blob = await res.blob()
      const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'shared.jpg')
      onFile(new File([blob], name, { type: blob.type || 'image/jpeg' }))
    })().catch((e) => toast('Couldn’t open the shared image: ' + (e as Error).message, 'err'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchMode = (m: Mode) => {
    setMode(m)
    // Keep the photo and re-read the text we already have instead of making the user pick it again.
    if (text && !ocr.busy) { setReceipt(m === 'receipt' ? parseReceipt(text) : null); setPayment(m === 'payment' ? parsePaymentScreenshot(text) : null) }
    else { setReceipt(null); setPayment(null); setFile(null); setPreview(undefined); setText('') }
  }

  const onFile = async (f: File) => {
    setFile(f); setPreview(URL.createObjectURL(f)); setReceipt(null); setPayment(null)
    try {
      const t = await ocr.run(f)
      setText(t)
      if (mode === 'receipt') setReceipt(parseReceipt(t))
      else setPayment(parsePaymentScreenshot(t))
    } catch (e) {
      toast('Could not read image: ' + (e as Error).message, 'err')
    }
  }

  // For payments, rank groups where the payee name matches a member.
  const groups = useMemo(() => {
    if (!data) return []
    const list = data.filter((d) => mode === 'receipt' || d.group.type !== 'personal')
    if (mode !== 'payment' || !payment?.payee) return list
    return [...list].sort((a, b) => {
      const ma = matchMember(payment.payee, Object.entries(a.group.members).map(([id, m]) => ({ id, name: m.name }))) ? 1 : 0
      const mb = matchMember(payment.payee, Object.entries(b.group.members).map(([id, m]) => ({ id, name: m.name }))) ? 1 : 0
      return mb - ma
    })
  }, [data, mode, payment])

  if (!data) return <Loading />
  const done = receipt || payment
  const cur = data[0]?.group.currency ?? defaultCurrency()

  const go = (groupId: string) => {
    if (!file) return
    if (receipt) { pending.receipt = { parsed: receipt, file }; nav(`/add?group=${groupId}`) }
    else if (payment) { pending.payment = { parsed: payment, file }; nav(`/groups/${groupId}/settle`) }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <PageHeader title="Smart scan" back subtitle="Read receipts and payment screenshots on your device" />
      <Segmented<Mode> value={mode} onChange={switchMode} options={[
        { value: 'receipt', label: <span className="inline-flex items-center gap-1.5"><Receipt size={16} /> Receipt</span> },
        { value: 'payment', label: <span className="inline-flex items-center gap-1.5"><Send size={16} /> Payment screenshot</span> },
      ]} />

      <div className="card mt-4 overflow-hidden">
        {preview ? (
          <div className="relative">
            <img src={preview} alt="Selected" className="max-h-80 w-full object-contain bg-slate-100 dark:bg-ink-800" />
            {ocr.busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white backdrop-blur-sm">
                <div className="text-sm font-semibold">Reading… {Math.round(ocr.progress * 100)}%</div>
                <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-white transition-all" style={{ width: `${ocr.progress * 100}%` }} /></div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-duo-500 text-3xl text-white shadow-lg">{mode === 'receipt' ? '🧾' : '📲'}</div>
            <div className="font-bold">{mode === 'receipt' ? 'Snap a receipt' : 'Upload a payment confirmation'}</div>
            <p className="mt-1 text-sm text-slate-500">{mode === 'receipt' ? 'We’ll pull out the total, merchant, date and line items for an itemized split.' : 'A GPay, PhonePe, Paytm, bank or PayPal screenshot — we’ll detect the amount and who you paid.'}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 p-3">
          <button className="btn-primary" onClick={() => camRef.current?.click()} disabled={ocr.busy}><Camera size={18} /> Camera</button>
          <button className="btn-secondary" onClick={() => libRef.current?.click()} disabled={ocr.busy}><ImageUp size={18} /> Photos</button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
        <input ref={libRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      </div>

      {receipt && (
        <div className="card mt-4 p-4">
          <div className="label">What we found</div>
          <Row k="Merchant" v={receipt.merchant ?? '—'} />
          <Row k="Total" v={receipt.total ? formatMoney(fromHundredths(receipt.total, cur), cur) : 'not found'} />
          <Row k="Date" v={receipt.date ?? 'not found'} />
          <Row k="Line items" v={String(receipt.items.length)} />
          {receipt.items.length > 0 && (
            <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-xl bg-slate-50 p-2 text-sm dark:bg-ink-800">
              {receipt.items.map((it, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate">{it.name}</span><span className="tabular-nums">{formatMoney(fromHundredths(it.amount, cur), cur)}</span></div>)}
            </div>
          )}
          {receipt.items.length > 0 && (
            <StartTableButton className="mt-3" draft={() => ({
              merchant: receipt.merchant ?? 'Bill', currency: cur, date: receipt.date ?? todayISO(),
              items: receipt.items.map((it) => ({ name: it.name, amount: fromHundredths(it.amount, cur) })),
              total: receipt.total ? fromHundredths(receipt.total, cur) : undefined,
            })} />
          )}
        </div>
      )}
      {payment && (
        <div className="card mt-4 p-4">
          <div className="label">What we found</div>
          <Row k="Amount" v={payment.amount ? formatMoney(fromHundredths(payment.amount, cur), cur) : 'not found'} />
          <Row k="Paid to" v={payment.payee ?? 'not found'} />
          <Row k="Method" v={payment.method ?? '—'} />
          <Row k="Date" v={payment.date ?? '—'} />
        </div>
      )}
      {text && (
        <details className="mt-2 px-1 text-xs text-slate-500">
          <summary className="cursor-pointer">Show raw text</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-100 p-3 font-mono dark:bg-ink-800">{text}</pre>
        </details>
      )}

      {done && (
        <div className="mt-4">
          <div className="mb-2 px-1 text-sm font-semibold text-slate-500">{receipt ? 'Add to which group?' : 'Record payment in which group?'}</div>
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {groups.map((d) => (
              <button key={d.group.id} onClick={() => go(d.group.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-ink-800">
                <GroupIcon emoji={d.group.emoji} size={40} />
                <span className="flex-1 font-semibold">{d.group.name}</span>
                <span className="text-sm text-brand-600 dark:text-brand-300">Continue →</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-6 text-center text-xs text-slate-400">Images are processed on your device. Nothing is uploaded until you save an expense.</p>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-1 text-sm"><span className="text-slate-500">{k}</span><span className="font-semibold">{v}</span></div>
}
