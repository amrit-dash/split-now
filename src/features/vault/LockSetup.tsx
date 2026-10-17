import type { ReactNode } from 'react'
import { Check, CircleAlert, Fingerprint, Info, KeyRound, KeySquare, Loader2, Pencil, Plus, Server, Trash2 } from 'lucide-react'
import type { VaultStatus } from '@/lib/vault-api'
import { type OpensWith, type OwnPattern, type SetupRow, setupRows, stateLabel } from '@/lib/vault-setup'
import { Segmented } from '@/components/Misc'

export type SetupAction = SetupRow['actions'][number]

const ICONS: Record<SetupRow['id'], ReactNode> = {
  passkey: <Fingerprint size={20} />,
  universal: <KeyRound size={20} />,
  own: <KeySquare size={20} />,
  server: <Server size={20} />,
}

const ACTION_ICON: Record<SetupAction, ReactNode> = {
  add: <Plus size={20} />,
  set: <Plus size={20} />,
  change: <Pencil size={18} />,
  remove: <Trash2 size={18} />,
}

const actionLabel = (a: SetupAction, r: SetupRow) =>
  a === 'add'
    ? 'Add a passkey'
    : a === 'set'
      ? `Set ${r.title.toLowerCase()}`
      : a === 'change'
        ? `Change ${r.title.toLowerCase()}`
        : `Remove ${r.title.toLowerCase()}`

const tile: Record<SetupRow['state'], string> = {
  ready: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  missing: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  info: 'bg-slate-100 text-slate-600 dark:bg-ink-800 dark:text-slate-300',
}

function StatePill({ row }: { row: SetupRow }) {
  const Icon = row.state === 'ready' ? Check : row.state === 'missing' ? CircleAlert : Info
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tile[row.state]}`}>
      <Icon size={12} aria-hidden /> {stateLabel(row)}
    </span>
  )
}

/**
 * What opens private groups, as one card in every place it's set up (src/lib/vault-setup.ts):
 * Settings → Encrypted groups (scope "all"), and for one group (scope "group") the new-group form
 * and the group's Private group sheet, where "Opens with" picks the universal pattern or its own.
 * Each row says its state in words and has its own icon button: add a passkey (Face ID comes up
 * there and then), set or change a pattern, remove a group's own.
 */
export function LockSetup({
  status,
  scope,
  opensWith,
  onOpensWith,
  own,
  keyReady,
  demo,
  busy,
  onAction,
  testId = 'vault-lock-setup',
}: {
  status: VaultStatus
  scope: 'all' | 'group'
  opensWith?: OpensWith
  onOpensWith?: (v: OpensWith) => void
  own?: OwnPattern
  keyReady?: boolean
  demo?: boolean
  /** the row whose step is running: its button spins, the others wait */
  busy?: SetupRow['id'] | null
  onAction: (row: SetupRow['id'], action: SetupAction) => void
  testId?: string
}) {
  const rows = setupRows(status, { scope, opensWith, own, demo, keyReady })
  return (
    <div className="space-y-3" data-testid={testId}>
      {scope === 'group' && onOpensWith && opensWith && (
        <div>
          <div className="label mb-1.5">Opens with</div>
          <Segmented<OpensWith>
            label="Opens with"
            value={opensWith}
            onChange={onOpensWith}
            testId="vault-opens-with"
            options={[
              { value: 'universal', label: 'Universal pattern' },
              { value: 'own', label: 'Its own pattern' },
            ]}
          />
          <p className="text-muted mt-1.5 px-1 text-xs">
            {opensWith === 'universal'
              ? 'Everyone in it opens it with their own universal pattern, plus their passkey.'
              : 'A pattern just for this group. Anyone you tell it to, in person, can open it with it, plus their passkey.'}
          </p>
        </div>
      )}
      <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex min-h-16 items-center gap-3 px-3 py-2.5"
            data-testid={`vault-line-${r.id === 'universal' ? 'pattern' : r.id}`}
            data-state={r.state}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tile[r.state]}`} aria-hidden>
              {ICONS[r.id]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold">{r.title}</span>
                <StatePill row={r} />
              </span>
              <span className="text-muted mt-0.5 block text-xs">{r.detail}</span>
            </span>
            {r.actions.length > 0 && (
              <span className="flex shrink-0 gap-1.5">
                {r.actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-label={actionLabel(a, r)}
                    title={actionLabel(a, r)}
                    disabled={!!busy}
                    onClick={() => onAction(r.id, a)}
                    data-testid={r.id === 'universal' ? 'vault-universal-open' : `vault-${r.id}-${a}`}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl transition active:scale-95 disabled:opacity-50 ${
                      a === 'remove'
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                        : 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                    }`}
                  >
                    {busy === r.id && a !== 'remove' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : ACTION_ICON[a]}
                  </button>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
