import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ImageUp, Plus, QrCode, Trash2, Users } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useGroups } from '@/hooks/data'
import { useReceiptReader } from '@/hooks/useReceiptReader'
import { CURRENCIES, centsToInput, formatMoney, fromHundredths, parseMoney } from '@/lib/money'
import type { ParsedReceipt } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { todayISO, uid } from '@/lib/id'
import { appLocale, defaultCurrency } from '@/lib/locale'
import { draftToTable, receiptExtras } from '@/lib/table'
import { AiScanToggle } from '@/components/AiScanToggle'
import { DateField } from '@/components/DateField'
import { GroupIcon } from '@/components/GroupIcon'
import { Loading, PageHeader, Spinner } from '@/components/Misc'
import { errText } from '@/lib/errors'
import { titleCase } from '@/lib/expense-draft'
import { currencyOptions, Select } from '@/components/Select'
import { useToast } from '@/components/Toast'
import { usePageTitle } from '@/lib/brand'
import { DuplicatePrompt, RecentScans, useScanHistory } from '@/components/ScanHistory'
import { entryFile, type ScanEntry, type ScanKind, type ScanMatch, type ScanPrint } from '@/lib/scanHistory'

interface Row {
  id: string
  name: string
  amount: string
}
type ExtraKey = 'tax' | 'tip' | 'discount'

const NO_GROUP = ''
const blank = (): Row => ({ id: uid('r_'), name: '', amount: '' })

/**
 * "Split by items": scan or type the bill, check the items, then open a live table. Everyone at
 * the table scans the QR and taps what they had, no app or account needed (src/pages/Table.tsx).
 */
