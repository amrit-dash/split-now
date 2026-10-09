import { useMemo, useState, type KeyboardEvent } from 'react'
import { Plus, Search, UserPlus } from 'lucide-react'
import type { Group, Member } from '@/types'
import { colorFor } from '@/lib/colors'
import { isEmail, knownPeople, nameFromEmail, recentPeople, searchPeople, type KnownPerson } from '@/lib/people'
import { Avatar } from '@/components/Avatar'

/** Whether a known person is already one of `members` (same account, or the same name). */
export const isAddedTo = (members: Record<string, Member>) => (k: KnownPerson) =>
  Object.values(members).some((m) => (k.uid && m.uid === k.uid) || m.name.trim().toLowerCase() === k.name.toLowerCase())

/**
 * Adding people to a group: search everyone from your other groups (or type an email), pills of
 * people from your recent groups, and a name + optional email for someone new. Used by New group
 * and by a group's Members screen; the caller decides what adding means (a draft list, or a write).
 */
export function MemberPicker({
  groups,
  myUid,
  groupId,
  members,
  onAdd,
  hint = 'Add people now and log expenses straight away. They can claim their spot later with the invite link.',
}: {
  groups: Group[] | null | undefined
  myUid: string
  /** The group being edited, left out of the suggestions. */
  groupId?: string
  /** Who is in already (suggestions skip them). */
  members: Record<string, Member>
  /** `uid` when the person was picked from your other groups and has an account (to recognise someone who left). */
  onAdd: (name: string, email?: string, uid?: string) => void
  hint?: string
}) {
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [query, setQuery] = useState('')
  const isAdded = useMemo(() => isAddedTo(members), [members])

  // Quick-add pills: people from your ~4 most recent groups/1:1s (the full list only grows).
  const recent = useMemo(() => recentPeople(groups ?? [], myUid, groupId), [groups, myUid, groupId])
  // Search covers everyone from all your groups, built only once you start typing.
  const q = query.trim()
  const searching = q !== ''
  const everyone = useMemo(() => (searching ? knownPeople(groups ?? [], myUid, groupId) : null), [searching, groups, myUid, groupId])
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
  const suggestions = recent.filter((k) => !isAdded(k)).slice(0, 12)

  const addKnown = (k: KnownPerson) => {
    onAdd(k.name, k.email, k.uid)
    setQuery('')
  }
  const addByEmail = (email: string) => {
    onAdd(nameFromEmail(email), email)
    setQuery('')
  }
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (results.length === 1) addKnown(results[0])
    else if (inviteEmail) addByEmail(inviteEmail)
  }
  const addTyped = () => {
    if (!newName.trim()) return
    onAdd(newName.trim(), newEmail.trim() || undefined)
    setNewName('')
    setNewEmail('')
  }

  return (
    <div className="space-y-2">
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
                {/* py-1: overflow-x-auto clips the chips' rings otherwise. The row scrolls inside a small
                    inset (half the card's padding) rather than to the card's edge; the ::after spacer
                    keeps that inset at the end too (Safari drops a scroll row's right padding). */}
                <div
                  className="scrollbar-none -mx-2 flex gap-2 overflow-x-auto px-2 py-1 after:block after:w-px after:shrink-0 after:content-['']"
                  data-testid="known-people"
                >
                  {suggestions.map((k) => (
                    <button key={k.uid ?? k.name} type="button" onClick={() => addKnown(k)} className="chip min-h-10 shrink-0" aria-label={`Add ${k.name}`}>
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
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTyped())}
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
        <button type="button" className="btn-secondary shrink-0" onClick={addTyped} disabled={!newName.trim()} data-testid="member-add">
          Add
        </button>
      </div>
      {hint && <p className="text-muted text-xs">{hint}</p>}
    </div>
  )
}
