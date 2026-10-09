import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { groupDeleteBlocker } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import type { Group } from '@/types'
import { Sheet } from './Sheet'
import { useToast } from './Toast'

/**
 * "Delete group" on the group's settings: an in-app confirm (window.confirm can be suppressed in
 * an installed app), a busy state while the server deletes everything, a readable toast when it
 * can't, and back to Groups when it's done. Members who can't delete it see who can.
 */
export function DeleteGroupButton({ group }: { group: Group }) {
  const { user } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const blocker = groupDeleteBlocker(group, user.uid)

  const run = async () => {
    setBusy(true)
    try {
      await repo.deleteGroup(group.id)
      setAsking(false)
      toast(`Deleted “${group.name}”`)
      nav('/groups', { replace: true })
    } catch (e) {
      toast((e as Error).message || 'Couldn’t delete the group', 'err')
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn w-full text-rose-600" onClick={() => (blocker ? toast(blocker, 'err') : setAsking(true))} data-testid="delete-group">
        <Trash2 size={18} aria-hidden /> Delete group
      </button>
      {blocker && <p className="-mt-3 text-center text-xs text-slate-500">{blocker}</p>}
      <Sheet open={asking} onClose={() => !busy && setAsking(false)} title={`Delete “${group.name}”?`}>
        <p className="text-sm text-slate-500">All its expenses, payments, comments and history go for everyone in the group. This can’t be undone.</p>
        <div className="mt-4 flex gap-2">
          <button className="btn flex-1" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
          <button className="btn flex-1 bg-rose-600 text-white" onClick={run} disabled={busy} data-testid="confirm-delete-group">
            <Trash2 size={18} aria-hidden /> {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Sheet>
    </>
  )
}
