import { useEffect, useState } from 'react'
import { Repeat, SlidersHorizontal } from 'lucide-react'
import type { Expense, RecurrenceFreq } from '@/types'
import { FREQ_LABEL } from '@/lib/recurrence'
import { formatDate } from '@/lib/locale'
import { buildRecurrence, REPEAT_OPTIONS, type Action, type Draft, type Errors } from '@/lib/expense-draft'
import { Collapsible } from '@/components/Collapsible'
import { DateField } from '@/components/DateField'
import { Select } from '@/components/Select'

/** Repeat and notes, folded away until needed; the summary line says what is set. */
export function MoreCard({ draft, dispatch, existing, errors }: { draft: Draft; dispatch: (a: Action) => void; existing?: Expense; errors: Errors }) {
  const isOccurrence = !!existing?.recurringFrom
  const repeats = draft.repeat !== 'never'
  const summary = [isOccurrence ? '' : repeats ? `Repeats ${FREQ_LABEL[draft.repeat as RecurrenceFreq].toLowerCase()}` : 'Doesn’t repeat', draft.notes.trim() ? 'Has notes' : 'No notes'].filter(Boolean).join(' · ')
  const next = repeats ? buildRecurrence(draft.repeat, draft.date, draft.until, existing)?.nextDate : undefined
  const [open, setOpen] = useState(!!(existing?.recurrence || draft.notes.trim()))
  // A problem with the end date must be visible, so the card opens itself.
  useEffect(() => { if (errors.until) setOpen(true) }, [errors.until])
  return (
    <Collapsible title="More" summary={summary} icon={<SlidersHorizontal size={18} aria-hidden />} open={open} onOpenChange={setOpen} testId="more-card">
      {!isOccurrence && (
        <>
          <div className={`grid gap-3 ${repeats ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="min-w-0">
              <label htmlFor="expense-repeat" className="label flex items-center gap-1.5"><Repeat size={14} aria-hidden /> Repeat</label>
              <Select id="expense-repeat" aria-label="Repeat" value={draft.repeat} onChange={(v) => dispatch({ type: 'repeat', repeat: v })}
                options={REPEAT_OPTIONS.map((f) => ({ value: f, label: f === 'never' ? 'Never' : FREQ_LABEL[f] }))} />
            </div>
            {repeats && (
              <div className="min-w-0">
                <label htmlFor="repeat-until" className="label">Ends</label>
                <DateField id="repeat-until" aria-label="Repeat until" placeholder="Never" clearable value={draft.until} min={draft.date} onChange={(v) => dispatch({ type: 'until', until: v })} />
                {errors.until && <p role="alert" className="neg mt-1 text-sm">{errors.until}</p>}
              </div>
            )}
          </div>
          {repeats && (
            <p className="mt-3 text-xs text-muted">
              Next copy on {next ? formatDate(next, 'dayYear') : '—'}. Copies are added automatically when anyone in the group opens the app.
            </p>
          )}
        </>
      )}
      <div className={isOccurrence ? '' : 'mt-3'}>
        <label htmlFor="expense-notes" className="label">Notes</label>
        <textarea id="expense-notes" className="input min-h-20" placeholder="Optional" value={draft.notes} onChange={(e) => dispatch({ type: 'notes', notes: e.target.value })} />
      </div>
    </Collapsible>
  )
}
