import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ImageUp, ListChecks, Plus, Smartphone, X } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { useAllGroupData } from '@/hooks/data'
import { OcrCancelled, useOcr } from '@/hooks/useOcr'
import { useReceiptReader } from '@/hooks/useReceiptReader'
import { usePageTitle } from '@/lib/brand'
import { aiScanEnabled, aiScanPossible, isQuietReason, unavailableText } from '@/lib/ai'
import { errText } from '@/lib/errors'
import { warmOcr } from '@/lib/ocr'
import { appLocale, formatDate } from '@/lib/locale'
import { CURRENCIES, formatMoney, fromHundredths } from '@/lib/money'
import { matchMember, parsePaymentScreenshot, parseReceipt, type ParsedPayment, type ParsedReceipt } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { GroupIcon } from '@/components/GroupIcon'
import { AiScanToggle } from '@/components/AiScanToggle'
import { StatementImport } from '@/components/StatementImport'
import { ListSkeleton } from '@/components/Skeleton'
import { PageHeader, Segmented } from '@/components/Misc'
import { Select, currencyOptions } from '@/components/Select'
import { useToast } from '@/components/Toast'

type Mode = 'receipt' | 'statement' | 'payment'

/** The AI reader declined the photo: nothing usable came back (the fallback reader may still manage). */
const looksEmpty = (r: ParsedReceipt) => !r.total && !r.merchant && r.items.length === 0

/** A quiet reason ("AI isn't set up / not for this account") is worth one mention per session, not one per scan. */
const QUIET_KEY = 'splitit-ai-quiet-told'
function tellOnce(text: string, toast: (t: string) => void) {
  try {
    if (sessionStorage.getItem(QUIET_KEY)) return
    sessionStorage.setItem(QUIET_KEY, '1')
  } catch { /* private mode: tell every time */ }
  toast(text)
}

