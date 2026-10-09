/** An accessible on/off switch (role="switch"). Label it with `label` or aria-labelledby. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  testId,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
  testId?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 motion-reduce:transition-none disabled:opacity-40 ${checked ? 'bg-fill' : 'bg-slate-300 dark:bg-ink-700'}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full shadow transition-transform duration-200 motion-reduce:transition-none ${checked ? 'translate-x-6 bg-on-fill' : 'translate-x-1 bg-white'}`}
      />
    </button>
  )
}
