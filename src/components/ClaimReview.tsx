import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { repo } from '@/data'
import { errText } from '@/lib/errors'
import { formatDate } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import type { PayLink } from '@/lib/paylinks'
import { firstName } from '@/lib/share-card'
import { useToast } from '@/components/Toast'

/** The payment screenshot on a link, for the payee (Storage URL, or a data: URL in demo mode). */
export function useProofUrl(path: string | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null>()
  useEffect(() => {
    setUrl(undefined)
    if (!path) return
    let live = true
    repo
      .payProofUrl(path)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null))
    return () => {
      live = false
    }
  }, [path])
  return url
}

/**
 * A live table guest said they paid on a link the host confirms (status 'claimed'): who, how
 * much, how, the screenshot, and Confirm (→ paid, recorded in the group) or Dismiss (→ open
 * again, they can pay and say so again). Shown on the host's table, on the group and on /r/.
 */
export function ClaimReview({ link, compact = false, onDone }: { link: PayLink; compact?: boolean; onDone?: () => void }) {
  const toast = useToast()
  const proof = useProofUrl(link.proofPath)
  const [busy, setBusy] = useState(false)
  const payer = firstName(link.payerName)
  const money = formatMoney(link.amount, link.currency)
  const act = async (confirm: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      await (confirm ? repo.confirmPayLinkClaim(link.code) : repo.dismissPayLinkClaim(link.code))
      toast(
        confirm ? `Confirmed. ${payer}’s ${money} is recorded${link.groupId ? ` in ${link.groupName}` : ''}.` : `Dismissed. ${payer} can mark it paid again.`,
      )
      onDone?.()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="text-left" data-testid="claim-review">
      <p className="text-sm">
        <b>{payer}</b> says they’ve paid <b className="tabular-nums">{money}</b>
        {link.method ? ` by ${link.method}` : ''}
        {link.paidAt ? ` · ${formatDate(link.paidAt)}` : ''}.
      </p>
      {!compact && <p className="text-muted mt-1 text-xs">It counts once you confirm it. Check your UPI or bank app first.</p>}
      {link.proofPath && (
        <div className="mt-3">
          {proof ? (
            <a href={proof} target="_blank" rel="noreferrer" className="inline-block">
              <img
                src={proof}
                alt={`${payer}’s payment screenshot`}
                className={`${compact ? 'max-h-32' : 'max-h-80'} rounded-2xl ring-1 ring-slate-200 dark:ring-white/10`}
              />
            </a>
          ) : (
            <p className="text-muted text-sm">{proof === null ? 'The screenshot couldn’t be loaded.' : 'Loading the screenshot…'}</p>
          )}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => act(false)} disabled={busy} data-testid="claim-dismiss">
          <X size={16} aria-hidden /> Dismiss
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={() => act(true)} disabled={busy} data-testid="claim-confirm">
          <Check size={16} aria-hidden /> Confirm
        </button>
      </div>
    </div>
  )
}
