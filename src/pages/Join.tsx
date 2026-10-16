import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, Clock, Lock } from 'lucide-react'
import { askAgainWords, type JoinState } from '@/lib/vault-api'
import { repo } from '@/data'
import type { InviteInfo } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useGroups } from '@/hooks/data'
import { colorFor } from '@/lib/colors'
import { errText } from '@/lib/errors'
import { usePageTitle } from '@/lib/brand'
import { Empty, Loading } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { HintText } from '@/components/Hint'

export default function Join() {
  const { code = '' } = useParams()
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const [invite, setInvite] = useState<InviteInfo | null | undefined>(undefined)
  /** '' = not chosen yet (there are unclaimed people to pick from) */
  const [claim, setClaim] = useState<string>('')
  const [busy, setBusy] = useState(false)
  usePageTitle(invite ? `Join ${invite.groupName}` : invite === null ? 'Invite not found' : undefined)

  useEffect(() => {
    repo
      .getInvite(code)
      .then(setInvite)
      .catch(() => setInvite(null))
  }, [code])

  // Already in this group (e.g. tapped the invite link twice)? Go straight there.
  const groups = useGroups()
  const alreadyMember = !!invite && !!groups?.some((g) => g.id === invite.groupId)
  useEffect(() => {
    if (alreadyMember && invite && !busy) nav(`/groups/${invite.groupId}`, { replace: true })
  }, [alreadyMember, invite, busy, nav])

  useEffect(() => {
    // Pre-select the placeholder that is this user: by email, else by first name.
    if (!invite) return
    const match = matchPlaceholder(invite.placeholders, profile.displayName, user.email ?? profile.email)
    if (match) setClaim(match)
  }, [invite, profile.displayName, profile.email, user.email])

  if (invite === undefined || alreadyMember) return <Loading />
  if (invite === null) {
    return (
      <div className="mx-auto max-w-md px-4 pt-20">
        <Empty emoji="🔗" title="Invite not found">
          The link may be mistyped, or the group was deleted. Ask for a new link, or go home.
          <div className="mt-4">
            <Link to="/" className="btn-secondary btn-sm">
              Go home
            </Link>
          </div>
        </Empty>
      </div>
    )
  }

  // A private group: nobody joins from the invite; they ask, and its creator decides (docs/VAULT.md).
  if (invite.vault) return <PrivateJoin code={code} />

  const unclaimed = Object.keys(invite.placeholders).length > 0
  const choice = claim || (unclaimed ? '' : 'new')
  const myName = profile.displayName.trim() || 'you'
  const join = async () => {
    if (!choice) return toast('Pick which one is you, or “I’m not listed”', 'err')
    setBusy(true)
    try {
      const memberId = choice === 'new' ? user.uid : choice
      // Once linked, a member goes by their own profile name (the organiser's placeholder name
      // was a stand-in); their app keeps it and their photo in step from then on.
      const name = profile.displayName.trim() || invite.placeholders[choice] || 'Member'
      const groupId = await repo.joinGroup(code, memberId, {
        name,
        uid: user.uid,
        email: user.email,
        color: colorFor(Object.keys(invite.placeholders).length + 1),
      })
      toast(`Welcome to ${invite.groupName}`)
      nav(`/groups/${groupId}`, { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(false)
    }
  }

  const options = [...Object.entries(invite.placeholders), ['new', `I’m not listed — join as ${myName}`] as [string, string]]

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(var(--safe-top)+4rem)]">
      <div className="text-center">
        <div
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-100 to-duo-100 text-5xl dark:from-brand-900/50 dark:to-duo-900/30"
          aria-hidden
        >
          {invite.emoji}
        </div>
        <h1 className="mt-4 text-2xl font-extrabold">Join {invite.groupName}</h1>
        {/* Key in every detail level: the pick moves that person's expenses onto you. */}
        <HintText
          id="join-help"
          className="text-muted mt-1 text-sm"
          hint={{
            full: 'Which one is you? Expenses already logged for that person become yours.',
            short: 'Which one is you? Their expenses become yours.',
            tier: 'key',
          }}
        />
      </div>
      <div
        className="card mt-6 divide-y divide-slate-100 overflow-hidden dark:divide-white/5"
        role="radiogroup"
        aria-label="Which one is you?"
        aria-describedby="join-help"
      >
        {options.map(([id, n]) => (
          <button
            key={id}
            type="button"
            role="radio"
            onClick={() => setClaim(id)}
            aria-checked={choice === id}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-left"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${choice === id ? 'border-brand-600 bg-fill text-on-fill' : 'border-slate-500 dark:border-slate-400'}`}
              aria-hidden
            >
              {choice === id && <Check size={14} strokeWidth={3} />}
            </span>
            <span className="font-medium">{n}</span>
          </button>
        ))}
      </div>
      {choice && choice !== 'new' && profile.displayName.trim() && invite.placeholders[choice] !== profile.displayName.trim() && (
        <HintText
          className="mt-3 px-1 text-center text-xs text-muted"
          hint={{
            full: `You’ll show as ${profile.displayName.trim()} (not “${invite.placeholders[choice]}”), with your profile photo.`,
            short: `You’ll show as ${profile.displayName.trim()}.`,
            tier: 'help',
          }}
        />
      )}
      <button type="button" className="btn-primary mt-5 w-full" onClick={join} disabled={busy || !choice} data-testid="join-submit">
        {choice ? 'Join group' : 'Pick one to join'}
      </button>
    </main>
  )
}

