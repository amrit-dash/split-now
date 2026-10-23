import { useId } from 'react'
import { UserIcon } from '@/components/icons'
import type { Category, Group, MemberId } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { labelOf } from '@/lib/shortNames'
import { type ActivityFilter, DEFAULT_SORT, type RowKind, SORT_OPTIONS, type SortKey } from '@/lib/filter'
import { todayISO } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { DateField } from '@/components/DateField'
import { Segmented } from '@/components/Misc'
import { Select } from '@/components/Select'
import { Sheet } from '@/components/Sheet'
import { useEdgeFade } from '@/hooks/useEdgeFade'

/**
 * Sort and filter for a group's Expenses list: the order (date spent, date added, amount), Quick
 * filters (Involving me and the categories in use, one sideways row), and which rows (expenses or
 * payments, who paid, between two days). Sort by is a dropdown at the top.
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
  const fade = useEdgeFade()
  const sortId = useId()
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
      {/* A dropdown, not a fold of radios (owner, 22 Oct 2026): one line, the choice always in view. */}
      <div data-testid="list-sort">
        <label className="label" htmlFor={sortId}>
          Sort by
        </label>
        <Select
          id={sortId}
          aria-label="Sort by"
          value={sort}
          onChange={onSort}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label, text: o.label }))}
        />
      </div>

      {hasQuick && (
        <div className="mt-4">
          <div className="label">Quick filters</div>
          {/* One sideways-scrolling row, as it was on the list, edge to edge with the sheet's padding inside. */}
          <div ref={fade} className="scrollbar-none -mx-5 flex gap-1.5 overflow-x-auto px-5 py-1 sm:-mx-6 sm:px-6" data-testid="list-quick">
            {quick.showMe && (
              <button
                type="button"
                onClick={() => quick.onOnlyMe(!quick.onlyMe)}
                className={`chip min-h-10 shrink-0 whitespace-nowrap ${quick.onlyMe ? 'chip-on' : ''}`}
                aria-pressed={quick.onlyMe}
                data-testid="quick-me"
              >
                <UserIcon size={16} aria-hidden />
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
