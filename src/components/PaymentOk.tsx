import { useState } from 'react'
import { CheckCheck, Clock, Flag, Image as ImageIcon } from 'lucide-react'
import { repo } from '@/data'
import type { Settlement } from '@/types'
import type { PaymentState } from '@/lib/trust'
import { errText } from '@/lib/errors'
import { Sheet } from './Sheet'
import { useToast } from './Toast'

/*
 * Payments need the recipient's OK (shared/payment-ok.ts): the pill on a payment, the
 * recipient's two answers, and the screenshot the payer attached.
 */

const PILLS = {
  'needs-ok': {
    icon: Clock,
    text: 'Needs OK',
    title: 'Not counted until the person paid confirms it',
    tone: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  },
  flagged: {
    icon: Flag,
    text: 'Not received',
    title: 'The person paid says it hasn’t arrived; not counted until they confirm it',
    tone: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  matched: {
    icon: CheckCheck,
    text: 'Screenshot matched',
    title: 'Counted: the payment screenshot matched. The person paid can still say it hasn’t arrived.',
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
} as const

/** The state of a payment that needs an OK. The icon and the words carry it, never the colour alone. */
export function PaymentPill({ state }: { state: PaymentState }) {
  if (!state.pill) return null
  const p = PILLS[state.pill]
  const Icon = p.icon
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold ${p.tone}`}
      title={p.title}
      data-testid={`payment-pill-${state.pill}`}
    >
      <Icon size={10} strokeWidth={3} aria-hidden />
      {p.text}
    </span>
  )
}

/** Confirm, or "Not received", for the recipient; both say what changes. */
export function usePaymentAnswers() {
  const toast = useToast()
  return {
    confirm: (s: Settlement) =>
      repo
        .confirmPayment(s.groupId, s.id)
        .then(() => toast('Confirmed. The payment counts now.'))
        .catch((e) => toast(errText(e), 'err')),
    notReceived: (s: Settlement) =>
      repo
        .flagPayment(s.groupId, s.id, 'Not received')
        .then(() =>
          toast('Marked as not received. It doesn’t count until you confirm it.', 'ok', {
            action: { label: 'Undo', run: () => void repo.confirmPayment(s.groupId, s.id).catch((e) => toast(errText(e), 'err')) },
          }),
        )
        .catch((e) => toast(errText(e), 'err')),
  }
}

/** Shows the payment screenshot in a sheet (a fresh URL each time; it isn't kept in the list). */
export function ProofButton({ s, className = '' }: { s: Settlement; className?: string }) {
  const toast = useToast()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!s.proofPath) return null
  return (
    <>
      <button
        type="button"
        className={`inline-flex min-h-6 items-center gap-1 font-semibold text-brand-600 underline dark:text-brand-300 ${className}`}
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={async () => {
          setBusy(true)
          const u = await repo.settleProofUrl(s)
          setBusy(false)
          if (u) setUrl(u)
          else toast('The screenshot isn’t available', 'err')
        }}
        data-testid="payment-proof"
      >
        <ImageIcon size={12} aria-hidden /> Screenshot
      </button>
      <Sheet open={!!url} onClose={() => setUrl(null)} title="Payment screenshot" testId="payment-proof-sheet">
        {url && <img src={url} alt="Payment screenshot attached by the payer" className="mx-auto max-h-[70vh] rounded-xl object-contain" />}
      </Sheet>
    </>
  )
}