/** Fold case and accents: "Zoë" → "zoe", "JOSÉ" → "jose". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * The placeholder that is probably this user. Placeholders only carry a name, so an email
 * matches when the organiser typed it as the name (or its local part, "priya.s@…" → "priya.s").
 * Otherwise a unique first-name match (case- and accent-insensitive).
 */
function matchPlaceholder(placeholders: Record<string, string>, displayName: string, email?: string | null): string | undefined {
  const entries = Object.entries(placeholders)
  if (email) {
    const e = fold(email),
      local = e.split('@')[0]
    const byEmail = entries.find(([, n]) => fold(n) === e) ?? entries.find(([, n]) => fold(n) === local)
    if (byEmail) return byEmail[0]
  }
  const first = fold(displayName).split(/\s+/)[0]
  if (!first) return undefined
  const full = entries.filter(([, n]) => fold(n) === fold(displayName))
  if (full.length === 1) return full[0][0]
  const byFirst = entries.filter(([, n]) => fold(n).split(/\s+/)[0] === first)
  return byFirst.length === 1 ? byFirst[0][0] : undefined
}

/**
 * A private group's invite: no name, people or pick of who you are, only a request to its creator,
 * who lets you in or not (vault ops joinStatus / requestJoin). One request at a time; a day after a
 * decline before asking again.
 */
function PrivateJoin({ code }: { code: string }) {
  const nav = useNavigate()
  const toast = useToast()
  const [state, setState] = useState<JoinState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    repo
      .vault<JoinState>({ op: 'joinStatus', code })
      .then((s) => live && setState(s))
      .catch(() => live && setState({ status: 'none' }))
    return () => {
      live = false
    }
  }, [code])
  useEffect(() => {
    if (state?.status === 'member') nav(`/groups/${state.groupId}`, { replace: true })
  }, [state, nav])

  const ask = async () => {
    setBusy(true)
    try {
      setState(await repo.vault<JoinState>({ op: 'requestJoin', code }))
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(var(--safe-top)+4rem)]" data-testid="join-private">
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-slate-500 dark:bg-ink-800" aria-hidden>
          <Lock size={36} />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold">A private group</h1>
        <p className="text-muted mt-2 text-sm">The person who made it decides who joins. You’ll see what’s in it once they let you in.</p>
      </div>
      <div className="mt-8">
        {!state ? (
          <Loading />
        ) : state.status === 'pending' ? (
          <div className="card flex items-center gap-3 p-4 text-sm" role="status" data-testid="join-pending">
            <Clock size={20} className="text-muted shrink-0" aria-hidden />
            <span>Asked. Waiting for the owner’s OK: you’ll get a notification when they decide.</span>
          </div>
        ) : state.status === 'declined' ? (
          <div className="card p-4 text-sm" role="status" data-testid="join-declined">
            Your last request wasn’t accepted. You can ask again {askAgainWords(state.retryAt, Date.now())}.
          </div>
        ) : (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void ask()} data-testid="join-ask">
            {busy ? 'Asking…' : 'Ask to join'}
          </button>
        )}
        <Link to="/" className="btn-ghost mt-3 w-full">
          Go home
        </Link>
      </div>
    </main>
  )
}
