import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Download, FileUp, Loader2, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { createGroup, myMemberId, useGroups } from '@/hooks/data'
import type { Expense, Group, GroupType, Member, MemberId, Settlement } from '@/types'
import { usePageTitle } from '@/lib/brand'
import { CURRENCIES, formatMoney } from '@/lib/money'
import { colorFor } from '@/lib/colors'
import { errText } from '@/lib/errors'
import { uid } from '@/lib/id'
import { groupNameFromFilename, parseImportCsv, ImportError, type ImportResult } from '@/lib/import-splitwise'
import { Avatar } from '@/components/Avatar'
import { PageHeader } from '@/components/Misc'
import { OfflinePill } from '@/components/OfflinePill'
import { useToast } from '@/components/Toast'
import { appLocale, formatDate } from '@/lib/locale'
import { Select, currencyOptions } from '@/components/Select'
import { IconPickerField, TypeSuggestion } from '@/components/IconPicker'
import { GROUP_TYPES, SHARED_TYPES, guessGroup, iconsFor, type GroupGuess } from '@/lib/groupTypes'

/** 'me' | an existing member id of the target group | 'new' (a new placeholder) */
type Target = string

/**
 * "Switch from Splitwise in one tap": pick a Splitwise group export (or a Split Now CSV),
 * check the preview and balances against the file's own totals, map people, import.
 */
