import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Search, UserPlus, X } from 'lucide-react'
import { repo } from '@/data'
import { diffMembers } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { createGroup, useAllExpenses, useAllSettlements, useGroup, useGroups } from '@/hooks/data'
import type { Group, GroupType, Member } from '@/types'
import { CURRENCIES, centsToInput } from '@/lib/money'
import { colorFor } from '@/lib/colors'
import { todayISO, uid } from '@/lib/id'
import { isLiveTrip } from '@/lib/capture'
import { errText } from '@/lib/errors'
import { usePageTitle } from '@/lib/brand'
import { thresholdOf } from '@/lib/trust'
import { APPROVAL_BASE_CURRENCY, defaultEditAutoApprove, defaultThreshold, groupApprovalInCurrency, shortMoney, tableThreshold } from '@/lib/approval'
import { getRate } from '@/lib/fx'
import { useTodayRates } from '@/hooks/useFx'
import { GROUP_TYPES, SHARED_TYPES, groupTypeInfo, groupTypeOf, guessGroup, iconsFor, isSharedType, parseGroupType } from '@/lib/groupTypes'
import { Avatar } from '@/components/Avatar'
import { IconPickerField, TypeSuggestion } from '@/components/IconPicker'
import { Select, currencyOptions } from '@/components/Select'
import { LiveBadge, Loading, PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { DateField } from '@/components/DateField'
import { Switch } from '@/components/Switch'
import { Collapsible } from '@/components/Collapsible'
import { MoneyInput } from '@/components/MoneyInput'
import { formatRange } from '@/components/Misc'
import { formatMoney } from '@/lib/money'
import { DeleteGroupButton } from '@/components/DeleteGroup'
import { isEmail, knownPeople, nameFromEmail, recentPeople, searchPeople, type KnownPerson } from '@/lib/people'

const maxOthersFor = (t: GroupType) => (t === 'personal' ? 0 : t === 'direct' ? 1 : Infinity)

type Kind = 'group' | 'direct' | 'personal'
const KINDS: Array<{ kind: Kind; emoji: string; label: string; hint: string }> = [
  { kind: 'group', emoji: '👥', label: 'Group', hint: 'Trips & more' },
  { kind: 'direct', emoji: '🤝', label: '1:1 friend', hint: 'You + 1 friend' },
  { kind: 'personal', emoji: '👛', label: 'Personal', hint: 'Your own wallet' },
]

type Field = 'name' | 'budget' | 'dates' | 'threshold' | 'editAuto'

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
  const [budget, setBudget] = useState<number | undefined>(undefined)
  const [simplify, setSimplify] = useState(true)
  const [requireApproval, setRequireApproval] = useState(false)
  const [threshold, setThreshold] = useState<number | undefined>(undefined)
  const [thresholdTouched, setThresholdTouched] = useState(false)
  const [editAuto, setEditAuto] = useState(false)
  const [editAmount, setEditAmount] = useState<number | undefined>(undefined)
  const [editAmountTouched, setEditAmountTouched] = useState(false)
  const [startDate, setStartDate] = useState(() => (GROUP_TYPES[initialType].datesToday ? todayISO() : ''))
  const [endDate, setEndDate] = useState(() => (GROUP_TYPES[initialType].datesToday ? todayISO() : ''))
  const [members, setMembers] = useState<Record<string, Member>>({})
  // People set aside when switching to 1:1 or Personal; they come back on switching to a group.
  const [parked, setParked] = useState<Record<string, Member>>({})
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const lastShared = useRef<GroupType>(isSharedType(initialType) ? initialType : 'trip')
  usePageTitle(groupId ? (existing ? `Edit ${existing.name}` : existing === null ? 'Group not found' : undefined) : 'New group')

  // Load once: later snapshots (e.g. someone joining) must not wipe unsaved edits.
  const loaded = useRef<{ key: string; base?: Group } | null>(null)
  useEffect(() => {
    if (loaded.current?.key === (groupId ?? 'new')) return
    if (existing) {
      loaded.current = { key: existing.id, base: existing }
      // The rules do not validate `type`: an unknown value reads as Other instead of crashing the screen.
      setName(existing.name)
      setEmoji(existing.emoji)
      setType(groupTypeOf(existing))
      setCurrency(existing.currency)
      setNameTouched(true)
      setTypeTouched(true)
      setIconTouched(true)
      setDatesTouched(true)
      setBudget(existing.budget || undefined)
      setSimplify(existing.simplify)
      setMembers(existing.members)
      setStartDate(existing.startDate ?? '')
      setEndDate(existing.endDate ?? '')
      setRequireApproval(!!existing.requireApproval)
      setThreshold(existing.approvalThreshold)
      setThresholdTouched(existing.approvalThreshold !== undefined)
      setEditAuto(!!existing.editAutoApprove)
      setEditAmount(existing.editAutoApprove)
      setEditAmountTouched(existing.editAutoApprove !== undefined)
    } else if (!groupId) {
      loaded.current = { key: 'new' }
      setMembers({ [user.uid]: { name: profile.displayName, uid: user.uid, email: user.email, color: colorFor(0) } })
    }
  }, [existing, groupId, user.uid, user.email, profile.displayName])

  // Approval is a group setting, off for a new group. Turning it on fills in the currency's
  // defaults (₹2,000 to need an OK, ₹100 for small edits); an amount nobody typed follows the
  // currency (a currency off the default table converts the INR default at today's rate).
  const approvalRates = useTodayRates(currency, tableThreshold(currency) === undefined ? [APPROVAL_BASE_CURRENCY] : [])
  const inrRate = approvalRates?.[APPROVAL_BASE_CURRENCY]?.rate
  const suggested = groupId ? thresholdOf({ currency }) : defaultThreshold(currency, inrRate)
  const suggestedEdit = defaultEditAutoApprove(currency, groupId ? undefined : inrRate)
  useEffect(() => {
    if (!groupId && !thresholdTouched) setThreshold(suggested)
  }, [groupId, thresholdTouched, suggested])
  useEffect(() => {
    if (!groupId && !editAmountTouched) setEditAmount(suggestedEdit)
  }, [groupId, editAmountTouched, suggestedEdit])
  // Switching approval (or small edits) on in a group without a saved amount fills in the default.
  const turnApproval = (on: boolean) => {
    setRequireApproval(on)
    if (on && threshold === undefined) setThreshold(suggested)
  }
  const turnEditAuto = (on: boolean) => {
    setEditAuto(on)
    if (on && editAmount === undefined) setEditAmount(suggestedEdit)
  }
  // Approval settings are the creator's (firestore.rules creatorPolicy); others see them read-only.
  const canSetApproval = !existing || existing.createdBy === user.uid
  // The approval amounts are in the group's currency and only the creator converts them, so
  // nobody else may change the currency while they are set (firestore.rules creatorPolicy).
  const currencyLocked = !canSetApproval && !!(existing?.approvalThreshold || existing?.editAutoApprove)

  /** The group's currency changed: amounts someone set are converted at today's rate and rounded (no rate: the new currency's defaults). */
  const changeCurrency = async (next: string) => {
    const from = currency
    setCurrency(next)
    if (next === from || !canSetApproval) return
    // A filled-in default nobody typed becomes the new currency's default (new groups: the effect above).
    if (groupId && !thresholdTouched && threshold !== undefined) setThreshold(defaultThreshold(next))
    if (groupId && !editAmountTouched && editAmount !== undefined) setEditAmount(defaultEditAutoApprove(next))
    if (!(thresholdTouched || editAmountTouched)) return
    const rate = (await getRate(from, next, todayISO()))?.rate ?? null
    const out = groupApprovalInCurrency(
      { threshold: thresholdTouched ? threshold : undefined, editAutoApprove: editAmountTouched ? editAmount : undefined },
      from,
      next,
      rate,
    )
    if (out.threshold !== undefined) setThreshold(out.threshold)
    if (out.editAutoApprove !== undefined) setEditAmount(out.editAutoApprove)
  }

  // A new 1:1 is named after the friend until the user types a name of their own.
  const firstOther = Object.values(members).find((m) => m.uid !== user.uid)?.name ?? ''
  useEffect(() => {
    if (!groupId && !nameTouched) setName(type === 'direct' ? firstOther : '')
  }, [groupId, nameTouched, type, firstOther])

  // Quick-add pills: people from your ~4 most recent groups/1:1s (the full list only grows).
  const isAdded = useCallback(
    (k: KnownPerson) => Object.values(members).some((m) => (k.uid && m.uid === k.uid) || m.name.trim().toLowerCase() === k.name.toLowerCase()),
    [members],
  )
  const recent = useMemo(() => recentPeople(groups ?? [], user.uid, groupId), [groups, user.uid, groupId])
  // Search covers everyone from all your groups, built only once you start typing.
  const q = query.trim()
  const searching = q !== ''
  const everyone = useMemo(() => (searching ? knownPeople(groups ?? [], user.uid, groupId) : null), [searching, groups, user.uid, groupId])
  const results = useMemo(
    () =>
      everyone
        ? searchPeople(
            everyone.filter((k) => !isAdded(k)),
            q,
          )
        : [],
    [everyone, q, isAdded],
  )
  const ql = q.toLowerCase()
  const inviteEmail =
    isEmail(q) && !everyone?.some((k) => k.email?.toLowerCase() === ql) && !Object.values(members).some((m) => m.email?.toLowerCase() === ql) ? q : ''

  if (groupId && existing === undefined) return <Loading />
  if (groupId && existing === null) return <PageHeader title="Group not found" back />

  // Member ids that appear in any expense or payment (trashed ones too): they cannot be removed here.
  const usedIn = new Map<string, number>()
  for (const e of expenses ?? []) for (const id of new Set([...Object.keys(e.paidBy), ...Object.keys(e.splits)])) usedIn.set(id, (usedIn.get(id) ?? 0) + 1)
  for (const s of settlements ?? []) for (const id of new Set([s.from, s.to])) usedIn.set(id, (usedIn.get(id) ?? 0) + 1)
  const others = Object.entries(members).filter(([, m]) => m.uid !== user.uid)
  const info = groupTypeInfo(type)
  const maxOthers = maxOthersFor(type)
  const shared = isSharedType(type)
  const showDates = shared && (info.dates !== null || !!startDate || !!endDate)
  const shareable = type !== 'personal'
  const live = showDates && isLiveTrip({ startDate: startDate || undefined, endDate: endDate || undefined }, todayISO())
  const hasPersonal = (groups ?? []).some((g) => g.type === 'personal')
  // Types you can switch between here: any shared type, but never to or from 1:1 / Personal once saved.
  const typeChips = shared && (!existing || isSharedType(groupTypeOf(existing)))
  const suggestions = recent.filter((k) => !isAdded(k)).slice(0, 12)
  const kind: Kind = shared ? 'group' : type === 'direct' ? 'direct' : 'personal'
  const kinds = KINDS.filter((k) => k.kind !== 'personal' || !hasPersonal || type === 'personal')
  const guess = shared && typedName ? guessGroup(name) : null
  const guessKey = guess ? `${guess.type}${guess.emoji}` : ''
  const showGuess =
    !!guess &&
    (guess.type !== type || guess.emoji !== emoji) &&
    guessKey !== dismissed &&
    isSharedType(guess.type) &&
    (!existing || isSharedType(groupTypeOf(existing)))
  const moreSummary = [
    currency,
    budget ? `budget ${formatMoney(budget, currency)}` : 'no budget',
    showDates && (startDate || endDate) ? formatRange(startDate || undefined, endDate || undefined) : null,
    type !== 'personal' ? `simplify ${simplify ? 'on' : 'off'}` : null,
    shareable && requireApproval ? 'approval on' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const clearError = (f: Field) => setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e))

  /** Switch type; the icon, dates (new groups) and member list follow unless the user set them. */
  const applyType = (t: GroupType, icon?: string) => {
    setType(t)
    if (isSharedType(t)) lastShared.current = t
    if (icon) setEmoji(icon)
    else if (!iconTouched) setEmoji(GROUP_TYPES[t].emoji)
    if (existing) return
    if (!datesTouched) {
      const d = GROUP_TYPES[t].datesToday ? todayISO() : ''
      setStartDate(d)
      setEndDate(d)
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
    setMembers(keep)
    setParked(park)
    if (newlyParked)
      toast(
        `${newlyParked} ${newlyParked === 1 ? 'person' : 'people'} set aside: ${t === 'personal' ? 'a personal wallet is just you' : 'a 1:1 is you and one friend'}`,
      )
  }

  const chooseType = (t: GroupType) => {
    setTypeTouched(true)
    applyType(t)
  }
  const chooseKind = (k: Kind) => {
    if (k !== kind) chooseType(k === 'group' ? lastShared.current : k)
  }
  const chooseIcon = (e: string) => {
    setIconTouched(true)
    setEmoji(e)
  }

  const onName = (v: string) => {
    setName(v)
    setNameTouched(true)
    setTypedName(true)
    clearError('name')
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
  const addKnown = (k: KnownPerson) => {
    addPerson(k.name, k.email)
    setQuery('')
  }
  const addByEmail = (email: string) => {
    addPerson(nameFromEmail(email), email)
    setQuery('')
  }
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (results.length === 1) addKnown(results[0])
    else if (inviteEmail) addByEmail(inviteEmail)
  }
  const addMember = () => {
    if (!newName.trim()) return
    addPerson(newName, newEmail)
    setNewName('')
    setNewEmail('')
  }

  /** Problems with what was typed, next to the field they belong to (not a passing toast). */
  const validate = (finalName: string): Partial<Record<Field, string>> => {
    const errs: Partial<Record<Field, string>> = {}
    if (!finalName) errs.name = type === 'direct' ? 'Add the friend, or give it a name' : 'Give your group a name'
    if (startDate && endDate && endDate < startDate) errs.dates = 'It ends before it starts'
    if (shareable && requireApproval && threshold !== undefined && threshold <= 0) errs.threshold = 'Enter an amount above zero'
    if (shareable && requireApproval && editAuto && editAmount !== undefined && editAmount <= 0) errs.editAuto = 'Enter an amount above zero'
    if (budget !== undefined && budget <= 0) errs.budget = 'A budget must be above zero'
    return errs
  }

  const save = async () => {
    const finalName = name.trim() || (type === 'personal' ? 'My spending' : type === 'direct' ? (others[0]?.[1].name ?? '') : '')
    const errs = validate(finalName)
    if (!existing && others.length > maxOthers) return toast(type === 'direct' ? 'A 1:1 is you and one friend' : 'A personal wallet is just you', 'err')
    if (Object.keys(errs).length) {
      setErrors(errs)
      if (errs.name) nameRef.current?.focus()
      else {
        setMoreOpen(true)
        requestAnimationFrame(() =>
          document
            .getElementById(errs.budget ? 'group-budget' : errs.dates ? 'trip-start' : errs.threshold ? 'approval-threshold' : 'edit-auto-approve')
            ?.focus(),
        )
      }
      return
    }
    // A personal wallet only ever holds you, whatever was typed before switching to it.
    const saved = type === 'personal' && !existing ? Object.fromEntries(Object.entries(members).filter(([, m]) => m.uid === user.uid)) : members
    setBusy(true)
    try {
      const data = {
        name: finalName,
        emoji,
        type,
        currency,
        budget,
        simplify,
        members: saved,
        startDate: showDates ? startDate || undefined : undefined,
        endDate: showDates ? endDate || undefined : undefined,
        // A new group stores its threshold, so one in a currency off the default table keeps the converted figure.
        ...(shareable
          ? {
              requireApproval: requireApproval || undefined,
              approvalThreshold: requireApproval ? (threshold ?? (existing ? undefined : suggested)) : undefined,
              editAutoApprove: requireApproval && editAuto ? (editAmount ?? suggestedEdit) : undefined,
            }
          : {}),
        memberUids: [
          ...new Set(
            Object.values(saved)
              .map((m) => m.uid)
              .filter(Boolean) as string[],
          ),
        ],
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
        const id = await createGroup({ ...data, createdBy: user.uid } as Omit<Group, 'id' | 'createdAt' | 'updatedAt' | 'inviteCode'>)
        toast(type === 'personal' ? 'Wallet created' : 'Group created')
        // ?next=add: opened from Add expense, so go straight back there with the new group picked.
        nav(params.get('next') === 'add' ? `/add?group=${id}` : `/groups/${id}`, { replace: true })
      }
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const FieldError = ({ id, text }: { id: string; text?: string }) =>
    text ? (
      <p id={id} role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-400">
        {text}
      </p>
    ) : null

  return (
    <div>
      <PageHeader title={existing ? 'Edit group' : type === 'direct' ? 'New 1:1' : type === 'personal' ? 'Personal wallet' : 'New group'} back />
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        noValidate
      >
        {!existing && (
          <div
            className={`grid gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-ink-800 ${kinds.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
            role="radiogroup"
            aria-label="What are you creating?"
          >
            {kinds.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={kind === k.kind}
                onClick={() => chooseKind(k.kind)}
                className={`min-w-0 rounded-xl px-2.5 py-2.5 text-left transition active:scale-[.98] ${kind === k.kind ? 'accent-live bg-gradient-to-br from-brand-600 to-duo-600 text-white shadow-md shadow-brand-600/25' : 'text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-ink-700'}`}
              >
                <div className="text-xl leading-none" aria-hidden>
                  {k.emoji}
                </div>
                <div className="mt-1.5 truncate text-sm font-bold">{k.label}</div>
                <div className={`truncate text-xs ${kind === k.kind ? 'text-white/90' : 'text-muted'}`}>{k.hint}</div>
              </button>
            ))}
          </div>
        )}
        <div className="card space-y-4 p-4">
          <IconPickerField emoji={emoji} onChange={chooseIcon} emojis={iconsFor(type)} idPrefix="group-icon">
            <label className="label" htmlFor="group-name">
              Name
            </label>
            <input
              ref={nameRef}
              id="group-name"
              className={`input ${errors.name ? 'ring-2 ring-rose-500' : ''}`}
              placeholder={info.placeholder}
              value={name}
              onChange={(e) => onName(e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'group-name-error' : undefined}
            />
          </IconPickerField>
          <FieldError id="group-name-error" text={errors.name} />
          {showGuess && guess && (
            <TypeSuggestion
              guess={guess}
              onDismiss={() => setDismissed(guessKey)}
              onApply={() => {
                setTypeTouched(true)
                setIconTouched(true)
                applyType(guess.type, guess.emoji)
              }}
            />
          )}
          {typeChips && (
            <div role="radiogroup" aria-labelledby="group-type-label">
              <div className="label" id="group-type-label">
                Type
              </div>
              <div className="flex flex-wrap gap-2">
                {SHARED_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    onClick={() => chooseType(t)}
                    className={`chip min-h-10 ${type === t ? 'chip-on' : ''}`}
                  >
                    <span aria-hidden>{GROUP_TYPES[t].emoji}</span> {GROUP_TYPES[t].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {type !== 'personal' && (
          <div className="card p-4">
            <div className="label">Members</div>
            <ul className="space-y-2">
              {Object.entries(members).map(([id, m]) => {
                const used = usedIn.get(id)
                return (
                  <li key={id} className="flex items-center gap-3">
                    <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {m.name} {m.uid === user.uid && <span className="text-muted text-xs">(you)</span>}
                      </div>
                      <div className="text-muted truncate text-xs">
                        {m.uid ? 'Joined' : m.email ? `${m.email} · not joined yet` : 'Not joined yet. Share the invite link'}
                      </div>
                    </div>
                    {m.uid !== user.uid &&
                      (used ? (
                        <span className="text-muted shrink-0 text-xs" title={`In ${used} expense${used === 1 ? '' : 's'} or payment${used === 1 ? '' : 's'}`}>
                          in {used} expense{used === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMembers(({ [id]: _, ...rest }) => rest)}
                          className="text-muted -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:text-rose-600"
                          aria-label={`Remove ${m.name}`}
                        >
                          <X size={18} aria-hidden />
                        </button>
                      ))}
                  </li>
                )
              })}
            </ul>
            {others.length < maxOthers && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-white/5">
                {recent.length > 0 && (
                  <div>
                    <div className="relative">
                      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                      <input
                        className="input !pl-10"
                        type="search"
                        autoComplete="off"
                        placeholder="Search people or type an email"
                        aria-label="Search people"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onSearchKey}
                      />
                    </div>
                    {searching ? (
                      <div
                        className="mt-1.5 divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:divide-white/5 dark:ring-ink-700"
                        data-testid="people-results"
                      >
                        {results.map((k, i) => (
                          <button
                            key={k.uid ?? k.name}
                            type="button"
                            onClick={() => addKnown(k)}
                            className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-ink-800"
                            aria-label={`Add ${k.name}`}
                          >
                            <Avatar name={k.name} color={colorFor(i + 1)} photoURL={k.photoURL} size={28} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{k.name}</div>
                              {k.email && <div className="text-muted truncate text-xs">{k.email}</div>}
                            </div>
                            <Plus size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
                          </button>
                        ))}
                        {inviteEmail && (
                          <button
                            type="button"
                            onClick={() => addByEmail(inviteEmail)}
                            className="flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-ink-800"
                          >
                            <UserPlus size={18} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
                            <span className="min-w-0 truncate">
                              Add <b>{inviteEmail}</b>
                            </span>
                          </button>
                        )}
                        {!results.length && !inviteEmail && (
                          <div className="text-muted px-3 py-2.5 text-sm">No one by that name. Add them below, or type their email.</div>
                        )}
                      </div>
                    ) : (
                      suggestions.length > 0 && (
                        <>
                          <div className="text-muted mb-0.5 mt-2.5 text-xs font-medium">From your recent groups</div>
                          {/* py-1: overflow-x-auto clips the chips' rings otherwise */}
                          <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-1" data-testid="known-people">
                            {suggestions.map((k) => (
                              <button
                                key={k.uid ?? k.name}
                                type="button"
                                onClick={() => addKnown(k)}
                                className="chip min-h-10 shrink-0"
                                aria-label={`Add ${k.name}`}
                              >
                                <Plus size={14} aria-hidden /> {k.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )
                    )}
                  </div>
                )}
                <label htmlFor="member-name" className="sr-only">
                  Name of a person to add
                </label>
                <input
                  id="member-name"
                  className="input"
                  placeholder="Name"
                  autoComplete="off"
                  autoCapitalize="words"
                  enterKeyHint="done"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMember())}
                />
                <div className="flex gap-2">
                  <label htmlFor="member-email" className="sr-only">
                    Their email (optional)
                  </label>
                  <input
                    id="member-email"
                    className="input"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    autoCapitalize="none"
                    placeholder="Email (optional)"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                  <button type="button" className="btn-secondary shrink-0" onClick={addMember} disabled={!newName.trim()}>
                    Add
                  </button>
                </div>
                <p className="text-muted text-xs">Add people now and log expenses straight away. They can claim their spot later with the invite link.</p>
              </div>
            )}
          </div>
        )}

        <Collapsible title="More options" summary={moreSummary} open={moreOpen} onOpenChange={setMoreOpen} className="!mt-0" testId="group-more">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label" id="group-currency-label">
                  Currency
                </div>
                <Select
                  aria-label="Currency"
                  value={currency}
                  onChange={(c) => void changeCurrency(c)}
                  options={currencyOptions(CURRENCIES)}
                  disabled={currencyLocked}
                />
                {currencyLocked && <p className="text-muted mt-1 text-xs">Only the creator can change it while approval amounts are set.</p>}
              </div>
              <div>
                <label className="label" htmlFor="group-budget">
                  Budget (optional)
                </label>
                <MoneyInput
                  id="group-budget"
                  value={budget}
                  currency={currency}
                  onChange={(v) => {
                    setBudget(v)
                    clearError('budget')
                  }}
                  aria-label="Budget"
                  aria-invalid={!!errors.budget}
                  aria-describedby={errors.budget ? 'group-budget-error' : undefined}
                />
                <FieldError id="group-budget-error" text={errors.budget} />
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
                    <label htmlFor="trip-start" className="text-muted mb-1 block text-xs font-medium">
                      Start
                    </label>
                    <DateField
                      id="trip-start"
                      aria-label="Start date"
                      placeholder="Add date"
                      clearable
                      value={startDate}
                      max={endDate || undefined}
                      onChange={(v) => {
                        setDatesTouched(true)
                        setStartDate(v)
                        clearError('dates')
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="trip-end" className="text-muted mb-1 block text-xs font-medium">
                      End
                    </label>
                    <DateField
                      id="trip-end"
                      aria-label="End date"
                      placeholder="Add date"
                      clearable
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(v) => {
                        setDatesTouched(true)
                        setEndDate(v)
                        clearError('dates')
                      }}
                    />
                  </div>
                </div>
                <FieldError id="trip-dates-error" text={errors.dates} />
                <p className="text-muted mt-1.5 text-xs">While it’s on, new expenses and captured payments default to this group.</p>
                {(startDate || endDate) && (
                  <p className="text-muted mt-1 text-xs">
                    Tip: forward bank and UPI debit SMS to this trip with{' '}
                    {existing ? (
                      <Link to={`/settings/auto-capture?group=${existing.id}`} className="font-semibold text-brand-600 dark:text-brand-300">
                        SMS auto-capture
                      </Link>
                    ) : (
                      <b>SMS auto-capture</b>
                    )}
                    {existing ? '' : ' (on the group page after saving)'}.
                  </p>
                )}
              </div>
            )}
            {type !== 'personal' && (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
                <div id="simplify-label">
                  <div className="font-semibold">Simplify debts</div>
                  <div className="text-muted text-xs">Fewer payments: if A owes B and B owes C, A pays C directly.</div>
                </div>
                <Switch checked={simplify} onChange={setSimplify} label="Simplify debts" testId="group-simplify" />
              </div>
            )}
            {shareable && (
              <div className="rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">Needs your OK for big expenses</div>
                    <div className="text-muted text-xs">
                      In this group, a big expense added by someone else stays pending (not counted) until everyone charged taps Approve.
                    </div>
                  </div>
                  <Switch
                    checked={requireApproval}
                    onChange={turnApproval}
                    label="Require approval for big expenses"
                    testId="group-approval"
                    disabled={!canSetApproval}
                  />
                </div>
                {requireApproval && (
                  <div className="mt-3">
                    <label className="label" htmlFor="approval-threshold">
                      Needs an OK above
                    </label>
                    <MoneyInput
                      id="approval-threshold"
                      value={threshold}
                      currency={currency}
                      placeholder={centsToInput(suggested, currency)}
                      disabled={!canSetApproval}
                      onChange={(v) => {
                        setThreshold(v)
                        setThresholdTouched(true)
                        clearError('threshold')
                      }}
                      aria-invalid={!!errors.threshold}
                      aria-describedby={errors.threshold ? 'approval-threshold-error' : 'approval-threshold-hint'}
                      data-testid="group-approval-threshold"
                    />
                    <p id="approval-threshold-hint" className="text-muted mt-1 text-xs">
                      In this group, a new expense above {shortMoney(threshold ?? suggested, currency)} waits for an OK. At or below it counts straight away.
                      {threshold === undefined && ` Empty means the default for ${currency}.`}
                    </p>
                    <FieldError id="approval-threshold-error" text={errors.threshold} />
                  </div>
                )}
                {requireApproval && (
                  <div className="mt-4 border-t border-slate-200 pt-3 dark:border-white/10">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold">Approve small edits automatically</div>
                        <div className="text-muted text-xs">
                          In this group, when someone edits an expense that needs an OK, a change of up to this amount keeps its approvals. A bigger change asks
                          everyone again.
                        </div>
                      </div>
                      <Switch
                        checked={editAuto}
                        onChange={turnEditAuto}
                        label="Approve small edits automatically"
                        testId="group-edit-auto"
                        disabled={!canSetApproval}
                      />
                    </div>
                    {editAuto && (
                      <div className="mt-3">
                        <label className="label" htmlFor="edit-auto-approve">
                          Changes of up to
                        </label>
                        <MoneyInput
                          id="edit-auto-approve"
                          value={editAmount}
                          currency={currency}
                          placeholder={centsToInput(suggestedEdit, currency)}
                          disabled={!canSetApproval}
                          onChange={(v) => {
                            setEditAmount(v)
                            setEditAmountTouched(true)
                            clearError('editAuto')
                          }}
                          aria-invalid={!!errors.editAuto}
                          aria-describedby={errors.editAuto ? 'edit-auto-approve-error' : undefined}
                          data-testid="group-edit-auto-amount"
                        />
                        <FieldError id="edit-auto-approve-error" text={errors.editAuto} />
                      </div>
                    )}
                  </div>
                )}
                {requireApproval && canSetApproval && <p className="text-muted mt-3 text-xs">Changing the currency converts these amounts.</p>}
                {!canSetApproval && <p className="text-muted mt-3 text-xs">Only the person who created the group can change these.</p>}
              </div>
            )}
          </div>
        </Collapsible>

        <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="group-save">
          {existing ? 'Save changes' : type === 'direct' ? 'Create 1:1' : type === 'personal' ? 'Create wallet' : 'Create group'}
        </button>
        {!existing && shared && (
          <Link to="/groups/import" className="text-muted flex min-h-11 items-center justify-center text-sm font-semibold">
            Switching from Splitwise? Import a group
          </Link>
        )}
        {existing && <DeleteGroupButton group={existing} />}
      </form>
    </div>
  )
}
