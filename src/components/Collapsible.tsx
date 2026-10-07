import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * A card with a header button that expands/collapses its body. Shows `summary` (one line)
 * while collapsed. Controlled (`open` + `onOpenChange`) or uncontrolled (`defaultOpen`).
 * The height animates with the grid-rows trick; prefers-reduced-motion turns it off.
 */
export function Collapsible({
  title, icon, summary, open: openProp, defaultOpen = false, onOpenChange, children, id, className = '', testId,
}: {
  title: ReactNode
  icon?: ReactNode
  summary?: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  id?: string
  className?: string
  testId?: string
}) {
  const [inner, setInner] = useState(defaultOpen)
  const open = openProp ?? inner
  const auto = useId()
  const bodyId = `${id ?? auto}-body`
  const toggle = () => {
    const next = !open
    if (openProp === undefined) setInner(next)
    onOpenChange?.(next)
  }
  return (
    <section id={id} className={`card mt-3 overflow-hidden ${className}`} data-testid={testId} data-open={open || undefined}>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        {icon && <span className="shrink-0 text-brand-600 dark:text-brand-300">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {summary && (
            <span className={`block truncate text-xs text-slate-500 transition-opacity duration-200 motion-reduce:transition-none dark:text-slate-400 ${open ? 'opacity-0' : 'opacity-100'}`} aria-hidden={open}>
              {summary}
            </span>
          )}
        </span>
        <ChevronDown size={20} aria-hidden className={`shrink-0 text-slate-400 transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        id={bodyId}
        role="region"
        aria-label={typeof title === 'string' ? title : undefined}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  )
}
