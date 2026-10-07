import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FileUp, Trash2, UserPlus, X } from 'lucide-react'
import { repo } from '@/data'
import { diffMembers } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useAllExpenses, useAllSettlements, useGroup } from '@/hooks/data'
import type { Group, GroupType, Member } from '@/types'
import { CURRENCIES, centsToInput, parseMoney } from '@/lib/money'
import { colorFor } from '@/lib/colors'
import { todayISO, uid } from '@/lib/id'
import { isLiveTrip } from '@/lib/capture'
import { DEFAULT_APPROVAL_THRESHOLD } from '@/lib/trust'
import { Avatar } from '@/components/Avatar'
import { LiveBadge, Loading, PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'

const TYPES: Array<{ value: GroupType; label: string; emoji: string }> = [
  { value: 'trip', label: 'Trip', emoji: '✈️' },
  { value: 'home', label: 'Home', emoji: '🏠' },
  { value: 'couple', label: 'Couple', emoji: '💞' },
  { value: 'event', label: 'Event', emoji: '🎉' },
  { value: 'other', label: 'Other', emoji: '📦' },
  { value: 'direct', label: 'Friend (1:1)', emoji: '🤝' },
  { value: 'personal', label: 'Personal', emoji: '👛' },
]
const EMOJIS = ['🏝️', '✈️', '🏠', '🍕', '🎉', '💞', '🏔️', '🚗', '🎿', '🏕️', '⚽', '🍻', '🎓', '💼', '👛', '🤝', '🌏', '🎵']

export default function GroupForm() {
  const { groupId } = useParams()
  const [params] = useSearchParams()
  const existing = useGroup(groupId)
  // Including trashed items: their members must stay so a restore still balances.
  const expenses = useAllExpenses(groupId)
  const settlements = useAllSettlements(groupId)
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏝️')
  const [type, setType] = useState<GroupType>((params.get('type') as GroupType) || 'trip')
  const [currency, setCurrency] = useState(profile.currency)
  const [budget, setBudget] = useState('')
  const [simplify, setSimplify] = useState(true)
  const [requireApproval, setRequireApproval] = useState(false)
  const [threshold, setThreshold] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [members, setMembers] = useState<Record<string, Member>>({})
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState(false)

  // Load once: later snapshots (e.g. someone joining) must not wipe unsaved edits.
  const loaded = useRef<{ key: string; base?: Group } | null>(null)
  useEffect(() => {
    if (loaded.current?.key === (groupId ?? 'new')) return
    if (existing) {
      loaded.current = { key: existing.id, base: existing }
      setName(existing.name); setEmoji(existing.emoji); setType(existing.type); setCurrency(existing.currency)
      setBudget(existing.budget ? centsToInput(existing.budget, existing.currency) : ''); setSimplify(existing.simplify); setMembers(existing.members)
      setStartDate(existing.startDate ?? ''); setEndDate(existing.endDate ?? '')
      setRequireApproval(!!existing.requireApproval)
      setThreshold(existing.approvalThreshold !== undefined ? centsToInput(existing.approvalThreshold, existing.currency) : '')
    } else if (!groupId) {
      loaded.current = { key: 'new' }
      setMembers({ [user.uid]: { name: profile.displayName, uid: user.uid, email: user.email, color: colorFor(0) } })
    }
  }, [existing, groupId, user.uid, user.email, profile.displayName])

  useEffect(() => {
    if (!groupId) setEmoji(TYPES.find((t) => t.value === type)?.emoji ?? '📦')
  }, [type, groupId])

  if (groupId && existing === undefined) return <Loading />
  if (groupId && existing === null) return <PageHeader title="Group not found" back />

  const used = new Set([...(expenses ?? []).flatMap((e) => [...Object.keys(e.paidBy), ...Object.keys(e.splits)]), ...(settlements ?? []).flatMap((s) => [s.from, s.to])])
  const others = Object.entries(members).filter(([, m]) => m.uid !== user.uid)
  const maxOthers = type === 'personal' ? 0 : type === 'direct' ? 1 : Infinity
  const datable = type !== 'personal' && type !== 'direct'
  const shareable = type !== 'personal'
  const live = datable && isLiveTrip({ startDate: startDate || undefined, endDate: endDate || undefined }, todayISO())

  const addMember = () => {
    if (!newName.trim() || others.length >= maxOthers) return
    const id = uid('p_')
    setMembers((m) => ({ ...m, [id]: { name: newName.trim(), email: newEmail.trim() || undefined, color: colorFor(Object.keys(m).length) } }))
    setNewName(''); setNewEmail('')
    if (type === 'direct' && !name) setName(newName.trim())
  }

  const save = async () => {
    const finalName = name.trim() || (type === 'personal' ? 'My spending' : type === 'direct' ? others[0]?.[1].name : '')
    if (!finalName) return toast('Give your group a name', 'err')
    const budgetCents = budget ? parseMoney(budget, currency) : undefined
    if (budget && !Number.isFinite(budgetCents)) return toast('Budget is not a valid amount', 'err')
    if (startDate && endDate && endDate < startDate) return toast('The trip ends before it starts', 'err')
    const thresholdCents = threshold ? parseMoney(threshold, currency) : undefined
    if (threshold && !Number.isFinite(thresholdCents)) return toast('Approval limit is not a valid amount', 'err')
    setBusy(true)
    try {
      const data = {
        name: finalName, emoji, type, currency, budget: budgetCents, simplify, members,
        startDate: datable ? startDate || undefined : undefined, endDate: datable ? endDate || undefined : undefined,
        ...(shareable ? { requireApproval: requireApproval || undefined, approvalThreshold: requireApproval ? thresholdCents : undefined } : {}),
        memberUids: [...new Set(Object.values(members).map((m) => m.uid).filter(Boolean) as string[])],
      }
      if (existing) {
        // Only send what changed; membership changes are per-member so concurrent joins survive.
        const { members: _m, memberUids: _u, ...settings } = data
        const base = loaded.current?.base ?? existing
        const { added, removed } = diffMembers(base.members, members)
        await repo.updateGroupSettings(base, settings)
        for (const id of added) await repo.addMember(base, id, members[id])
        for (const id of removed) await repo.removeMember(base, id)
        toast('Group updated')
        nav(`/groups/${existing.id}`, { replace: true })
      } else {
        const id = await repo.createGroup({ ...data, createdBy: user.uid } as Omit<Group, 'id' | 'createdAt' | 'updatedAt' | 'inviteCode'>)
        toast('Group created 🎉')
        nav(`/groups/${id}`, { replace: true })
      }
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!existing || !confirm(`Delete “${existing.name}” and all its expenses? This cannot be undone.`)) return
    await repo.deleteGroup(existing.id)
    toast('Group deleted')
    nav('/groups', { replace: true })
  }

  return (
    <div>
      <PageHeader title={existing ? 'Edit group' : 'New group'} back />
      <div className="space-y-5">
        {!existing && type !== 'personal' && type !== 'direct' && (
          <Link to="/groups/import" className="card flex items-center gap-3 p-4">
            <FileUp className="shrink-0 text-brand-600" size={22} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Import from Splitwise</div>
              <div className="text-xs text-slate-500">Bring a whole group over from its CSV export, balances and all.</div>
            </div>
          </Link>
        )}
        <div className="card space-y-4 p-4">
          <div className="flex gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-fuchsia-100 text-3xl dark:from-brand-900/50 dark:to-fuchsia-900/30">{emoji}</div>
            <div className="flex-1">
              <label className="label">Name</label>
              <input className="input" placeholder={type === 'trip' ? 'e.g. Bali 2026' : type === 'home' ? 'e.g. Fitzroy flat' : 'Group name'} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} className={`shrink-0 rounded-xl p-2 text-xl ${emoji === e ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900/40' : ''}`}>{e}</button>
            ))}
          </div>
          {!existing && (
            <div>
              <label className="label">Type</label>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button key={t.value} type="button" onClick={() => setType(t.value)} className={`chip ${type === t.value ? 'chip-on' : ''}`}>{t.emoji} {t.label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Currency</label>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Budget (optional)</label>
              <input className="input" inputMode="decimal" placeholder="0.00" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>
          {datable && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label !mb-0">{type === 'trip' ? 'Trip dates' : type === 'event' ? 'Event dates' : 'Dates'} (optional)</span>
                {live && <LiveBadge />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" className="input" aria-label="Start date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} />
                <input type="date" className="input" aria-label="End date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">While it’s on, new expenses and captured payments default to this group.</p>
              {(startDate || endDate) && (
                <p className="mt-1 text-xs text-slate-500">
                  📩 Tip: forward bank &amp; UPI debit SMS to this trip with{' '}
                  {existing
                    ? <Link to={`/settings/auto-capture?group=${existing.id}`} className="font-semibold text-brand-600 dark:text-brand-300">SMS auto-capture</Link>
                    : <b>SMS auto-capture</b>}{existing ? '' : ' (on the group page after saving)'}.
                </p>
              )}
            </div>
          )}
          {type !== 'personal' && (
            <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
              <div>
                <div className="font-semibold">Simplify debts</div>
                <div className="text-xs text-slate-500">Fewer payments: e.g. if A owes B and B owes C, A pays C directly.</div>
              </div>
              <input type="checkbox" className="h-6 w-11 shrink-0 accent-brand-600" checked={simplify} onChange={(e) => setSimplify(e.target.checked)} />
            </label>
          )}
          {shareable && (
            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
              <label className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold">Require approval</div>
                  <div className="text-xs text-slate-500">Big expenses added by someone else stay pending (not counted) until everyone charged taps Approve.</div>
                </div>
                <input type="checkbox" className="h-6 w-11 shrink-0 accent-brand-600" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />
              </label>
              {requireApproval && (
                <div className="mt-3">
                  <label className="label" htmlFor="approval-threshold">For expenses over</label>
                  <input id="approval-threshold" className="input" inputMode="decimal" placeholder={centsToInput(DEFAULT_APPROVAL_THRESHOLD, currency)} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
                </div>
              )}
            </div>
          )}
        </div>

        {type !== 'personal' && (
          <div className="card p-4">
            <div className="label">Members</div>
            <div className="space-y-2">
              {Object.entries(members).map(([id, m]) => (
                <div key={id} className="flex items-center gap-3">
                  <Avatar name={m.name} color={m.color} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.name} {m.uid === user.uid && <span className="text-xs text-slate-400">(you)</span>}</div>
                    <div className="truncate text-xs text-slate-500">{m.uid ? 'Joined' : m.email ? `${m.email} · not joined yet` : 'Not joined yet — share the invite link'}</div>
                  </div>
                  {m.uid !== user.uid && !used.has(id) && (
                    <button type="button" onClick={() => setMembers(({ [id]: _, ...rest }) => rest)} className="rounded-full p-2 text-slate-400 hover:text-rose-500" aria-label={`Remove ${m.name}`}><X size={18} /></button>
                  )}
                </div>
              ))}
            </div>
            {others.length < maxOthers && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-white/5">
                <input className="input" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMember())} />
                <div className="flex gap-2">
                  <input className="input" type="email" placeholder="Email (optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  <button type="button" className="btn-secondary shrink-0" onClick={addMember} disabled={!newName.trim()}><UserPlus size={18} /> Add</button>
                </div>
                <p className="text-xs text-slate-500">Add people now and log expenses straight away. They can claim their spot later with the invite link.</p>
              </div>
            )}
          </div>
        )}

        <button className="btn-primary w-full" onClick={save} disabled={busy}>{existing ? 'Save changes' : 'Create group'}</button>
        {existing && existing.createdBy === user.uid && (
          <button className="btn w-full text-rose-600" onClick={remove}><Trash2 size={18} /> Delete group</button>
        )}
      </div>
    </div>
  )
}
