import { HandCoins, Lock, UserPlus } from 'lucide-react'
import type { Group } from '@/types'
import { useExpenses } from '@/hooks/data'
import { activeMembers } from '@/lib/members'
import { currencySymbol, gibberish, scrambledAmount } from '@/lib/vault-scramble'
import { PageHeader } from '@/components/Misc'
import { usePageTitle } from '@/lib/brand'
import { AnimalStack, LockedTile } from './Scrambled'
import { PatternLock } from './PatternLock'

/** How many made-up rows the locked list shows at most. */
const ROWS = 12

/**
 * A private group that is locked on this device (docs/VAULT.md). Only its card and its expense
 * list, both scrambled: a lock for its icon, letters for its name and words, animals for its
 * people and symbols for its amounts. No tabs, chat, settings or members; Invite and Settle up
 * are off. The pattern goes in on the lock button itself (PatternLock), with nothing on screen to
 * say so: the universal pattern or the group's own one, either opening only this group.
 */
export function VaultLock({ group, back = '/groups' }: { group: Group; back?: string }) {
  usePageTitle('Private group')
  const expenses = useExpenses(group.id)
  const people = Object.keys(activeMembers(group.members)).length
  const sym = currencySymbol(group.currency)
  const rows = (expenses ?? []).slice(0, ROWS)
  return (
    <>
      <PageHeader
        title={gibberish(group.id, 14)}
        back={back}
        right={
          <PatternLock
            groupId={group.id}
            label="Private group"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/70 dark:bg-ink-800"
            testId="vault-unlock-open"
          >
            <Lock size={20} aria-hidden />
          </PatternLock>
        }
      />
      <div className="card p-5" data-testid="vault-lock">
        <div className="flex items-center gap-3">
          <LockedTile size={52} />
          <div className="min-w-0 flex-1" aria-hidden>
            <div className="text-muted truncate text-lg font-bold">{gibberish(group.id, 14)}</div>
            <div className="mt-1">
              <AnimalStack seed={group.id} count={people} size={24} />
            </div>
          </div>
        </div>
        <div className="mt-4" aria-hidden>
          <div className="text-muted text-xs font-medium">{gibberish(`${group.id}:who`, 9).toLowerCase()}</div>
          <div className="text-muted text-3xl font-bold tabular-nums">{scrambledAmount(group.id, sym)}</div>
        </div>
        <p className="sr-only">Private group, locked.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn" disabled aria-label="Invite (unlock the group first)">
            <UserPlus size={18} aria-hidden /> Invite
          </button>
          <button type="button" className="btn" disabled aria-label="Settle up (unlock the group first)">
            <HandCoins size={18} aria-hidden /> Settle up
          </button>
        </div>
      </div>
      {rows.length > 0 && (
        <ul className="card mt-4 divide-y divide-slate-100 overflow-hidden dark:divide-white/5" aria-hidden data-testid="vault-lock-list">
          {rows.map((e) => (
            <li key={e.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-slate-100 dark:bg-ink-800" />
              <span className="min-w-0 flex-1">
                <span className="text-muted block truncate font-semibold">{gibberish(e.id, 16)}</span>
                <span className="text-muted block truncate text-xs">{gibberish(`${e.id}:by`, 12).toLowerCase()}</span>
              </span>
              <span className="text-muted font-bold tabular-nums">{scrambledAmount(e.id, sym)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
