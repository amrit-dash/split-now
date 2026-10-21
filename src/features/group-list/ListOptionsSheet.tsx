import { type ReactNode, useId, useState } from 'react'
import { ChevronDown, UserRound } from 'lucide-react'
import type { Category, Group, MemberId } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { labelOf } from '@/lib/shortNames'
import { type ActivityFilter, DEFAULT_SORT, type RowKind, SORT_OPTIONS, type SortKey } from '@/lib/filter'
import { todayISO } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { DateField } from '@/components/DateField'
import { Segmented } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'

/**
 * Sort and filter for a group's Expenses list: the order (date spent, date added, amount), Quick
 * filters (Involving me and the categories in use, one sideways row), and which rows (expenses or
 * payments, who paid, between two days). Sort by starts folded, its choice in the header.
 * Search stays on the list; changes apply at once, and what's on shows as pills under the search.
 */
export function ListOptionsSheet({
  open,
  onClose,
  group,
  order,
  me,
  sort,
  onSort,
  filter,
  onFilter,
  personal,
  quick,
}: {
  open: boolean
  onClose: () => void
  group: Group
  order: MemberId[]
  me?: MemberId
  sort: SortKey
  onSort: (s: SortKey) => void
  filter: ActivityFilter
  onFilter: (patch: Partial<ActivityFilter>) => void
  personal: boolean
  /** Quick filters: Involving me (shared groups, when you're in it) and the categories in use */
  quick: { showMe: boolean; onlyMe: boolean; onOnlyMe: (on: boolean) => void; categories: Category[] }
}) {
  const reset = () => {
    onSort(DEFAULT_SORT)
    onFilter({ kind: 'all', paidBy: undefined, from: undefined, to: undefined, categories: [] })
    quick.onOnlyMe(false)
  }
  const catLabel = (c: Category) => CATEGORIES[c].label
  const hasQuick = quick.showMe || quick.categories.length > 0
  const toggleCat = (c: Category) =>
    onFilter({ categories: filter.categories.includes(c) ? filter.categories.filter((x) => x !== c) : [...filter.categories, c] })
  return (
    <Sheet open={open} onClose={onClose} title="Sort and filter" testId="list-options">
      <Fold title="Sort by" summary={SORT_OPTIONS.find((o) => o.value === sort)?.label} testId="list-sort">
        <div className="-mx-2 divide-y divide-slate-100 dark:divide-white/5" role="radiogroup" aria-label="Sort by">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={sort === o.value}
              onClick={() => onSort(o.value)}
              className="flex min-h-12 w-full items-center gap-3 px-2 text-left text-sm"
              data-testid={`sort-${o.value}`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${sort === o.value ? 'border-brand-600 dark:border-brand-300' : 'border-slate-300 dark:border-slate-600'}`}
                aria-hidden
              >
                {sort === o.value && <span className="h-2.5 w-2.5 rounded-full bg-brand-600 dark:bg-brand-300" />}
              </span>
              <span className={sort === o.value ? 'font-semibold' : ''}>{o.label}</span>
            </button>
          ))}
        </div>
      </Fold>

      {hasQuick && (
        <div className="mt-4">
          <div className="label">Quick filters</div>
          {/* One sideways-scrolling row, as it was on the list, edge to edge with the sheet's padding inside. */}
          <div className="scrollbar-none -mx-5 flex gap-1.5 overflow-x-auto px-5 py-1 sm:-mx-6 sm:px-6" data-testid="list-quick">
            {quick.showMe && (
              <button
                type="button"
                onClick={() => quick.onOnlyMe(!quick.onlyMe)}
                className={`chip min-h-10 shrink-0 whitespace-nowrap ${quick.onlyMe ? 'chip-on' : ''}`}
                aria-pressed={quick.onlyMe}
                data-testid="quick-me"
              >
                <UserRound size={15} aria-hidden />
                Involving me
              </button>
            )}
            {quick.categories.map((c) => {
              const on = filter.categories.includes(c)
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => toggleCat(c)}
                  className={`chip min-h-10 shrink-0 whitespace-nowrap ${on ? 'chip-on' : ''}`}
                  aria-pressed={on}
                  data-testid={`quick-cat-${c}`}
                >
                  <span aria-hidden>{CATEGORIES[c].emoji}</span>
                  {catLabel(c)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!personal && (
        <div className="mt-4">
          <div className="label">Show</div>
          <Segmented<RowKind>
            value={filter.kind ?? 'all'}
            onChange={(kind) => onFilter({ kind })}
            label="Show"
            testId="list-kind"
            options={[
              { value: 'all', label: 'Everything' },
              { value: 'expenses', label: 'Expenses' },
              { value: 'payments', label: 'Payments' },
            ]}
          />
        </div>
      )}

      {!personal && (
        <fieldset className="mt-4">
          <legend className="label">Paid by</legend>
          <div className="flex flex-wrap gap-2">
            {order.map((id) => {
              const m = group.members[id]
              const on = filter.paidBy === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onFilter({ paidBy: on ? undefined : id })}
                  className={`flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium ring-1 ${on ? 'bg-brand-50 font-semibold text-brand-800 ring-brand-500 dark:bg-brand-500/15 dark:text-brand-100' : 'ring-slate-200 dark:ring-white/10'}`}
                >
                  <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={28} />
                  {id === me ? 'Me' : labelOf(group.members, id, m.name, me)}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-4">
        <div className="label">Spent between</div>
        <div className="grid grid-cols-2 gap-3">
          <DateField
            aria-label="From"
            placeholder="Any day"
            clearable
            value={filter.from ?? ''}
            max={filter.to || todayISO()}
            onChange={(v) => onFilter({ from: v || undefined })}
          />
          <DateField
            aria-label="To"
            placeholder="Any day"
            clearable
            value={filter.to ?? ''}
            min={filter.from}
            onChange={(v) => onFilter({ to: v || undefined })}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={reset} data-testid="list-reset">
          Reset
        </button>
        <button type="button" className="btn-primary" onClick={onClose} data-testid="list-done">
          Done
        </button>
      </div>
    </Sheet>
  )
}

/**
 * A folded section of the sheet: its name, and what's chosen in it, on one header row; the
 * options open under it (grid-rows height animation, off with reduced motion).
 */
function Fold({ title, summary, children, testId }: { title: string; summary?: ReactNode; children: ReactNode; testId: string }) {
  const [open, setOpen] = useState(false)
  const body = useId()
  return (
    <section className="border-b border-slate-100 dark:border-white/5" data-testid={testId}>
      <button
        type="button"
        className="flex min-h-12 w-full items-center gap-3 text-left"
        aria-expanded={open}
        aria-controls={body}
        onClick={() => setOpen(!open)}
      >
        <span className="label !mb-0 shrink-0">{title}</span>
        <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-brand-700 dark:text-brand-200" data-testid={`${testId}-summary`}>
          {summary}
        </span>
        <ChevronDown size={18} className={`text-muted shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div
        id={body}
        className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </section>
  )
}