export default function SplitBill() {
  usePageTitle('Split by items')
  const groups = useGroups()
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const ocr = useReceiptReader()
  const [params] = useSearchParams()
  const camRef = useRef<HTMLInputElement>(null)
  const libRef = useRef<HTMLInputElement>(null)

  const [groupId, setGroupId] = useState(params.get('group') ?? NO_GROUP)
  const [cur, setCur] = useState(profile.currency || defaultCurrency())
  const [merchant, setMerchant] = useState('')
  const [date, setDate] = useState(todayISO())
  const [rows, setRows] = useState<Row[]>([blank()])
  const [extras, setExtras] = useState<Record<ExtraKey, string>>({ tax: '', tip: '', discount: '' })
  const [printed, setPrinted] = useState<number>()
  const [preview, setPreview] = useState<string>()
  const [busy, setBusy] = useState(false)
  // History: bills also match receipts read in Smart scan (same kind of result).
  const hist = useScanHistory('bill', ['receipt'])
  const [dup, setDup] = useState<{ match: ScanMatch; file: File; prints: ScanPrint[] } | null>(null)
  const [scanRef, setScanRef] = useState<{ id: string; kind: ScanKind }>()

  const usable = useMemo(() => (groups ?? []).filter((g) => g.type !== 'personal'), [groups])
  const group = usable.find((g) => g.id === groupId)
  // A table finishes into a group in the group's currency.
  useEffect(() => {
    if (group) setCur(group.currency)
  }, [group])

  const apply = (parsed: ParsedReceipt) => {
    // The AI reader names the bill's currency; follow it unless a group fixes the currency.
    const c = !group && parsed.currency && CURRENCIES.includes(parsed.currency) ? parsed.currency : cur
    if (c !== cur) setCur(c)
    const items = parsed.items.map((it) => ({ name: it.name, amount: fromHundredths(it.amount, c) }))
    const h = (v?: number) => (v ? fromHundredths(v, c) : undefined)
    const total = h(parsed.total)
    const ex = receiptExtras(
      items.map((i) => i.amount),
      { total, tax: h(parsed.tax), tip: h(parsed.tip), discount: h(parsed.discount) },
    )
    if (parsed.merchant) setMerchant(titleCase(parsed.merchant))
    if (parsed.date) setDate(parsed.date)
    setPrinted(total)
    if (items.length) setRows(items.map((it) => ({ id: uid('r_'), name: it.name, amount: centsToInput(it.amount, c) })))
    else if (total) setRows([{ id: uid('r_'), name: parsed.merchant ? titleCase(parsed.merchant) : 'Bill', amount: centsToInput(total, c) }])
    setExtras({
      tax: ex.tax ? centsToInput(ex.tax, c) : '',
      tip: ex.tip ? centsToInput(ex.tip, c) : '',
      discount: ex.discount ? centsToInput(ex.discount, c) : '',
    })
    toast(
      items.length
        ? `Found ${items.length} item${items.length === 1 ? '' : 's'} — check them below`
        : total
          ? 'Couldn’t read the items — add them below'
          : 'Couldn’t read this bill — add the items below',
      items.length ? 'ok' : 'err',
    )
  }

  // A receipt handed over from Smart scan or the expense form.
  useEffect(() => {
    const p = pending.receipt
    if (!p) return
    pending.receipt = undefined
    setPreview(URL.createObjectURL(p.file))
    apply(p.parsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFile = async (f: File) => {
    setPreview(URL.createObjectURL(f))
    setDup(null)
    setScanRef(undefined)
    const { prints, match } = await hist.check([f])
    if (match) {
      setDup({ match, file: f, prints })
      return
    }
    await read(f, prints)
  }

  /** An earlier scan's result, straight away (no AI call, no OCR). */
  const openEntry = (e: ScanEntry, f?: File) => {
    setDup(null)
    if (e.result.type !== 'receipt') return
    setPreview(URL.createObjectURL(f ?? entryFile(e)))
    setScanRef({ id: e.id, kind: e.kind })
    apply(e.result.receipt)
  }

  const read = async (f: File, prints: ScanPrint[]) => {
    try {
      const r = await ocr.read(f)
      apply(r.parsed)
      // The fallback worked; whether AI is on is an admin / quota matter, not an error.
      if (r.fellBack) toast('Read on this phone (AI isn’t available right now)')
      if (r.parsed.merchant || r.parsed.total || r.parsed.items.length) {
        const id = await hist.save([f], prints, { type: 'receipt', receipt: r.parsed })
        if (id) setScanRef({ id, kind: 'bill' })
      }
    } catch (e) {
      toast(`Couldn’t read the image: ${errText(e)}`, 'err')
    }
  }

  const money = (s: string) => (s.trim() ? parseMoney(s, cur) : 0)
  const items = rows.map((r) => ({ name: r.name, amount: money(r.amount) }))
  const itemsSum = items.reduce((s, i) => s + (Number.isFinite(i.amount) ? i.amount : 0), 0)
  const ex = { tax: money(extras.tax), tip: money(extras.tip), discount: money(extras.discount) }
  const exOk = Object.values(ex).every((v) => Number.isFinite(v) && v >= 0)
  const total = itemsSum + (exOk ? ex.tax + ex.tip - ex.discount : 0)
  const filled = items.filter((i) => Number.isFinite(i.amount) && i.amount > 0)
  const gap = printed && filled.length ? printed - total : 0

  const start = async () => {
    if (items.some((i) => !Number.isFinite(i.amount) || i.amount < 0)) return toast('Check the item amounts', 'err')
    if (!filled.length) return toast('Add at least one item with a price', 'err')
    if (!exOk) return toast('Check tax, tip and discount', 'err')
    if (total <= 0) return toast('The bill total must be above zero', 'err')
    setBusy(true)
    try {
      const code = await repo.createTable(
        draftToTable(
          { merchant: merchant || 'Bill', currency: cur, date, items: filled, extras: ex, groupId: group?.id },
          { uid: user.uid, name: profile.displayName, payment: profile.payment },
        ),
      )
      if (scanRef) hist.outcome(scanRef.id, { label: `Table${group ? ` in ${group.name}` : ''}`, href: `/t/${code}` }, scanRef.kind)
      nav(`/t/${code}`, { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(false)
    }
  }

  if (!groups) return <Loading />
  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-40">
      <PageHeader title="Split by items" back subtitle="Everyone taps what they had" />

      {/* Scan */}
      <div className="card overflow-hidden">
        {preview ? (
          <div className="relative">
            <img src={preview} alt="Receipt" className="max-h-56 w-full bg-slate-100 object-contain dark:bg-ink-800" />
            {ocr.busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white backdrop-blur-sm">
                <div className="text-sm font-semibold">{ocr.label}</div>
                <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/20">
                  {ocr.stage === 'ai' ? (
                    <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-white" />
                  ) : (
                    <div className="h-full bg-white transition-all" style={{ width: `${ocr.progress * 100}%` }} />
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4 p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-duo-500 text-2xl text-white shadow-lg">
              🧾
            </div>
            <div className="min-w-0">
              <div className="font-bold">Scan the bill</div>
              <p className="text-sm text-muted">We’ll pull out the items, taxes and total. Or type them in below.</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 p-3 pt-0">
          <button type="button" className="btn-primary" onClick={() => camRef.current?.click()} disabled={ocr.busy}>
            <Camera size={18} aria-hidden /> {preview ? 'Rescan' : 'Camera'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => libRef.current?.click()} disabled={ocr.busy}>
            <ImageUp size={18} aria-hidden /> Photos
          </button>
        </div>
        <AiScanToggle className="px-4 pb-3" />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onFile(f)
          }}
        />
        <input
          ref={libRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onFile(f)
          }}
        />
      </div>
      {dup && (
        <DuplicatePrompt
          className="!mt-3"
          match={dup.match}
          currency={cur}
          onOpen={() => openEntry(dup.match.entry, dup.file)}
          onRescan={() => {
            const d = dup
            setDup(null)
            read(d.file, d.prints)
          }}
        />
      )}
      {!preview && (
        <RecentScans
          className="!mt-3"
          entries={hist.entries}
          currency={cur}
          onOpen={(e) => openEntry(e)}
          onDelete={(e) => hist.remove(e.id)}
          onClear={hist.clear}
        />
      )}

      {/* Details */}
      <div className="card mt-3 space-y-3 p-4">
        <div>
          <label className="label" htmlFor="bill-place">
            Place
          </label>
          <input id="bill-place" className="input" placeholder="e.g. Toit, Indiranagar" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className="label">Date</div>
            <DateField aria-label="Date" value={date} onChange={(v) => setDate(v || todayISO())} />
          </div>
          <div className="min-w-0">
            <div className="label">Currency</div>
            <Select
              aria-label="Currency"
              value={cur}
              disabled={!!group}
              onChange={setCur}
              options={currencyOptions([cur, profile.currency, ...CURRENCIES], appLocale())}
            />
          </div>
        </div>
        <div>
          <div className="label">Group</div>
          <Select
            aria-label="Group"
            value={groupId}
            onChange={setGroupId}
            options={[
              {
                value: NO_GROUP,
                text: 'Decide at the end',
                label: 'Decide at the end',
                hint: 'Make a group with everyone at the table, or pick one',
                icon: (
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-base dark:bg-ink-700">
                    <Users size={15} />
                  </span>
                ),
              },
              ...usable.map((g) => ({ value: g.id, text: g.name, label: g.name, hint: g.currency, icon: <GroupIcon emoji={g.emoji} size={28} /> })),
            ]}
          />
        </div>
      </div>

      {/* Items */}
      <div className="card mt-3 p-4">
        <div className="label">Items</div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className="flex gap-2">
              <input
                className="input !py-2"
                placeholder={`Item ${i + 1}`}
                aria-label={`Item ${i + 1} name`}
                value={r.name}
                onChange={(e) => setRow(r.id, { name: e.target.value })}
              />
              <input
                className="input !w-28 shrink-0 !py-2 text-right tabular-nums"
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`Item ${i + 1} amount`}
                value={r.amount}
                onChange={(e) => setRow(r.id, { amount: e.target.value })}
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-rose-600 disabled:opacity-30"
                disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                aria-label={`Remove item ${i + 1}`}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary mt-3 w-full !min-h-0 !py-2.5 text-sm" onClick={() => setRows([...rows, blank()])}>
          <Plus size={16} /> Add item
        </button>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
          {(['tax', 'tip', 'discount'] as const).map((k) => (
            <label key={k} className="block min-w-0">
              <span className="label">{k === 'tax' ? 'Tax / fees' : k === 'tip' ? 'Tip' : 'Discount'}</span>
              <input
                className="input !py-2 text-right tabular-nums"
                inputMode="decimal"
                placeholder="0.00"
                value={extras[k]}
                onChange={(e) => setExtras({ ...extras, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Tax, tip and discounts are shared in proportion to what each person had.</p>

        <div className="mt-3 space-y-1 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800">
          <div className="flex justify-between text-muted">
            <span>Items</span>
            <span className="tabular-nums">{formatMoney(itemsSum, cur)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="tabular-nums" data-testid="bill-total">
              {formatMoney(total, cur)}
            </span>
          </div>
          {printed !== undefined && gap !== 0 && (
            <div className="flex items-center justify-between gap-2 pt-1 text-amber-700 dark:text-amber-300">
              <span>
                Bill says {formatMoney(printed, cur)} ({formatMoney(gap, cur, { sign: true })})
              </span>
              <button
                type="button"
                className="shrink-0 font-semibold underline"
                onClick={() => {
                  const tax = Math.max(0, (ex.tax || 0) + gap)
                  setExtras({ ...extras, tax: tax ? centsToInput(tax, cur) : '' })
                }}
              >
                Fix with tax
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 px-1 text-center text-xs text-muted">
        Next, friends scan your QR code and tap what they had. No app or account needed, and you can still edit the bill while it’s live.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/90 backdrop-blur-xl safe-bottom dark:border-white/5 dark:bg-ink-900/90">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">
              {filled.length} item{filled.length === 1 ? '' : 's'}
            </div>
            <div className="text-2xl font-extrabold tabular-nums">{formatMoney(total, cur)}</div>
          </div>
          <button type="button" className="btn-primary" onClick={start} disabled={busy || ocr.busy} data-testid="start-table">
            {busy ? <Spinner className="!h-4 !w-4" /> : <QrCode size={18} />} Start table
          </button>
        </div>
      </div>
    </div>
  )
}