export default function Scan() {
  usePageTitle('Scan')
  const { profile } = useMe()
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
  const [notABill, setNotABill] = useState(false)
  const [currency, setCurrency] = useState<string>()
  const [params, setParams] = useSearchParams()
  // Cancel: the read in flight finishes on its own, but its result is dropped and the overlay goes.
  const run = useRef(0)
  const [cancelled, setCancelled] = useState(false)

  // Get the on-device reader's ~3 MB core compiling while the user picks a photo, when that is the likely path.
  useEffect(() => { if (!aiScanEnabled() || !aiScanPossible()) warmOcr() }, [])

  // An image shared from another app (Android share target): the service worker parked it in Cache Storage.
  const [tooLarge, setTooLarge] = useState(false)
  useEffect(() => {
    const shared = params.get('shared')
    if (!shared) return
    setParams({}, { replace: true })
    // The service worker won't park images over 15 MB (Cache Storage quota on low-end phones).
    if (shared === 'toolarge') { setTooLarge(true); return }
    if (!('caches' in window)) return
    ;(async () => {
      const cache = await caches.open('splitit-share')
      const res = await cache.match('/shared-image')
      if (!res) return
      await cache.delete('/shared-image')
      const blob = await res.blob()
      const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'shared.jpg')
      onFile(new File([blob], name, { type: blob.type || 'image/jpeg' }))
    })().catch((e) => toast(errText(e, 'Couldn’t open the shared image'), 'err'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = () => { setReceipt(null); setPayment(null); setNotABill(false); setFile(null); setPreview(undefined); setText('') }
  const switchMode = (m: Mode) => {
    setMode(m)
    if (m === 'statement') return
    // Keep the photo and re-read the text we already have instead of making the user pick it again.
    if (text && !ocr.busy) { setReceipt(m === 'receipt' ? parseReceipt(text) : null); setPayment(m === 'payment' ? parsePaymentScreenshot(text) : null); setNotABill(false) }
    else reset()
  }

  const onFile = async (f: File) => {
    const id = ++run.current
    setCancelled(false)
    setFile(f); setPreview(URL.createObjectURL(f)); setReceipt(null); setPayment(null); setNotABill(false); setCurrency(undefined)
    try {
      if (mode === 'receipt') {
        const r = await reader.read(f)
        if (run.current !== id) return
        setText('')
        if (r.via === 'ai' && (r.notABill || looksEmpty(r.parsed))) { setNotABill(true); return }
        setReceipt(r.parsed)
        if (r.parsed.currency && CURRENCIES.includes(r.parsed.currency)) setCurrency(r.parsed.currency)
        // A successful on-phone read is not an error, whatever stopped the AI: a calm line, and
        // for "not set up for you" reasons only once per session.
        if (r.fellBack) { const line = unavailableText(r.reason); if (isQuietReason(r.reason)) tellOnce(line, toast); else toast(line) }
        return
      }
      const t = await ocr.run(f)
      if (run.current !== id) return
      setText(t)
      setPayment(parsePaymentScreenshot(t))
    } catch (e) {
      if (e instanceof OcrCancelled || run.current !== id) return
      toast(errText(e, 'Couldn’t read that image'), 'err')
    }
  }

  /** The "not a bill" escape hatch: the on-phone reader, which never declines. */
  const readOnPhone = async () => {
    if (!file) return
    const id = ++run.current
    setCancelled(false)
    setNotABill(false)
    try {
      const t = await ocr.run(file)
      if (run.current !== id) return
      setText(t)
      setReceipt(parseReceipt(t))
    } catch (e) {
      if (e instanceof OcrCancelled || run.current !== id) return
      toast(errText(e, 'Couldn’t read that image'), 'err')
    }
  }

  const cancel = () => {
    run.current++
    ocr.cancel()
    setCancelled(true)
    reset()
  }

  // For payments, rank groups where the payee name matches a member.
  const groups = useMemo(() => {
    if (!data) return []
    const list = data.filter((d) => !d.group.archived && (mode === 'receipt' || d.group.type !== 'personal'))
    if (mode !== 'payment' || !payment?.payee) return list
    return [...list].sort((a, b) => {
      const ma = matchMember(payment.payee, Object.entries(a.group.members).map(([id, m]) => ({ id, name: m.name }))) ? 1 : 0
      const mb = matchMember(payment.payee, Object.entries(b.group.members).map(([id, m]) => ({ id, name: m.name }))) ? 1 : 0
      return mb - ma
    })
  }, [data, mode, payment])

  const done = receipt || payment
  // The bill's own currency when the reader saw one, else the user's: never "whichever group is first".
  const cur = currency ?? profile.currency
  const busy = (ocr.busy || reader.busy) && !cancelled
  const progress = reader.busy ? reader.progress : ocr.progress
  const progressLabel = reader.busy ? reader.label : `Reading… ${Math.round(ocr.progress * 100)}%`

  const go = (groupId: string) => {
    if (!file) return
    if (receipt) { pending.receipt = { parsed: { ...receipt, currency: cur }, file }; nav(`/add?group=${groupId}`) }
    else if (payment) { pending.payment = { parsed: payment, file }; nav(`/groups/${groupId}/settle`) }
  }

  const fmt = (hundredths: number) => formatMoney(fromHundredths(hundredths, cur), cur)

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <PageHeader title="Scan" back subtitle="Bills, statements and payment screenshots" />
      <Segmented<Mode> label="What to scan" testId="scan-mode" value={mode} onChange={switchMode} options={[
        { value: 'receipt', label: 'Bill' },
        { value: 'statement', label: 'Statement' },
        { value: 'payment', label: 'Payment' },
      ]} />
      {mode === 'statement' ? <StatementImport /> : <>

      {tooLarge && (
        <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="status" data-testid="scan-too-large">
          That image is too big to share (15 MB max). Pick it from your photos instead.
        </p>
      )}
      <div className="card mt-4 overflow-hidden">
        {preview ? (
          <div className="relative">
            <img src={preview} alt="The bill you picked" className="max-h-80 w-full bg-slate-100 object-contain dark:bg-ink-800" />
            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white backdrop-blur-sm">
                <div className="text-sm font-semibold" aria-live="polite">{progressLabel}</div>
                <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="Reading the photo"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={reader.stage === 'ai' ? undefined : Math.round(progress * 100)} aria-valuetext={progressLabel}>
                  {reader.stage === 'ai' ? <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-white" /> : <div className="h-full bg-white transition-all" style={{ width: `${progress * 100}%` }} />}
                </div>
                <button type="button" className="btn btn-sm mt-4 bg-white/15 text-white ring-1 ring-white/30" onClick={cancel} data-testid="scan-cancel"><X size={16} aria-hidden /> Cancel</button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-duo-600 text-3xl text-white shadow-lg" aria-hidden>{mode === 'receipt' ? '🧾' : '📲'}</div>
            <h2 className="font-bold">{mode === 'receipt' ? 'Snap a bill' : 'Upload a payment confirmation'}</h2>
            <p className="text-muted mt-1 text-sm">{mode === 'receipt' ? 'We’ll pull out the total, merchant, date and line items for a split by items.' : 'A GPay, PhonePe, Paytm, bank or PayPal screenshot — we’ll detect the amount and who you paid.'}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 p-3">
          <button type="button" className="btn-primary" onClick={() => camRef.current?.click()} disabled={busy}><Camera size={18} aria-hidden /> Camera</button>
          <button type="button" className="btn-secondary" onClick={() => libRef.current?.click()} disabled={busy}><ImageUp size={18} aria-hidden /> Photos</button>
        </div>
        {mode === 'receipt' && <AiScanToggle className="px-4 pb-3" />}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
        <input ref={libRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      </div>

      {notABill && (
        <div className="card mt-4 p-4" role="status" data-testid="scan-not-a-bill">
          <div className="font-bold">That doesn’t look like a bill</div>
          <p className="text-muted mt-1 text-sm">Try a sharper, straighter photo, or read this one on your phone instead.</p>
          <button type="button" className="btn-secondary mt-3 w-full" onClick={readOnPhone} disabled={busy}><Smartphone size={18} aria-hidden /> Read on this phone instead</button>
        </div>
      )}

      {receipt && (
        <div className="card mt-4 p-4" data-testid="scan-receipt">
          <div className="label">What we found</div>
          <Row k="Merchant" v={receipt.merchant ?? '—'} />
          <div className="flex items-center justify-between gap-3 py-1 text-sm">
            <span className="text-muted">Total</span>
            <span className="flex items-center gap-2">
              <span className="font-semibold">{receipt.total ? fmt(receipt.total) : 'not found'}</span>
              <span className="w-24"><Select size="sm" aria-label="Currency of the bill" value={cur} onChange={setCurrency} options={currencyOptions(CURRENCIES, appLocale())} /></span>
            </span>
          </div>
          {receipt.date && <Row k="Date" v={formatDate(receipt.date)} />}
          {receipt.items.length > 0 ? <Row k="Line items" v={String(receipt.items.length)} /> : null}
          {!receipt.total && receipt.items.length === 0 && <p className="text-muted mt-1 text-xs">Couldn’t read the total — you can type it on the next screen.</p>}
          {receipt.items.length > 0 && (
            <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-xl bg-slate-50 p-2 text-sm dark:bg-ink-800">
              {receipt.items.map((it, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate">{it.name}</span><span className="tabular-nums">{fmt(it.amount)}</span></div>)}
            </div>
          )}
          {receipt.items.length > 0 && file && (
            <button type="button" className="btn-primary mt-3 w-full" onClick={() => { pending.receipt = { parsed: { ...receipt, currency: cur }, file }; nav('/split') }} data-testid="scan-split-items">
              <ListChecks size={18} aria-hidden /> Split by items
            </button>
          )}
        </div>
      )}
      {payment && (
        <div className="card mt-4 p-4" data-testid="scan-payment">
          <div className="label">What we found</div>
          <Row k="Amount" v={payment.amount ? fmt(payment.amount) : 'not found'} />
          <Row k="Paid to" v={payment.payee ?? 'not found'} />
          <Row k="Method" v={payment.method ?? '—'} />
          <Row k="Date" v={payment.date ? formatDate(payment.date) : '—'} />
        </div>
      )}
      {text && (
        <details className="text-muted mt-2 px-1 text-xs">
          <summary className="cursor-pointer">Show raw text</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-100 p-3 font-mono dark:bg-ink-800">{text}</pre>
        </details>
      )}

      {done && (
        <div className="mt-4">
          <h2 className="text-muted mb-2 px-1 text-sm font-semibold">{receipt ? (receipt.items.length ? 'Or add it as one expense to' : 'Add to which group?') : 'Record the payment in which group?'}</h2>
          {!data ? <ListSkeleton rows={2} /> : groups.length === 0 ? (
            <div className="card p-4 text-center">
              <p className="text-muted text-sm">You don’t have a group yet.</p>
              <Link to="/groups/new?next=add" className="btn-primary mt-3 w-full"><Plus size={18} aria-hidden /> Create a group first</Link>
            </div>
          ) : (
            <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
              {groups.map((d) => (
                <button key={d.group.id} type="button" onClick={() => go(d.group.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-ink-800">
                  <GroupIcon emoji={d.group.emoji} size={40} />
                  <span className="flex-1 font-semibold">{d.group.name}</span>
                  <span className="text-sm text-brand-600 dark:text-brand-300">Continue →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-muted mt-6 text-center text-xs">Nothing is saved until you add an expense.</p>
      </>}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-1 text-sm"><span className="text-muted">{k}</span><span className="font-semibold">{v}</span></div>
}
