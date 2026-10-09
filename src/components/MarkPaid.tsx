import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCheck, Loader2, X } from 'lucide-react'
import { repo } from '@/data'
import { errText } from '@/lib/errors'
import { imagePreviewUrl, isImageType } from '@/lib/image'
import { formatMoney } from '@/lib/money'
import { settleMethods } from '@/lib/payments'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'

/**
 * "I've paid" on a Pay me link (and on a closed live table): the payer says how they paid and may
 * add the payment screenshot, then the link flips to paid. In Firebase the server records the
 * payment in the group and tells the payee; the payee can delete it there if it isn't right.
 */
export function MarkPaid({
  code,
  payee,
  amount,
  currency,
  groupName,
  onDone,
}: {
  code: string
  /** first name of the person being paid */
  payee: string
  amount: number
  currency: string
  /** where the payment gets recorded, when the link belongs to a group */
  groupName?: string
  onDone?: () => void
}) {
  const toast = useToast()
  const methods = settleMethods(currency)
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState(methods[0])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>()
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const url = file ? imagePreviewUrl(file) : undefined
    setPreview(url)
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await repo.markPayLinkPaid(code, { method }, file ?? undefined)
      setOpen(false)
      toast(`Marked paid. ${payee} can see it now.`)
      onDone?.()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const money = formatMoney(amount, currency)
  return (
    <>
      <button type="button" className="btn-primary w-full" onClick={() => setOpen(true)} data-testid="mark-paid">
        <CheckCheck size={18} aria-hidden /> I’ve paid
      </button>
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title={`Did you pay ${money}?`}>
        <div className="space-y-4">
          <p className="text-muted text-sm">
            {payee} sees it straight away{groupName ? ` and it’s recorded as a payment in ${groupName}` : ''}. Only tap this once the money has gone.
          </p>
          <div>
            <div className="label" id="mark-paid-method">
              How did you pay?
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="mark-paid-method">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={m === method}
                  onClick={() => setMethod(m)}
                  className={`chip min-h-10 ${m === method ? 'chip-on' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Payment screenshot (optional)</div>
            {preview ? (
              <div className="relative inline-block">
                <img src={preview} alt="Your payment screenshot" className="max-h-48 rounded-2xl ring-1 ring-slate-200 dark:ring-white/10" />
                <button
                  type="button"
                  className="absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/80 text-white"
                  onClick={() => setFile(null)}
                  aria-label="Remove the screenshot"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
            ) : (
              <button type="button" className="btn-secondary btn-sm w-full" onClick={() => input.current?.click()} data-testid="mark-paid-proof">
                <Camera size={16} aria-hidden /> Add a screenshot
              </button>
            )}
            <input
              ref={input}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                if (!isImageType(f.type)) return toast('That file isn’t a photo', 'err')
                setFile(f)
              }}
            />
          </div>
          <button type="button" className="btn-primary w-full" onClick={confirm} disabled={busy} aria-busy={busy || undefined} data-testid="mark-paid-confirm">
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <CheckCheck size={18} aria-hidden />} Mark {money} as paid
          </button>
        </div>
      </Sheet>
    </>
  )
}
