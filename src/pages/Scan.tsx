import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ImageUp, QrCode } from 'lucide-react'
import { useAllGroupData } from '@/hooks/data'
import { useOcr } from '@/hooks/useOcr'
import { useReceiptReader } from '@/hooks/useReceiptReader'
import { defaultCurrency } from '@/lib/locale'
import { formatMoney, fromHundredths } from '@/lib/money'
import { matchMember, parsePaymentScreenshot, parseReceipt, type ParsedPayment, type ParsedReceipt } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { GroupIcon } from '@/components/GroupIcon'
import { AiScanToggle } from '@/components/AiScanToggle'
import { StatementImport } from '@/components/StatementImport'
import { DuplicatePrompt, RecentScans, useScanHistory } from '@/components/ScanHistory'
import { entryFile, type ScanEntry, type ScanKind, type ScanMatch, type ScanPrint } from '@/lib/scanHistory'
import { Loading, PageHeader, Segmented } from '@/components/Misc'
import { useToast } from '@/components/Toast'

type Mode = 'receipt' | 'statement' | 'payment'

export default function Scan() {
  const data = useAllGroupData()
  const nav = useNavigate()
  const toast = useToast()
  const ocr = useOcr()
  const reader = useReceiptReader()
  const camRef = useRef<HTMLInputElement>(null)
  const libRef = useRef<HTMLInputElement>(null)
  const [params0] = useSearchParams()
  const [mode, setMode] = useState<Mode>(() => (['receipt', 'statement', 'payment'] as const).find((m) => m === params0.get('mode')) ?? 'receipt')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>()
  const [text, setText] = useState('')
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null)
  const [payment, setPayment] = useState<ParsedPayment | null>(null)
  const [params, setParams] = useSearchParams()
  // History: receipts also match bills scanned on Split by items (same kind of result).
  const receiptHist = useScanHistory('receipt', ['bill'])
  const paymentHist = useScanHistory('payment')
  const hist = mode === 'payment' ? paymentHist : receiptHist
  /** a picked image that matches an earlier scan: offer that result before reading it again */
  const [dup, setDup] = useState<{ match: ScanMatch; file: File; prints: ScanPrint[] } | null>(null)
  /** the history entry behind the result on screen, to note what it led to */
  const [scanRef, setScanRef] = useState<{ id: string; kind: ScanKind }>()

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
    setScanRef(undefined)
    if (dup) { setDup(null); setFile(null); setPreview(undefined); setText(''); setReceipt(null); setPayment(null); return }
    if (m === 'statement') return
    // Keep the photo and re-read the text we already have instead of making the user pick it again.
    if (text && !ocr.busy) { setReceipt(m === 'receipt' ? parseReceipt(text) : null); setPayment(m === 'payment' ? parsePaymentScreenshot(text) : null) }
    else { setReceipt(null); setPayment(null); setFile(null); setPreview(undefined); setText('') }
  }

  const onFile = async (f: File) => {
    setFile(f); setPreview(URL.createObjectURL(f)); setReceipt(null); setPayment(null); setDup(null); setScanRef(undefined)
    const { prints, match } = await hist.check([f])
    if (match) { setDup({ match, file: f, prints }); return }
    await read(f, prints)
  }

  const read = async (f: File, prints: ScanPrint[]) => {
    try {
      if (mode === 'receipt') {
        const r = await reader.read(f)
        setText('')
        setReceipt(r.parsed)
        if (r.fellBack) toast('AI isn’t available, so this was read on the phone. Set it up in Profile → AI features.', 'err')
        if (r.parsed.merchant || r.parsed.total || r.parsed.items.length) {
          const id = await receiptHist.save([f], prints, { type: 'receipt', receipt: r.parsed })
          if (id) setScanRef({ id, kind: 'receipt' })
        }
        return
      }
      const t = await ocr.run(f)
      const p = parsePaymentScreenshot(t)
      setText(t)
      setPayment(p)
      if (p.amount || p.payee) {
        const id = await paymentHist.save([f], prints, { type: 'payment', payment: p, text: t })
        if (id) setScanRef({ id, kind: 'payment' })
      }
    } catch (e) {
      toast('Could not read image: ' + (e as Error).message, 'err')
    }
  }

  /** Show an earlier scan's result straight away: no AI call, no OCR. `f` is a fresh pick of the same image. */
  const openEntry = (e: ScanEntry, f?: File) => {
    const img = f ?? entryFile(e)
    setDup(null)
    setFile(img); setPreview(URL.createObjectURL(img))
    setScanRef({ id: e.id, kind: e.kind })
    if (e.result.type === 'receipt') { setReceipt(e.result.receipt); setPayment(null); setText('') }
    else if (e.result.type === 'payment') { setPayment(e.result.payment); setReceipt(null); setText(e.result.text ?? '') }
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
    const name = data.find((d) => d.group.id === groupId)?.group.name ?? 'a group'
    if (scanRef) hist.outcome(scanRef.id, { label: receipt ? `Used in ${name}` : `Payment in ${name}`, href: `/groups/${groupId}` }, scanRef.kind)
    if (receipt) { pending.receipt = { parsed: receipt, file, history: scanRef }; nav(`/add?group=${groupId}`) }
    else if (payment) { pending.payment = { parsed: payment, file }; nav(`/groups/${groupId}/settle`) }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <PageHeader title="Smart scan" back subtitle="Bills, statements and payment screenshots" />
      <Segmented<Mode> value={mode} onChange={switchMode} options={[
        { value: 'receipt', label: 'Receipt' },
        { value: 'statement', label: 'Statement' },
        { value: 'payment', label: 'Payment' },
      ]} />
      {mode === 'statement' ? <StatementImport /> : <>

      <div className="card mt-4 overflow-hidden">
        {preview ? (
          <div className="relative">
            <img src={preview} alt="Selected" className="max-h-80 w-full object-contain bg-slate-100 dark:bg-ink-800" />
            {(ocr.busy || reader.busy) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white backdrop-blur-sm">
                <div className="text-sm font-semibold">{reader.busy ? reader.label : `Reading… ${Math.round(ocr.progress * 100)}%`}</div>
                <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/20">
                  {reader.stage === 'ai' ? <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-white" /> : <div className="h-full bg-white transition-all" style={{ width: `${(reader.busy ? reader.progress : ocr.progress) * 100}%` }} />}
                </div>
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
          <button className="btn-primary" onClick={() => camRef.current?.click()} disabled={ocr.busy || reader.busy}><Camera size={18} /> Camera</button>
          <button className="btn-secondary" onClick={() => libRef.current?.click()} disabled={ocr.busy || reader.busy}><ImageUp size={18} /> Photos</button>
        </div>
        {mode === 'receipt' && <AiScanToggle className="px-4 pb-3" />}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
        <input ref={libRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      </div>

      {dup && <DuplicatePrompt match={dup.match} currency={cur} onOpen={() => openEntry(dup.match.entry, dup.file)} onRescan={() => { const d = dup; setDup(null); read(d.file, d.prints) }} />}
      {!done && !dup && !ocr.busy && !reader.busy && (
        <RecentScans entries={hist.entries} currency={cur} onOpen={(e) => openEntry(e)}
          onDelete={(e) => { hist.remove(e.id); if (scanRef?.id === e.id) setScanRef(undefined) }}
          onClear={() => { hist.clear(); setScanRef(undefined) }} />
      )}

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
          {receipt.items.length > 0 && file && (
            <button className="btn-primary mt-3 w-full" onClick={() => { if (scanRef) hist.outcome(scanRef.id, { label: 'Split by items' }, scanRef.kind); pending.receipt = { parsed: receipt, file }; nav('/split') }} data-testid="scan-split-items">
              <QrCode size={18} /> Split by items
            </button>
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
          <div className="mb-2 px-1 text-sm font-semibold text-slate-500">{receipt ? (receipt.items.length ? 'Or add it as one expense to' : 'Add to which group?') : 'Record payment in which group?'}</div>
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
      <p className="mt-6 text-center text-xs text-slate-400">Nothing is added until you pick a group. Recent scans stay on this device.</p>
      </>}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-1 text-sm"><span className="text-slate-500">{k}</span><span className="font-semibold">{v}</span></div>
}
