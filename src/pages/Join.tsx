import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { repo } from '@/data'
import type { InviteInfo } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useGroups } from '@/hooks/data'
import { colorFor } from '@/lib/colors'
import { Empty, Loading } from '@/components/Misc'
import { useToast } from '@/components/Toast'

export default function Join() {
  const { code = '' } = useParams()
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const [invite, setInvite] = useState<InviteInfo | null | undefined>(undefined)
  const [claim, setClaim] = useState<string>('new')
  const [busy, setBusy] = useState(false)

  useEffect(() => { repo.getInvite(code).then(setInvite).catch(() => setInvite(null)) }, [code])

  // Already in this group (e.g. tapped the invite link twice)? Go straight there.
  const groups = useGroups()
  const alreadyMember = !!invite && !!groups?.some((g) => g.id === invite.groupId)
  useEffect(() => {
    if (alreadyMember && invite && !busy) nav(`/groups/${invite.groupId}`, { replace: true })
  }, [alreadyMember, invite, busy, nav])

  useEffect(() => {
    // Pre-select a placeholder that matches the user's name.
    if (!invite) return
    const first = profile.displayName.split(' ')[0].toLowerCase()
    const match = Object.entries(invite.placeholders).find(([, n]) => n.toLowerCase().split(' ')[0] === first)
    if (match) setClaim(match[0])
  }, [invite, profile.displayName])

  if (invite === undefined || alreadyMember) return <Loading />
  if (invite === null) return <div className="mx-auto max-w-md px-4 pt-20"><Empty emoji="🔗" title="Invite not found">The link may be mistyped or the group was deleted.</Empty></div>

  const join = async () => {
    setBusy(true)
    try {
      const memberId = claim === 'new' ? user.uid : claim
      const name = claim === 'new' ? profile.displayName : invite.placeholders[claim]
      const groupId = await repo.joinGroup(code, memberId, { name, uid: user.uid, email: user.email, color: colorFor(Object.keys(invite.placeholders).length + 1) })
      toast(`Welcome to ${invite.groupName} 🎉`)
      nav(`/groups/${groupId}`, { replace: true })
    } catch (e) {
      toast((e as Error).message, 'err')
      setBusy(false)
    }
  }

  const options = [...Object.entries(invite.placeholders), ['new', `I’m not listed — join as ${profile.displayName}`] as [string, string]]

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(env(safe-area-inset-top)+4rem)]">
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-100 to-fuchsia-100 text-5xl dark:from-brand-900/50 dark:to-fuchsia-900/30">{invite.emoji}</div>
        <h1 className="mt-4 text-2xl font-extrabold">Join {invite.groupName}</h1>
        <p className="mt-1 text-sm text-slate-500">Which one is you? Expenses already logged for that person become yours.</p>
      </div>
      <div className="card mt-6 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        {options.map(([id, n]) => (
          <button key={id} onClick={() => setClaim(id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${claim === id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-ink-700'}`}>{claim === id && <Check size={14} strokeWidth={3} />}</span>
            <span className="font-medium">{n}</span>
          </button>
        ))}
      </div>
      <button className="btn-primary mt-5 w-full" onClick={join} disabled={busy}>Join group</button>
    </div>
  )
}
