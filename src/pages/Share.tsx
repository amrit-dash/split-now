import { Plus, ScanLine } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/lib/brand'
import { captureFromSharedText, captureQuery } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { Empty, Loading, PageHeader } from '@/components/Misc'

/**
 * Web Share Target landing page (Android). The service worker turns a shared image into
 * /scan?shared=1 and shared text into /share?title=…&text=…&url=…; text with an amount
 * becomes a captured payment, anything else gets a choice.
 */
export default function Share() {
  usePageTitle('Shared to Split Now')
  const [params] = useSearchParams()
  const nav = useNavigate()
  const draft = useMemo(
    () => captureFromSharedText({ title: params.get('title'), text: params.get('text'), url: params.get('url') }, todayISO()),
    [params],
  )

  useEffect(() => {
    if (draft) nav(`/capture?${captureQuery(draft)}`, { replace: true })
  }, [draft, nav])

  if (draft) return <Loading />
  const shared = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join(' ').trim()
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <PageHeader title="Shared to Split Now" back="/" />
      <Empty emoji="🔎" title="No amount found">
        {shared ? <>We couldn’t find an amount in “{shared.slice(0, 120)}”.</> : 'Nothing was shared.'}
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/add" className="btn-primary"><Plus size={18} aria-hidden /> Add expense</Link>
          <Link to="/scan" className="btn-secondary"><ScanLine size={18} aria-hidden /> Scan</Link>
        </div>
      </Empty>
    </div>
  )
}
