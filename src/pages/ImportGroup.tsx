import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Download, FileUp, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { myMemberId, useGroups } from '@/hooks/data'
import type { Expense, Group, GroupType, Member, MemberId, Settlement } from '@/types'
import { CURRENCIES, formatMoney } from '@/lib/money'
import { colorFor } from '@/lib/colors'
import { uid } from '@/lib/id'
import { groupNameFromFilename, parseImportCsv, ImportError, type ImportResult } from '@/lib/import-splitwise'
import { Avatar } from '@/components/Avatar'
import { PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { appLocale } from '@/lib/locale'
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
  const [busy, setBusy] = useState(false)

  const targets = (groups ?? []).filter((g) => g.type !== 'personal' && g.type !== 'direct')
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
      return { error: e instanceof ImportError ? e.message : `Couldn’t read this file: ${(e as Error).message}` }
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

  const run = async () => {
    if (!result || problems.length) return
    setBusy(true)
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
        groupId = await repo.createGroup({
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
        for (const [id, m] of newcomers) await repo.addMember(target, id, m)
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
      await repo.bulkImport(groupId, expenses, settlements)
      toast(`Imported ${expenses.length} expense${expenses.length === 1 ? '' : 's'} and ${settlements.length} payment${settlements.length === 1 ? '' : 's'} 🎉`)
      nav(`/groups/${groupId}`, { replace: true })
    } catch (e) {
      toast((e as Error).message, 'err')
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Import a group" subtitle="From Splitwise, or a Split Now CSV" back />
      <div className="space-y-5">
        <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain,application/vnd.ms-excel" className="hidden" data-testid="import-file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />

        {!file ? (
          <>
            <button className="card flex w-full flex-col items-center gap-2 border-2 border-dashed border-brand-300 px-6 py-10 text-center dark:border-brand-800" onClick={() => fileInput.current?.click()}>
              <FileUp className="text-brand-600" size={36} />
              <div className="text-lg font-bold">Choose a CSV file</div>
              <div className="text-sm text-slate-500">Your Splitwise group export. Nothing is uploaded until you tap Import.</div>
            </button>
            <div className="card space-y-2 p-4 text-sm text-slate-600 dark:text-slate-300">
              <div className="font-semibold text-slate-900 dark:text-white">How to export from Splitwise</div>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Open the group on <b>splitwise.com</b> (or in the app, tap the group’s ⚙️ settings).</li>
                <li>Choose <b>Export as spreadsheet</b>. You’ll get a CSV with every expense and payment.</li>
                <li>Pick that file here. Balances are checked against Splitwise’s own totals before anything is saved.</li>
              </ol>
            </div>
          </>
        ) : (
          <div className="card flex items-center gap-3 p-4">
            <FileUp className="shrink-0 text-brand-600" size={22} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{file.name}</div>
              {result && <div className="text-xs text-slate-500">{result.source === 'splitwise' ? 'Splitwise export' : 'Split Now export'}</div>}
            </div>
            <button className="rounded-full p-2 text-slate-400" aria-label="Choose another file" onClick={() => { setFile(null); setName(''); setCurrency(''); setMapping({}) }}><X size={18} /></button>
          </div>
        )}

        {parsed.error && <div className="card border border-rose-200 p-4 text-sm text-rose-600 dark:border-rose-900">{parsed.error}</div>}

        {result && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center" data-testid="import-summary">
              <Stat label="people" value={result.members.length} />
              <Stat label={result.expenses.length === 1 ? 'expense' : 'expenses'} value={result.expenses.length} />
              <Stat label={result.payments.length === 1 ? 'payment' : 'payments'} value={result.payments.length} />
            </div>
            {result.dateRange && <p className="-mt-2 text-center text-xs text-slate-500">{fmtDay(result.dateRange.from)} – {fmtDay(result.dateRange.to)}</p>}

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4">
                <div className="label !mb-0">Final balances</div>
                {result.totalsMatch === true && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600" data-testid="totals-match"><Check size={14} strokeWidth={3} /> Matches Splitwise</span>}
                {result.totalsMatch === false && <span className="flex items-center gap-1 text-xs font-semibold text-rose-600"><AlertTriangle size={14} /> Doesn’t match</span>}
              </div>
              <table className="mt-2 w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr><th className="px-4 py-1 text-left font-medium">Person</th><th className="px-2 py-1 text-right font-medium">After import</th>{result.totals && <th className="px-4 py-1 text-right font-medium">Splitwise</th>}</tr>
                </thead>
                <tbody>
                  {result.members.map((m) => {
                    const v = result.balances[m] ?? 0
                    const t = result.totals?.[m]
                    return (
                      <tr key={m} className="border-t border-slate-100 dark:border-white/5">
                        <td className="max-w-0 truncate px-4 py-2 font-medium">{m}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${v > 0 ? 'text-emerald-600' : v < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{fmt(v)}</td>
                        {result.totals && <td className="px-4 py-2 text-right tabular-nums">{t === v ? <span className="text-emerald-600">✓</span> : <span className="text-rose-600">{fmt(t ?? 0)}</span>}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="px-4 pb-4 pt-2 text-xs text-slate-500">Positive = is owed money. Splitwise’s file has each person’s net per expense, not who paid what, so each expense is rebuilt as “paid by the people who are owed”. Every balance stays exact.</p>
            </div>

            {result.warnings.length > 0 && (
              <details className="card p-4 text-sm">
                <summary className="flex cursor-pointer items-center gap-2 font-semibold text-amber-600"><AlertTriangle size={16} /> {result.warnings.length} note{result.warnings.length === 1 ? '' : 's'}{result.skipped ? ` · ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped` : ''}</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">{result.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}

            <div className="card space-y-4 p-4">
              <div>
                <label className="label">Import into</label>
                <Select aria-label="Import into" value={into} onChange={setInto} options={[
                  { value: 'new', label: 'A new group', icon: <span className="text-lg">✨</span>, hint: 'Create it from this file' },
                  ...targets.map((g) => ({ value: g.id, text: g.name, label: g.name, icon: <span className="text-lg">{g.emoji}</span>, hint: `${g.currency} · ${Object.keys(g.members).length} people` })),
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
                  <div className="flex flex-wrap gap-2">
                    {SHARED_TYPES.map((t) => (
                      <button key={t} type="button" onClick={() => { setTypeTouched(true); setType(t); if (!iconTouched) setEmoji(GROUP_TYPES[t].emoji) }} className={`chip ${type === t ? 'chip-on' : ''}`}>{GROUP_TYPES[t].emoji} {GROUP_TYPES[t].label}</button>
                    ))}
                  </div>
                  <div>
                    <label className="label">Currency</label>
                    <Select aria-label="Currency" value={cur} onChange={setCurrency} options={currencyOptions([fileCurrency ?? cur, ...CURRENCIES, cur])} />
                    {cur !== fileCurrency && <p className="mt-1.5 text-xs text-amber-600">The file is in {fileCurrency}. Amounts are kept as written, only the currency label changes.</p>}
                  </div>
                </>
              )}
              {target && target.currency !== fileCurrency && (
                <p className="text-xs text-amber-600">{target.name} uses {target.currency}; the file is in {fileCurrency}. Amounts are kept as written.</p>
              )}
            </div>

            <div className="card p-4">
              <div className="label">Who’s who</div>
              <p className="-mt-1 mb-3 text-xs text-slate-500">Pick yourself. Everyone else becomes a placeholder they can claim later with the group’s invite link.</p>
              <div className="space-y-2">
                {result.members.map((n, i) => (
                  <div key={n} className="flex items-center gap-3">
                    <Avatar name={n} color={colorFor(i)} size={36} />
                    <div className="min-w-0 flex-1 truncate font-medium">{n}</div>
                    <div className="w-48 shrink-0">
                      <Select size="sm" aria-label={`Map ${n}`} value={mapping[n] ?? 'new'} onChange={(v) => setMapping((m) => ({ ...m, [n]: v }))} options={[
                        { value: 'me', label: 'Me', hint: profile.displayName },
                        { value: 'new', label: target ? 'New placeholder' : 'Placeholder', hint: 'Can claim later via invite' },
                        ...(target ? Object.entries(target.members).filter(([, m]) => m.uid !== user.uid).map(([id, m]) => ({ value: id, label: m.name, hint: m.uid ? 'Member' : 'Placeholder' })) : []),
                      ]} />
                    </div>
                  </div>
                ))}
              </div>
              {meCount === 0 && <p className="mt-3 text-xs text-amber-600">Nobody is mapped to you. You’ll still be in the group, with no share of these expenses.</p>}
            </div>

            {problems.map((p) => <p key={p} className="text-center text-sm text-rose-600">{p}</p>)}
            <button className="btn-primary w-full" onClick={run} disabled={busy || problems.length > 0}><Download size={18} aria-hidden /> 
              {busy ? 'Importing…' : `Import ${result.expenses.length + result.payments.length} item${result.expenses.length + result.payments.length === 1 ? '' : 's'}`}
            </button>
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
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

const fmtDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric' })

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
