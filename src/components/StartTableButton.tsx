import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { draftToTable, type TableDraft } from '@/lib/table'
import { useToast } from './Toast'

/**
 * "Split at the table": turns an itemized draft or a scanned receipt into a live table that
 * everyone joins from their own phone (see src/pages/Table.tsx).
 */
export function StartTableButton({ draft, className = '' }: { draft: () => TableDraft; className?: string }) {
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const start = async () => {
    const d = draft()
    if (!d.items.some((i) => i.amount > 0)) return toast('Add the bill’s items first', 'err')
    setBusy(true)
    try {
      const code = await repo.createTable(draftToTable(d, { uid: user.uid, name: profile.displayName, payment: profile.payment }))
      nav(`/t/${code}`)
    } catch (e) {
      toast((e as Error).message, 'err')
      setBusy(false)
    }
  }
  return (
    <button type="button" className={`btn-secondary w-full ${className}`} onClick={start} disabled={busy}>
      <QrCode size={18} /> Split at the table
    </button>
  )
}
