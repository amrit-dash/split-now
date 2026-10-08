import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCheck, Plus, Sparkles, Users } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useAllGroupData, type GroupData } from '@/hooks/data'
import { formatMoney } from '@/lib/money'
import { todayISO, uid } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { Empty, Loading, PageHeader } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'

interface Friend {
  key: string
  name: string
  color: string
  photoURL?: string
  currency: string
  net: number // >0: they owe you
  parts: Array<{ d: GroupData; memberId: string; amount: number }>
}

/** People are matched across groups by their account uid, or by name for people who haven't joined yet. */
function friendKey(m: { uid?: string; name: string }) {
  return m.uid ? `u:${m.uid}` : `n:${m.name.trim().toLowerCase()}`
}

export default function Friends() {
  const data = useAllGroupData()
  const { user } = useMe()
  const toast = useToast()
  const [netting, setNetting] = useState<Friend | null>(null)

  const friends = useMemo(() => {
    if (!data) return null
    const map = new Map<string, Friend>()
    for (const d of data) {
      if (!d.me || d.group.type === 'personal') continue
      for (const debt of d.debts) {
        if (debt.from !== d.me && debt.to !== d.me) continue
        const other = debt.from === d.me ? debt.to : debt.from
        const m = d.group.members[other]
        if (!m) continue
        const key = `${friendKey(m)}|${d.group.currency}`
        const f = map.get(key) ?? { key, name: m.name, color: m.color, currency: d.group.currency, net: 0, parts: [] }
        f.photoURL ??= m.photoURL
        const signed = debt.to === d.me ? debt.amount : -debt.amount
        f.net += signed
        f.parts.push({ d, memberId: other, amount: signed })
        map.set(key, f)
      }
    }
    return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
  }, [data])

  if (!friends) return <Loading />

  const settleAll = async (f: Friend) => {
    // Record one settlement per group so every group's balance clears; the real-world
    // payment is a single transfer of the net amount.
    for (const p of f.parts) {
      const me = p.d.me!
      await repo.saveSettlement({
        id: uid('s_'), groupId: p.d.group.id,
        from: p.amount > 0 ? p.memberId : me, to: p.amount > 0 ? me : p.memberId,
        amount: Math.abs(p.amount), method: 'Cross-group netting',
        note: `Net ${formatMoney(Math.abs(f.net), f.currency)} ${f.net > 0 ? `from ${f.name}` : `to ${f.name}`} across ${f.parts.length} groups`,
        date: todayISO(), createdBy: user.uid, createdAt: Date.now(),
      })
    }
    setNetting(null)
    toast(`Settled with ${f.name} across ${f.parts.length} groups`)
  }

  return (
    <div>
      <PageHeader title="Friends" back subtitle="Your balance with each person, across every group" />
      {friends.length === 0 ? (
        <Empty emoji="🤝" title="You’re all square">
          No one owes anyone. Nice.
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/add" className="btn-primary !min-h-0 !py-2.5 text-sm" data-testid="friends-add"><Plus size={16} /> Add an expense</Link>
            <Link to="/groups" className="btn-secondary !min-h-0 !py-2.5 text-sm"><Users size={16} aria-hidden /> Your groups</Link>
          </div>
        </Empty>
      ) : (
        <div className="space-y-3">
          {friends.map((f) => {
            const multi = f.parts.length > 1
            const mixed = multi && f.parts.some((p) => p.amount > 0) && f.parts.some((p) => p.amount < 0)
            return (
              <div key={f.key} className="card p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={f.name} color={f.color} photoURL={f.photoURL} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{f.name}</div>
                    <div className={`text-sm font-semibold tabular-nums ${f.net > 0 ? 'pos' : f.net < 0 ? 'neg' : 'text-slate-400'}`}>
                      {f.net === 0 ? 'settled overall' : f.net > 0 ? `owes you ${formatMoney(f.net, f.currency)}` : `you owe ${formatMoney(-f.net, f.currency)}`}
                    </div>
                  </div>
                  {multi && <button className="chip chip-on" onClick={() => setNetting(f)}><Sparkles size={14} /> Net out</button>}
                </div>
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-white/5">
                  {f.parts.map((p) => (
                    <Link key={p.d.group.id} to={`/groups/${p.d.group.id}/settle?from=${p.amount > 0 ? p.memberId : p.d.me}&to=${p.amount > 0 ? p.d.me : p.memberId}&amount=${Math.abs(p.amount)}`} className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-ink-800">
                      <span className="truncate">{p.d.group.emoji} {p.d.group.name}</span>
                      <span className={`tabular-nums ${p.amount > 0 ? 'pos' : 'neg'}`}>{formatMoney(p.amount, f.currency, { sign: true })}</span>
                    </Link>
                  ))}
                </div>
                {mixed && <div className="mt-2 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">💡 You owe each other in different groups. Net out to settle everything with <b>one</b> payment of {formatMoney(Math.abs(f.net), f.currency)}.</div>}
              </div>
            )
          })}
        </div>
      )}

      <Sheet open={!!netting} onClose={() => setNetting(null)} title={`Net out with ${netting?.name}`}>
        {netting && (
          <>
            <p className="text-sm text-slate-500">This records a settlement in each group so they all clear. In real life, only one payment happens:</p>
            <div className="my-4 rounded-2xl bg-slate-100 p-4 text-center dark:bg-ink-800">
              <div className="text-sm">{netting.net > 0 ? `${netting.name} pays you` : netting.net < 0 ? `You pay ${netting.name}` : 'No money changes hands'}</div>
              <div className="text-3xl font-extrabold tabular-nums">{formatMoney(Math.abs(netting.net), netting.currency)}</div>
            </div>
            <button className="btn-primary w-full" onClick={() => settleAll(netting)}><CheckCheck size={18} aria-hidden /> Record as settled</button>
          </>
        )}
      </Sheet>
    </div>
  )
}
