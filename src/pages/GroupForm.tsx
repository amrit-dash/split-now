import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FileUp, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { repo } from '@/data'
import { diffMembers } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useAllExpenses, useAllSettlements, useGroup, useGroups } from '@/hooks/data'
import type { Group, GroupType, Member } from '@/types'
import { CURRENCIES, centsToInput, parseMoney } from '@/lib/money'
import { colorFor } from '@/lib/colors'
import { todayISO, uid } from '@/lib/id'
import { isLiveTrip } from '@/lib/capture'
import { DEFAULT_APPROVAL_THRESHOLD } from '@/lib/trust'
import { GROUP_TYPES, SHARED_TYPES, guessGroup, iconsFor, isSharedType, parseGroupType } from '@/lib/groupTypes'
import { Avatar } from '@/components/Avatar'
import { IconPickerField, TypeSuggestion } from '@/components/IconPicker'
import { Select, currencyOptions } from '@/components/Select'
import { LiveBadge, Loading, PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { DateField } from '@/components/DateField'

const maxOthersFor = (t: GroupType) => (t === 'personal' ? 0 : t === 'direct' ? 1 : Infinity)

export default function GroupForm() {
  const { groupId } = useParams()
  const [params] = useSearchParams()
  const existing = useGroup(groupId)
  // Including trashed items: their members must stay so a restore still balances.
  const expenses = useAllExpenses(groupId)
  const settlements = useAllSettlements(groupId)
  const groups = useGroups()
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()

  const [initialType] = useState(() => parseGroupType(params.get('type')))
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(GROUP_TYPES[initialType].emoji)
  const [type, setType] = useState<GroupType>(initialType)
  // What the user chose themselves; name-based guesses and type defaults never overwrite these.
  const [nameTouched, setNameTouched] = useState(false)
  const [typeTouched, setTypeTouched] = useState(false)
  const [iconTouched, setIconTouched] = useState(false)
  const [datesTouched, setDatesTouched] = useState(false)
  const [typedName, setTypedName] = useState(false)
  const [dismissed, setDismissed] = useState('')
  const [currency, setCurrency] = useState(profile.currency)
  const [budget, setBudget] = useState('')
  const [simplify, setSimplify] = useState(true)
  const [requireApproval, setRequireApproval] = useState(false)
  const [threshold, setThreshold] = useState('')
  const [startDate, setStartDate] = useState(() => (GROUP_TYPES[initialType].datesToday ? todayISO() : ''))
  const [endDate, setEndDate] = useState(() => (GROUP_TYPES[initialType].datesToday ? todayISO() : ''))
  const [members, setMembers] = useState<Record<string, Member>>({})
  // People set aside when switching to 1:1 or Personal; they come back on switching to a group.
  const [parked, setParked] = useState<Record<string, Member>>({})
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const lastShared = useRef<GroupType>(isSharedType(initialType) ? initialType : 'trip')

  // Load once: later snapshots (e.g. someone joining) must not wipe unsaved edits.
  const loaded = useRef<{ key: string; base?: Group } | null>(null)
  useEffect(() => {
    if (loaded.current?.key === (groupId ?? 'new')) return
    if (existing) {
      loaded.current = { key: existing.id, base: existing }
      setName(existing.name); setEmoji(existing.emoji); setType(existing.type); setCurrency(existing.currency)
      setNameTouched(true); setTypeTouched(true); setIconTouched(true); setDatesTouched(true)
      setBudget(existing.budget ? centsToInput(existing.budget, existing.currency) : ''); setSimplify(existing.simplify); setMembers(existing.members)
      setStartDate(existing.startDate ?? ''); setEndDate(existing.endDate ?? '')
      setRequireApproval(!!existing.requireApproval)
      setThreshold(existing.approvalThreshold !== undefined ? centsToInput(existing.approvalThreshold, existing.currency) : '')
    } else if (!groupId) {
      loaded.current = { key: 'new' }
      setMembers({ [user.uid]: { name: profile.displayName, uid: user.uid, email: user.email, color: colorFor(0) } })
    }
  }, [existing, groupId, user.uid, user.email, profile.displayName])

  // A new 1:1 is named after the friend until the user types a name of their own.
  const firstOther = Object.values(members).find((m) => m.uid !== user.uid)?.name ?? ''
  useEffect(() => {
    if (!groupId && !nameTouched) setName(type === 'direct' ? firstOther : '')
  }, [groupId, nameTouched, type, firstOther])

  // "People from your groups": everyone you share a group with, most frequent first.
  const known = useMemo(() => {
    const byKey = new Map<string, { name: string; email?: string; uid?: string; n: number }>()
    for (const g of groups ?? []) {
      if (g.id === groupId || g.type === 'personal') continue
      for (const m of Object.values(g.members)) {
        if (m.uid === user.uid || !m.name.trim()) continue
        const nameKey = `n:${m.name.trim().toLowerCase()}`
        const hit = (m.uid && byKey.get(`u:${m.uid}`)) || byKey.get(nameKey)
        if (hit) {
          hit.n++
          hit.email ??= m.email
          if (m.uid && !hit.uid) { hit.uid = m.uid; byKey.set(`u:${m.uid}`, hit) }
        } else {
          const e = { name: m.name.trim(), email: m.email, uid: m.uid, n: 1 }
          byKey.set(nameKey, e)
          if (m.uid) byKey.set(`u:${m.uid}`, e)
        }
      }
    }
    return [...new Set(byKey.values())].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  }, [groups, groupId, user.uid])

  if (groupId && existing === undefined) return <Loading />
  if (groupId && existing === null) return <PageHeader title="Group not found" back />

  const used = new Set([...(expenses ?? []).flatMap((e) => [...Object.keys(e.paidBy), ...Object.keys(e.splits)]), ...(settlements ?? []).flatMap((s) => [s.from, s.to])])
  const others = Object.entries(members).filter(([, m]) => m.uid !== user.uid)
  const info = GROUP_TYPES[type]
  const maxOthers = maxOthersFor(type)
  const shared = isSharedType(type)
  const showDates = shared && (info.dates !== null || !!startDate || !!endDate)
  const shareable = type !== 'personal'
  const live = showDates && isLiveTrip({ startDate: startDate || undefined, endDate: endDate || undefined }, todayISO())
  const hasPersonal = (groups ?? []).some((g) => g.type === 'personal')
  // Types you can switch between here: any shared type, but never to or from 1:1 / Personal once saved.
  const typeChips = shared && (!existing || isSharedType(existing.type))
  const addedNames = new Set(Object.values(members).map((m) => m.name.trim().toLowerCase()))
  const addedUids = new Set(Object.values(members).map((m) => m.uid).filter(Boolean))
  const suggestions = known.filter((k) => !addedNames.has(k.name.toLowerCase()) && !(k.uid && addedUids.has(k.uid))).slice(0, 10)
  const guess = shared && typedName ? guessGroup(name) : null
  const guessKey = guess ? `${guess.type}${guess.emoji}` : ''
  const showGuess = !!guess && (guess.type !== type || guess.emoji !== emoji) && guessKey !== dismissed && isSharedType(guess.type) && (!existing || isSharedType(existing.type))

  /** Switch type; the icon, dates (new groups) and member list follow unless the user set them. */
  const applyType = (t: GroupType, icon?: string) => {
    setType(t)
    if (isSharedType(t)) lastShared.current = t
    if (icon) setEmoji(icon)
    else if (!iconTouched) setEmoji(GROUP_TYPES[t].emoji)
    if (existing) return
    if (!datesTouched) {
      const d = GROUP_TYPES[t].datesToday ? todayISO() : ''
      setStartDate(d); setEndDate(d)
    }
    // 1:1 keeps you and one friend, Personal only you; the rest wait in `parked`.
    const max = maxOthersFor(t)
    const keep: Record<string, Member> = {}
    const park: Record<string, Member> = {}
    let n = 0
    for (const [id, m] of Object.entries({ ...members, ...parked })) {
      if (m.uid === user.uid || n++ < max) keep[id] = m
      else park[id] = m
    }
    const newlyParked = Object.keys(park).filter((id) => !(id in parked)).length
    setMembers(keep); setParked(park)
    if (newlyParked) toast(`${newlyParked} ${newlyParked === 1 ? 'person' : 'people'} set aside: ${t === 'personal' ? 'a personal wallet is just you' : 'a 1:1 is you and one friend'}`)
  }

  const chooseType = (t: GroupType) => { setTypeTouched(true); applyType(t) }
  const chooseIcon = (e: string) => { setIconTouched(true); setEmoji(e) }

  const onName = (v: string) => {
    setName(v); setNameTouched(true); setTypedName(true)
    // Until the user picks a type or icon, follow the name ("Goa trip" → trip, 🏖️).
    if (!existing && shared && !typeTouched && !iconTouched) {
      const g = guessGroup(v)
      applyType(g?.type ?? (isSharedType(initialType) ? initialType : 'trip'), g?.emoji)
    }
  }

  const addPerson = (personName: string, email?: string) => {
    if (!personName.trim() || others.length >= maxOthers) return
    const id = uid('p_')
    setMembers((m) => ({ ...m, [id]: { name: personName.trim(), email: email?.trim() || undefined, color: colorFor(Object.keys(m).length) } }))
  }
  const addMember = () => {
    if (!newName.trim()) return
    addPerson(newName, newEmail)
    setNewName(''); setNewEmail('')
  }

  const save = async () => {
    const finalName = name.trim() || (type === 'personal' ? 'My spending' : type === 'direct' ? others[0]?.[1].name : '')
    if (!finalName) return toast('Give your group a name', 'err')
    const budgetCents = budget ? parseMoney(budget, currency) : undefined
    if (budget && !Number.isFinite(budgetCents)) return toast('Budget is not a valid amount', 'err')
    if (startDate && endDate && endDate < startDate) return toast('The trip ends before it starts', 'err')
    const thresholdCents = threshold ? parseMoney(threshold, currency) : undefined
    if (threshold && !Number.isFinite(thresholdCents)) return toast('Approval limit is not a valid amount', 'err')
    if (!existing && others.length > maxOthers) return toast(type === 'direct' ? 'A 1:1 is you and one friend' : 'A personal wallet is just you', 'err')
    // A personal wallet only ever holds you, whatever was typed before switching to it.
    const saved = type === 'personal' && !existing ? Object.fromEntries(Object.entries(members).filter(([, m]) => m.uid === user.uid)) : members
    setBusy(true)
    try {
      const data = {
        name: finalName, emoji, type, currency, budget: budgetCents, simplify, members: saved,
        startDate: showDates ? startDate || undefined : undefined, endDate: showDates ? endDate || undefined : undefined,
        ...(shareable ? { requireApproval: requireApproval || undefined, approvalThreshold: requireApproval ? thresholdCents : undefined } : {}),
        memberUids: [...new Set(Object.values(saved).map((m) => m.uid).filter(Boolean) as string[])],
      }
      if (existing) {
        // Only send what changed; membership changes are per-member so concurrent joins survive.
        const { members: _m, memberUids: _u, ...settings } = data
        const base = loaded.current?.base ?? existing
        const { added, removed } = diffMembers(base.members, saved)
        await repo.updateGroupSettings(base, settings)
        for (const id of added) await repo.addMember(base, id, saved[id])
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
      <PageHeader title={existing ? 'Edit group' : type === 'direct' ? 'New 1:1' : type === 'personal' ? 'Personal wallet' : 'New group'} back />
      <div className="space-y-5">
        <div className="card space-y-4 p-4">
          <IconPickerField emoji={emoji} onChange={chooseIcon} emojis={iconsFor(type)} idPrefix="group-icon">
            <label className="label" htmlFor="group-name">Name</label>
            <input id="group-name" className="input" placeholder={info.placeholder} value={name} onChange={(e) => onName(e.target.value)} />
          </IconPickerField>
          {showGuess && guess && (
            <TypeSuggestion guess={guess} onDismiss={() => setDismissed(guessKey)} onApply={() => { setTypeTouched(true); setIconTouched(true); applyType(guess.type, guess.emoji) }} />
          )}
          {typeChips && (
            <div>
              <label className="label">Type</label>
              <div className="flex flex-wrap gap-2">
                {SHARED_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => chooseType(t)} className={`chip ${type === t ? 'chip-on' : ''}`}>{GROUP_TYPES[t].emoji} {GROUP_TYPES[t].label}</button>
                ))}
              </div>
              {!existing && (
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <button type="button" className="font-semibold text-brand-600 dark:text-brand-300" onClick={() => chooseType('direct')}>🤝 Just one friend?</button>
                  {!hasPersonal && <button type="button" className="font-semibold text-brand-600 dark:text-brand-300" onClick={() => chooseType('personal')}>👛 Personal wallet</button>}
                </div>
              )}
            </div>
          )}
          {!shared && !existing && (
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800">
              <div className="min-w-0 flex-1 text-slate-600 dark:text-slate-300">
                {type === 'direct' ? 'Just you and one friend, outside any group.' : 'Only you: track your own spending.'}
              </div>
              <button type="button" className="shrink-0 font-semibold text-brand-600 dark:text-brand-300" onClick={() => chooseType(lastShared.current)}>Make it a group</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Currency</label>
              <Select aria-label="Currency" value={currency} onChange={setCurrency} options={currencyOptions(CURRENCIES)} />
            </div>
            <div>
              <label className="label">Budget (optional)</label>
              <input className="input" inputMode="decimal" placeholder="0.00" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>
          {showDates && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label !mb-0">{info.dates ?? 'Dates'} (optional)</span>
                {live && <LiveBadge type={type} />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="trip-start" className="mb-1 block text-xs font-medium text-slate-500">Start</label>
                  <DateField id="trip-start" aria-label="Start date" placeholder="Add date" clearable value={startDate} max={endDate || undefined} onChange={(v) => { setDatesTouched(true); setStartDate(v) }} />
                </div>
                <div>
                  <label htmlFor="trip-end" className="mb-1 block text-xs font-medium text-slate-500">End</label>
                  <DateField id="trip-end" aria-label="End date" placeholder="Add date" clearable value={endDate} min={startDate || undefined} onChange={(v) => { setDatesTouched(true); setEndDate(v) }} />
                </div>
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
                {suggestions.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-slate-500">People from your groups</div>
                    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-testid="known-people">
                      {suggestions.map((k) => (
                        <button key={k.uid ?? k.name} type="button" onClick={() => addPerson(k.name, k.email)} className="chip shrink-0" aria-label={`Add ${k.name}`}>
                          <Plus size={14} /> {k.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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

        <button className="btn-primary w-full" onClick={save} disabled={busy}>{existing ? 'Save changes' : type === 'direct' ? 'Create 1:1' : type === 'personal' ? 'Create wallet' : 'Create group'}</button>
        {!existing && shared && (
          <Link to="/groups/import" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <FileUp size={16} /> Switching from Splitwise? Import a group
          </Link>
        )}
        {existing && existing.createdBy === user.uid && (
          <button className="btn w-full text-rose-600" onClick={remove}><Trash2 size={18} /> Delete group</button>
        )}
      </div>
    </div>
  )
}