export default function ImportGroup() {
  usePageTitle('Import a group')
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const groups = useGroups()
  const fileInput = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [currency, setCurrency] = useState('')
  const [into, setInto] = useState<string>(params.get('into') ?? 'new')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(GROUP_TYPES.trip.emoji)
  const [type, setType] = useState<GroupType>('trip')
  // Picked by the user: loading a file or typing a name never overrides these.
  const [typeTouched, setTypeTouched] = useState(false)
  const [iconTouched, setIconTouched] = useState(false)
  const [typedName, setTypedName] = useState(false)
  const [dismissed, setDismissed] = useState('')
  const [mapping, setMapping] = useState<Record<string, Target>>({})
  /** What the import is doing right now; null when idle. */
  const [progress, setProgress] = useState<string | null>(null)
  const busy = progress !== null

  const targets = (groups ?? []).filter((g) => g.type !== 'personal' && g.type !== 'direct' && !g.archived)
  const target: Group | undefined = into === 'new' ? undefined : targets.find((g) => g.id === into)

  // Parse once in the file's currency; re-read amounts if the user picks another currency.
  const parsed = useMemo((): { result?: ImportResult; fileCurrency?: string; error?: string } => {
    if (!file) return {}
    try {
      const first = parseImportCsv(file.text)
      const cur = target?.currency ?? currency
      const result = cur && cur !== first.currency ? { ...parseImportCsv(file.text, { currency: cur }), currency: cur } : first
      return { result, fileCurrency: first.currency }
    } catch (e) {
      return { error: e instanceof ImportError ? e.message : `Couldn’t read this file: ${errText(e)}` }
    }
  }, [file, currency, target?.currency])
  const { result, fileCurrency } = parsed

  /** Type and icon follow a guess only where the user hasn't picked them. */
  const follow = (g: GroupGuess) => {
    if (!typeTouched) setType(g.type)
    if (!iconTouched) setEmoji(typeTouched ? GROUP_TYPES[type].emoji : g.emoji)
  }

  // Defaults when a file is loaded: name from the filename, currency from the file, "me" by name,
  // type from the name ("Goa trip") or else from how long the expenses span.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per picked file
  useEffect(() => {
    if (!file || !parsed.result) return
    const r = parsed.result
    const n = name || groupNameFromFilename(file.name)
    setName(n)
    setCurrency((c) => c || r.currency)
    const days = r.dateRange ? (Date.parse(r.dateRange.to) - Date.parse(r.dateRange.from)) / 86_400_000 : 0
    const g = guessGroup(n) ?? (r.dateRange ? { type: days > 62 ? 'home' as const : 'trip' as const, emoji: days > 62 ? '🏠' : '✈️' } : null)
    if (g) follow(g)
    setMapping((m) => (Object.keys(m).length ? m : defaultMapping(r.members, profile.displayName)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // When the target group changes, re-map to its members by name.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-maps only when the target (or the group list's arrival) changes
  useEffect(() => {
    if (!result) return
    setMapping(defaultMapping(result.members, profile.displayName, target, user.uid))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [into, !!groups])

  const pick = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 5_000_000) return toast('That file is too big for a group export', 'err')
    const text = await f.text()
    setFile({ name: f.name, text })
    setCurrency('')
    setMapping({})
  }

  const onName = (v: string) => {
    setName(v); setTypedName(true)
    const g = guessGroup(v)
    if (g && !typeTouched && !iconTouched) follow(g)
  }
  const guess = typedName ? guessGroup(name) : null
  const guessKey = guess ? `${guess.type}${guess.emoji}` : ''
  const showGuess = !!guess && (typeTouched || iconTouched) && (guess.type !== type || guess.emoji !== emoji) && guessKey !== dismissed

  const cur = target?.currency ?? (currency || result?.currency || profile.currency)
  const fmt = (v: number) => formatMoney(v, cur)

  const used = Object.values(mapping).filter((t) => t !== 'new')
  const dupes = used.length !== new Set(used).size
  const meCount = used.filter((t) => t === 'me').length
  const problems = !result ? [] : [
    ...(dupes ? ['Two people are mapped to the same member'] : []),
    ...(into === 'new' && !name.trim() ? ['Give the group a name'] : []),
  ]
  const itemCount = result ? result.expenses.length + result.payments.length : 0

  const run = async () => {
    if (!result || problems.length) return
    setProgress('Getting ready…')
    try {
      const ids: Record<string, MemberId> = {}
      let groupId: string
      const newcomers: Array<[MemberId, Member]> = []
      if (!target) {
        const members: Record<MemberId, Member> = { [user.uid]: { name: profile.displayName, uid: user.uid, email: user.email, color: colorFor(0) } }
        for (const n of result.members) {
          if (mapping[n] === 'me') { ids[n] = user.uid; continue }
          const id = uid('p_')
          members[id] = { name: n, color: colorFor(Object.keys(members).length) }
          ids[n] = id
        }
        setProgress('Creating the group…')
        groupId = await createGroup({
          name: name.trim(), emoji, type, currency: cur, simplify: true, members,
          memberUids: [user.uid], createdBy: user.uid,
        })
      } else {
        groupId = target.id
        const mine = myMemberId(target, user.uid)
        for (const n of result.members) {
          const t = mapping[n] ?? 'new'
          if (t === 'me' && mine) ids[n] = mine
          else if (t !== 'new' && t !== 'me' && target.members[t]) ids[n] = t
          else {
            const id = uid('p_')
            newcomers.push([id, { name: n, color: colorFor(Object.keys(target.members).length + newcomers.length) }])
            ids[n] = id
          }
        }
        // Membership changes go one per write (rules), so this is the slow part of a big import.
        for (const [i, [id, m]] of newcomers.entries()) {
          setProgress(`Adding people ${i + 1}/${newcomers.length}…`)
          await repo.addMember(target, id, m)
        }
      }

      const now = Date.now()
      const importedFrom = result.source === 'splitwise' ? 'splitwise' as const : 'csv' as const
      const remap = (o: Record<string, number>) => {
        const out: Record<MemberId, number> = {}
        for (const [n, v] of Object.entries(o)) out[ids[n]] = (out[ids[n]] ?? 0) + v
        return out
      }
      const expenses: Expense[] = result.expenses.map((e, i) => {
        const splits = remap(e.splits)
        return {
          id: uid('e_'), groupId, description: e.description.slice(0, 200), amount: e.amount, category: e.category, date: e.date,
          notes: e.notes, paidBy: remap(e.paidBy), splits, splitType: 'exact', splitInput: { exact: splits },
          createdBy: user.uid, createdAt: now + i, updatedAt: now + i, importedFrom,
        }
      })
      const settlements: Settlement[] = result.payments.map((p, i) => ({
        id: uid('s_'), groupId, from: ids[p.from], to: ids[p.to], amount: p.amount,
        method: p.method ?? (result.source === 'splitwise' ? 'Splitwise' : 'Imported'), note: p.description.slice(0, 200), date: p.date,
        createdBy: user.uid, createdAt: now + result.expenses.length + i, importedFrom,
      }))
      setProgress(`Importing ${itemCount} item${itemCount === 1 ? '' : 's'}…`)
      await repo.bulkImport(groupId, expenses, settlements)
      toast(`Imported ${expenses.length} expense${expenses.length === 1 ? '' : 's'} and ${settlements.length} payment${settlements.length === 1 ? '' : 's'}`)
      nav(`/groups/${groupId}`, { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setProgress(null)
    }
  }

  return (
    <div>
      <PageHeader title="Import a group" subtitle="From Splitwise, or a Split Now CSV" back={!busy} />
      <OfflinePill text="Offline — the import is saved on this device and syncs when you’re back" />
      <div className="space-y-5">
        <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain,application/vnd.ms-excel" className="hidden" data-testid="import-file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />

        {!file ? (
          <>
            <button type="button" className="card flex w-full flex-col items-center gap-2 border-2 border-dashed border-brand-300 px-6 py-10 text-center dark:border-brand-800" onClick={() => fileInput.current?.click()}>
              <FileUp className="text-brand-600" size={36} aria-hidden />
              <span className="text-lg font-bold">Choose a CSV file</span>
              <span className="text-muted text-sm">Your Splitwise group export. Nothing is saved until you tap Import.</span>
            </button>
            <div className="card space-y-2 p-4 text-sm text-slate-700 dark:text-slate-300">
              <h2 className="font-semibold text-slate-900 dark:text-white">How to export from Splitwise</h2>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Open the group on <b>splitwise.com</b> (or in the app, tap the group’s settings).</li>
                <li>Choose <b>Export as spreadsheet</b>. You’ll get a CSV with every expense and payment.</li>
                <li>Pick that file here. Balances are checked against Splitwise’s own totals before anything is saved.</li>
              </ol>
            </div>
          </>
        ) : (
          <div className="card flex items-center gap-3 p-4">
            <FileUp className="shrink-0 text-brand-600" size={22} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{file.name}</div>
              {result && <div className="text-muted text-xs">{result.source === 'splitwise' ? 'Splitwise export' : 'Split Now export'}</div>}
            </div>
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 dark:text-slate-400" aria-label="Choose another file" disabled={busy} onClick={() => { setFile(null); setName(''); setCurrency(''); setMapping({}) }}><X size={18} /></button>
          </div>
        )}

        {parsed.error && <div className="card border border-rose-200 p-4 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300" role="alert">{parsed.error}</div>}

        {result && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center" data-testid="import-summary">
              <Stat label="people" value={result.members.length} />
              <Stat label={result.expenses.length === 1 ? 'expense' : 'expenses'} value={result.expenses.length} />
              <Stat label={result.payments.length === 1 ? 'payment' : 'payments'} value={result.payments.length} />
            </div>
            {result.dateRange && <p className="text-muted -mt-2 text-center text-xs">{fmtDay(result.dateRange.from)} – {fmtDay(result.dateRange.to)}</p>}

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4">
                <h2 className="label !mb-0">Final balances</h2>
                {result.totalsMatch === true && <span className="pos flex items-center gap-1 text-xs font-semibold" data-testid="totals-match"><Check size={14} strokeWidth={3} aria-hidden /> Matches Splitwise</span>}
                {result.totalsMatch === false && <span className="neg flex items-center gap-1 text-xs font-semibold"><AlertTriangle size={14} aria-hidden /> Doesn’t match</span>}
              </div>
              <table className="mt-2 w-full text-sm">
                <thead className="text-muted text-xs">
                  <tr><th scope="col" className="px-4 py-1 text-left font-medium">Person</th><th scope="col" className="px-2 py-1 text-right font-medium">After import</th>{result.totals && <th scope="col" className="px-4 py-1 text-right font-medium">Splitwise</th>}</tr>
                </thead>
                <tbody>
                  {result.members.map((m) => {
                    const v = result.balances[m] ?? 0
                    const t = result.totals?.[m]
                    return (
                      <tr key={m} className="border-t border-slate-100 dark:border-white/5">
                        <td className="max-w-0 truncate px-4 py-2 font-medium">{m}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'text-muted'}`}>{fmt(v)}</td>
                        {result.totals && <td className="px-4 py-2 text-right tabular-nums">{t === v ? <span className="pos" role="img" aria-label="Matches">✓</span> : <span className="neg">{fmt(t ?? 0)}</span>}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-muted px-4 pt-2 text-xs">Positive = is owed money. Balances match Splitwise exactly.</p>
              <details className="text-muted px-4 pb-4 pt-1 text-xs">
                <summary className="cursor-pointer font-semibold">How amounts are rebuilt</summary>
                <p className="mt-1">Splitwise’s file has each person’s net per expense, not who paid what, so each expense is rebuilt as “paid by the people who are owed”. Every balance stays exact.</p>
              </details>
            </div>

            {result.warnings.length > 0 && (
              <details className="card p-4 text-sm">
                <summary className="flex cursor-pointer items-center gap-2 font-semibold text-amber-800 dark:text-amber-300"><AlertTriangle size={16} aria-hidden /> {result.warnings.length} note{result.warnings.length === 1 ? '' : 's'}{result.skipped ? ` · ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped` : ''}</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">{result.warnings.slice(0, 50).map((w, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: parser notes have no id and never reorder
                  <li key={i}>{w}</li>
                ))}</ul>
              </details>
            )}

            <div className="card space-y-4 p-4">
              <div>
                <div className="label">Import into</div>
                <Select aria-label="Import into" value={into} onChange={setInto} options={[
                  { value: 'new', label: 'A new group', icon: <span className="text-lg" aria-hidden>✨</span>, hint: 'Create it from this file' },
                  ...targets.map((g) => ({ value: g.id, text: g.name, label: g.name, icon: <span className="text-lg" aria-hidden>{g.emoji}</span>, hint: `${g.currency} · ${Object.keys(g.members).length} people` })),
                ]} />
              </div>
              {!target && (
                <>
                  <IconPickerField emoji={emoji} onChange={(e) => { setIconTouched(true); setEmoji(e) }} emojis={iconsFor(type)} idPrefix="import-icon">
                    <label className="label" htmlFor="import-name">Group name</label>
                    <input id="import-name" className="input" placeholder={GROUP_TYPES[type].placeholder} value={name} onChange={(e) => onName(e.target.value)} />
                  </IconPickerField>
                  {showGuess && guess && (
                    <TypeSuggestion guess={guess} onDismiss={() => setDismissed(guessKey)} onApply={() => { setTypeTouched(true); setIconTouched(true); setType(guess.type); setEmoji(guess.emoji) }} />
                  )}
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Group type">
                    {SHARED_TYPES.map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => { setTypeTouched(true); setType(t); if (!iconTouched) setEmoji(GROUP_TYPES[t].emoji) }} className={`chip ${type === t ? 'chip-on' : ''}`}><span aria-hidden>{GROUP_TYPES[t].emoji}</span> {GROUP_TYPES[t].label}</button>
                    ))}
                  </div>
                  <div>
                    <div className="label">Currency</div>
                    <Select aria-label="Currency" value={cur} onChange={setCurrency} options={currencyOptions([fileCurrency ?? cur, ...CURRENCIES, cur], appLocale())} />
                    {cur !== fileCurrency && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">The file is in {fileCurrency}. Amounts are kept as written, only the currency label changes.</p>}
                  </div>
                </>
              )}
              {target && target.currency !== fileCurrency && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{target.name} uses {target.currency}; the file is in {fileCurrency}. Amounts are kept as written.</p>
              )}
            </div>

            <div className="card p-4">
              <h2 className="label">Who’s who</h2>
              <p className="text-muted -mt-1 mb-3 text-xs">Pick yourself. Everyone else becomes a placeholder they can claim later with the group’s invite link.</p>
              <div className="space-y-2">
                {result.members.map((n, i) => (
                  <div key={n} className="flex items-center gap-3">
                    <Avatar name={n} color={colorFor(i)} size={36} />
                    <div className="min-w-0 flex-1 truncate font-medium">{n}</div>
                    <div className="w-48 shrink-0">
                      <Select size="sm" aria-label={`Who is ${n}`} value={mapping[n] ?? 'new'} onChange={(v) => setMapping((m) => ({ ...m, [n]: v }))} options={[
                        { value: 'me', label: 'Me', hint: profile.displayName },
                        { value: 'new', label: target ? 'New placeholder' : 'Placeholder', hint: 'Can claim later via invite' },
                        ...(target ? Object.entries(target.members).filter(([, m]) => m.uid !== user.uid).map(([id, m]) => ({ value: id, label: m.name, hint: m.uid ? 'Member' : 'Placeholder' })) : []),
                      ]} />
                    </div>
                  </div>
                ))}
              </div>
              {meCount === 0 && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">Nobody is mapped to you. You’ll still be in the group, with no share of these expenses.</p>}
            </div>

            {problems.map((p) => <p key={p} className="neg text-center text-sm" role="alert">{p}</p>)}
            <button type="button" className="btn-primary w-full" onClick={run} disabled={busy || problems.length > 0} data-testid="import-run">
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />}
              {busy ? progress : `Import ${itemCount} item${itemCount === 1 ? '' : 's'}`}
            </button>
            {busy && <p className="text-muted text-center text-xs" role="status">{progress} Keep this screen open.</p>}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-2 py-3">
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="text-muted text-xs">{label}</div>
    </div>
  )
}

const fmtDay = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' })

/** "Me" for the member whose name matches the user's (first name, case-insensitive); others to same-named members of the target. */
function defaultMapping(members: string[], myName: string, target?: Group, myUid?: string): Record<string, Target> {
  const first = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const mine = members.find((n) => n.toLowerCase() === myName.toLowerCase()) ?? members.find((n) => first(n) === first(myName))
  const out: Record<string, Target> = {}
  const taken = new Set<string>()
  for (const n of members) {
    if (n === mine) { out[n] = 'me'; continue }
    const match = target && Object.entries(target.members).find(([id, m]) => m.uid !== myUid && !taken.has(id) && m.name.toLowerCase() === n.toLowerCase())
    if (match) { out[n] = match[0]; taken.add(match[0]) } else out[n] = 'new'
  }
  return out
}
