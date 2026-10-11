import type { Group, MemberId } from '@/types'
import { type ActivityFilter, DEFAULT_SORT, type RowKind, SORT_OPTIONS, type SortKey } from '@/lib/filter'
import { todayISO } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { DateField } from '@/components/DateField'
import { Segmented } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'

/**
 * Sort and filter for a group's Expenses list: the order (date spent, date added, amount), and
 * which rows (expenses or payments, who paid, between two days). Search and the category chips
 * stay on the list itself; changes apply at once.
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
}) {
  const reset = () => {
    onSort(DEFAULT_SORT)
    onFilter({ kind: 'all', paidBy: undefined, from: undefined, to: undefined })
  }
  return (
    <Sheet open={open} onClose={onClose} title="Sort and filter" testId="list-options">
      <fieldset>
        <legend className="label">Sort by</legend>
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
      </fieldset>

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
                  {id === me ? 'Me' : m.name}
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
