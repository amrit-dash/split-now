import { Plus, ScanLine } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { usePageTitle } from '@/lib/brand'
import { captureQuery, classifySharedText, sharedTextIgnoredText } from '@/lib/capture'
import { watchCapturePrefs } from '@/lib/capture-settings'
import { todayISO } from '@/lib/id'
import type { AllPrefs } from '@/lib/push'
import { Empty, Loading, PageHeader } from '@/components/Misc'

/**
 * Web Share Target landing page (Android). The service worker turns a shared image into
 * /scan?shared=1 and shared text into /share?title=…&text=…&url=…. Shared text goes through the
 * same parser, masking and filters as the capture webhook (src/lib/capture.ts classifySharedText):
 * a debit becomes a captured payment, a credit / OTP / filtered message says why it wasn't, and
 * anything else gets a choice.
 */
export default function Share() {
  usePageTitle('Shared to Split Now')
  const { user } = useMe()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [prefs, setPrefs] = useState<AllPrefs | null>(null)
  useEffect(() => watchCapturePrefs(user.uid, repo.mode, setPrefs), [user.uid])
  const parts = useMemo(() => ({ title: params.get('title'), text: params.get('text'), url: params.get('url') }), [params])
  // Wait for the user's filters so the share path skips what the webhook would skip.
  const outcome = useMemo(
    () => (prefs ? classifySharedText(parts, todayISO(), { minAmount: prefs.minAmount, ignoreWords: prefs.ignoreWords }) : null),
    [parts, prefs],
  )

  useEffect(() => {
    if (outcome?.outcome === 'capture') nav(`/capture?${captureQuery(outcome.draft)}`, { replace: true })
  }, [outcome, nav])

  if (!outcome || outcome.outcome === 'capture') return <Loading />
  const shared = [parts.title, parts.text, parts.url].filter(Boolean).join(' ').trim()
  const ignored = outcome.outcome === 'ignored'
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <PageHeader title="Shared to Split Now" back="/" />
      <Empty emoji={ignored ? '🙈' : '🔎'} title={ignored ? 'Not a payment to add' : 'No amount found'}>
        {ignored ? sharedTextIgnoredText(outcome) : shared ? <>We couldn’t find an amount in “{shared.slice(0, 120)}”.</> : 'Nothing was shared.'}
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/add" className="btn-primary">
            <Plus size={18} aria-hidden /> Add expense
          </Link>
          <Link to="/scan" className="btn-secondary">
            <ScanLine size={18} aria-hidden /> Scan
          </Link>
        </div>
      </Empty>
    </div>
  )
}
