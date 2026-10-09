import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { groupDeleteBlocker } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { errText } from '@/lib/errors'
import type { Group } from '@/types'
import { ConfirmSheet } from './ConfirmSheet'
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
      toast(errText(e), 'err')
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn w-full text-rose-700 dark:text-rose-400"
        onClick={() => (blocker ? toast(blocker, 'err') : setAsking(true))}
        data-testid="delete-group"
      >
        <Trash2 size={18} aria-hidden /> Delete group
      </button>
      {blocker && <p className="text-muted -mt-3 text-center text-xs">{blocker}</p>}
      <ConfirmSheet
        open={asking}
        onClose={() => !busy && setAsking(false)}
        onConfirm={run}
        busy={busy}
        tone="danger"
        title={`Delete “${group.name}”?`}
        message="All its expenses, payments, comments and history go for everyone in the group. This can’t be undone."
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
      />
    </>
  )
}
