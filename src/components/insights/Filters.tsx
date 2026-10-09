import { SlidersHorizontal } from 'lucide-react'
import type { Category, Group } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { type Basis, DEFAULT_FILTERS, type InsightFilters, type RangePreset } from '@/lib/insights'
import { formatDate } from '@/lib/locale'
import { Collapsible } from '@/components/Collapsible'
import { DateField } from '@/components/DateField'
import { Segmented } from '@/components/Misc'

export const RANGES: Array<{ value: RangePreset; label: string }> = [
  { value: 'month', label: 'This month' },
  { value: '3m', label: 'Last 3 months' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
]

export { DEFAULT_FILTERS }

/** One line for the collapsed header: "Last 3 months · All groups · All categories · My share". */
export function filterSummary(f: InsightFilters, groupIds: string[], groups: Group[]) {
  const range =
    f.range === 'custom' ? `${f.from ? formatDate(f.from) : 'Start'} – ${f.to ? formatDate(f.to) : 'today'}` : RANGES.find((r) => r.value === f.range)!.label
  const gs =
    groupIds.length === 0 ? 'All groups' : groupIds.length === 1 ? (groups.find((g) => g.id === groupIds[0])?.name ?? '1 group') : `${groupIds.length} groups`
  const cs = f.categories.length === 0 ? 'All categories' : f.categories.length === 1 ? CATEGORIES[f.categories[0]].label : `${f.categories.length} categories`
  return [range, gs, cs, f.basis === 'mine' ? 'My share' : 'Total spent'].join(' · ')
}

export function activeCount(f: InsightFilters, groupIds: string[]) {
  return Number(f.range !== DEFAULT_FILTERS.range) + Number(groupIds.length > 0) + Number(f.categories.length > 0) + Number(f.basis !== DEFAULT_FILTERS.basis)
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** Chip row that scrolls sideways; py-1 so the chips' focus/selection rings aren't clipped. */
function ChipRow({ children, label, testId }: { children: React.ReactNode; label: string; testId?: string }) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 scrollbar-none">
      {children}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`chip shrink-0 whitespace-nowrap ${on ? 'chip-on' : 'text-slate-700 dark:text-slate-200'}`}
    >
      {children}
    </button>
  )
}

export function FiltersPanel({
  filters,
  onChange,
  groupIds,
  onGroups,
  groups,
  categories,
  home,
  open,
  onOpenChange,
}: {
  filters: InsightFilters
  onChange: (f: InsightFilters) => void
  groupIds: string[]
  onGroups: (ids: string[]) => void
  groups: Group[]
  /** Categories that occur in the selected groups (others aren't worth a chip). */
  categories: Category[]
  home: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const n = activeCount(filters, groupIds)
  const set = (p: Partial<InsightFilters>) => onChange({ ...filters, ...p })
  return (
    <Collapsible
      className="!mt-0 mb-4"
      testId="insight-filters"
      open={open}
      onOpenChange={onOpenChange}
      icon={<SlidersHorizontal size={20} />}
      title={
        <span className="flex items-center gap-2">
          Filters{n > 0 && <span className="rounded-full bg-fill px-1.5 text-[11px] font-bold leading-[18px] text-on-fill">{n}</span>}
        </span>
      }
      summary={filterSummary(filters, groupIds, groups)}
    >
      {/* inline-size containment: the scrolling chip rows mustn't widen the Collapsible's grid track. */}
      <div className="space-y-4 [contain:inline-size]">
        <div>
          <div className="label">Date range</div>
          <ChipRow label="Date range" testId="insights-period">
            {RANGES.map((r) => (
              <Chip key={r.value} on={filters.range === r.value} onClick={() => set({ range: r.value })}>
                {r.label}
              </Chip>
            ))}
          </ChipRow>
          {filters.range === 'custom' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <DateField
                aria-label="From"
                placeholder="From"
                value={filters.from ?? ''}
                max={filters.to || undefined}
                onChange={(v) => set({ from: v || undefined })}
                clearable
              />
              <DateField
                aria-label="To"
                placeholder="To (today)"
                value={filters.to ?? ''}
                min={filters.from || undefined}
                onChange={(v) => set({ to: v || undefined })}
                clearable
              />
            </div>
          )}
        </div>

        {groups.length > 1 && (
          <div>
            <div className="label">Groups</div>
            <ChipRow label="Groups">
              <Chip on={groupIds.length === 0} onClick={() => onGroups([])}>
                All groups
              </Chip>
              {groups.map((g) => (
                <Chip key={g.id} on={groupIds.includes(g.id)} onClick={() => onGroups(toggle(groupIds, g.id))}>
                  <span aria-hidden>{g.emoji}</span> {g.name}
                  {g.currency !== home && <span className="text-[11px] opacity-70">{g.currency}</span>}
                </Chip>
              ))}
            </ChipRow>
          </div>
        )}

        {categories.length > 1 && (
          <div>
            <div className="label">Categories</div>
            <ChipRow label="Categories">
              <Chip on={filters.categories.length === 0} onClick={() => set({ categories: [] })}>
                All
              </Chip>
              {categories.map((c) => (
                <Chip key={c} on={filters.categories.includes(c)} onClick={() => set({ categories: toggle(filters.categories, c) })}>
                  <span aria-hidden>{CATEGORIES[c].emoji}</span> {CATEGORIES[c].label}
                </Chip>
              ))}
            </ChipRow>
          </div>
        )}

        <div>
          <div className="label">Count</div>
          <Segmented<Basis>
            value={filters.basis}
            onChange={(basis) => set({ basis })}
            options={[
              { value: 'mine', label: 'My share' },
              { value: 'total', label: 'Total spent' },
            ]}
            label="Count"
            testId="insights-basis"
          />
          <p className="text-muted mt-1.5 text-xs">
            {filters.basis === 'mine' ? 'What you consumed: your split of each expense.' : 'The full amount of every expense, whoever it was for.'}
          </p>
        </div>

        {n > 0 && (
          <button
            type="button"
            className="btn-ghost !min-h-0 !px-0 !py-0 text-sm"
            onClick={() => {
              onChange(DEFAULT_FILTERS)
              onGroups([])
            }}
          >
            Reset filters
          </button>
        )}
      </div>
    </Collapsible>
  )
}
