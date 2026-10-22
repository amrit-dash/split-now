import { ChevronRight, Search } from 'lucide-react'
import { ChatIcon, LinkIcon, LockIcon, FilterIcon, SettingsIcon } from '@/components/icons'
import type { Expense, Group } from '@/types'
import { useMe } from '@/hooks/auth'
import { useExpenses } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { activeMembers } from '@/lib/members'
import { currencySymbol, gibberish, isSealed, lockedText, scrambledAmount } from '@/lib/vault-scramble'
import { usePageTitle } from '@/lib/brand'
import { ChequeIcon } from '@/components/ChequeIcon'
import { PageHeader, Segmented } from '@/components/Misc'
import { AnimalStack, LockedTile } from './Scrambled'
import { PatternLock } from './PatternLock'
import { useEdgeFade } from '@/hooks/useEdgeFade'

/** How many rows the locked list shows at most. */
const ROWS = 20

/** An expense's description while locked: its own token's characters when it is encrypted, else made up from its id. */
const descriptionOf = (e: Expense) => (isSealed(e.description) ? e.description : gibberish(e.id, 14))

/**
 * A private group that is locked on this device (docs/VAULT.md). The same layout as an open group
 * (GroupDetail): header, card, people, Settle up and Invite, the tabs, the search and the list,
 * with every text and amount scrambled (src/lib/vault-scramble.ts). Encrypted words show as their
 * own ciphertext; names and amounts, which have no token, are made up. Amounts carry the viewer's
 * own currency symbol, not the group's. Nothing here does anything except the lock button, which
 * takes the pattern itself (PatternLock), with nothing on screen to say so.
 */
export function VaultLock({ group, back = '/groups' }: { group: Group; back?: string }) {
  const fade = useEdgeFade()
  usePageTitle('Private group')
  const { profile } = useMe()
  const expenses = useExpenses(group.id)
  const people = Object.keys(activeMembers(group.members)).length
  const sym = currencySymbol(profile.currency)
  const rows = (expenses ?? []).slice(0, ROWS)
  const id = group.id
  // The same tabs and header icons an open group has here (GroupDetail).
  const openItemsOn = useFlag('openItems')
  const chatOn = useFlag('groupChat')
  // One line per other person, as an open group lists who owes whom (up to three).
  const lines = Array.from({ length: Math.min(3, Math.max(1, people - 1)) }, (_, i) => i)
  const iconButton = 'flex h-11 w-11 items-center justify-center rounded-full'
  return (
    <div data-testid="vault-lock">
      <PageHeader
        back={back}
        title={lockedText(group.name, id)}
        right={
          <div className="flex items-center">
            <PatternLock groupId={id} label="Private group" className={`${iconButton} hover:bg-slate-200/60 dark:hover:bg-ink-800`} testId="vault-unlock-open">
              <LockIcon size={20} aria-hidden />
            </PatternLock>
            {chatOn && (
              <span className={iconButton} aria-hidden>
                <ChatIcon size={22} />
              </span>
            )}
            <span className={iconButton} aria-hidden>
              <SettingsIcon size={22} />
            </span>
          </div>
        }
      />

      <div className="card mb-4 p-5" aria-hidden>
        <div className="flex items-center gap-4">
          <LockedTile size={56} />
          <div className="min-w-0 flex-1">
            <div className="text-muted text-sm font-medium">{gibberish(`${id}:who`, 11)}</div>
            <div className="text-3xl font-extrabold tabular-nums">{scrambledAmount(id, sym)}</div>
          </div>
        </div>
        <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          {lines.map((i) => (
            <div key={i}>
              <b>{gibberish(`${id}:p${i}`, 5)}</b> {gibberish(`${id}:v${i}`, 8)} <span className="font-semibold">{scrambledAmount(`${id}:d${i}`, sym)}</span>
            </div>
          ))}
        </div>
        <div className="-mx-1 mt-3 flex min-h-11 items-center gap-2 px-1 text-sm font-medium text-slate-600 dark:text-slate-300">
          <AnimalStack seed={id} count={people} size={26} max={5} />
          <span className="min-w-0 flex-1 truncate">{gibberish(`${id}:people`, 9)}</span>
          <span className="text-muted text-xs">Members</span>
          <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {/* Inert, but not greyed out: a faded button would say the group is locked. */}
          <button type="button" className="btn-primary pointer-events-none whitespace-nowrap" aria-disabled tabIndex={-1}>
            <ChequeIcon size={22} />{' '}
            <span>
              Settle<span className="hidden min-[380px]:inline"> up</span>
            </span>
          </button>
          <button type="button" className="btn-secondary pointer-events-none whitespace-nowrap" aria-disabled tabIndex={-1}>
            <LinkIcon size={18} /> Invite
          </button>
        </div>
      </div>
      <p className="sr-only">Private group, locked.</p>

      <div className="pointer-events-none mb-4" aria-hidden>
        <Segmented
          value="expenses"
          onChange={() => {}}
          options={[
            { value: 'expenses', label: 'Expenses' },
            ...(openItemsOn ? [{ value: 'open', label: 'Open' }] : []),
            { value: 'balances', label: 'Balances' },
            { value: 'activity', label: 'Activity' },
          ]}
        />
      </div>

      <div className="pointer-events-none space-y-5" aria-hidden>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <div className="input text-muted !py-2.5 pl-10">Search expenses</div>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-ink-800 dark:text-slate-300">
            <FilterIcon size={18} />
          </span>
        </div>
        <div ref={fade} className="scrollbar-none -mx-4 -mt-3 flex gap-1.5 overflow-x-auto px-4 py-1">
          <span className="chip min-h-10 shrink-0 whitespace-nowrap">Involving me</span>
          {[0, 1].map((i) => (
            <span key={i} className="chip min-h-10 shrink-0 whitespace-nowrap">
              {gibberish(`${id}:cat${i}`, 9)}
            </span>
          ))}
        </div>
        {rows.length > 0 && (
          <section>
            <h2 className="text-muted mb-2 px-1 text-xs font-bold uppercase tracking-wider">{gibberish(`${id}:month`, 8)}</h2>
            <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" data-testid="vault-lock-list">
              {rows.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <LockedTile size={44} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{descriptionOf(e)}</span>
                    <span className="text-muted block truncate text-xs">
                      {gibberish(`${e.id}:by`, 5)} {gibberish(`${e.id}:v`, 4)} {scrambledAmount(e.id, sym)} · {gibberish(`${e.id}:d`, 6)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-muted text-xs">{gibberish(`${e.id}:you`, 7)}</div>
                    <div className="font-semibold tabular-nums">{scrambledAmount(`${e.id}:share`, sym)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
