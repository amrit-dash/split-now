import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Ban, Loader2, Search, ShieldOff } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { errText } from '@/lib/errors'
import { formatDate } from '@/lib/locale'
import { useConfirm } from '@/components/ConfirmSheet'
import { Loading } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { adminBlockUser, adminUsers, type AdminUser } from './api'

const when = (ms: number | null) => (ms ? formatDate(ms, { day: 'numeric', month: 'short', year: 'numeric' }) : '–')

/** /admin/users: find an account by email, uid or name; block or unblock it. Newest sign-ups by default. */
export default function Users() {
  const { user: me } = useMe()
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [result, setResult] = useState<{ users: AdminUser[]; truncated: boolean } | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reasonFor, setReasonFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const search = useCallback(async (query: string) => {
    setResult(undefined)
    setError(null)
    try {
      setResult(await adminUsers(query.trim()))
    } catch (e) {
      setError(errText(e))
      setResult(null)
    }
  }, [])
  useEffect(() => {
    void search('')
  }, [search])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void search(q)
  }

  const setBlocked = async (u: AdminUser, block: boolean, why: string) => {
    setBusy(u.uid)
    try {
      const r = await adminBlockUser(u.uid, block, why)
      setResult((cur) =>
        cur
          ? {
              ...cur,
              users: cur.users.map((x) =>
                x.uid === u.uid
                  ? {
                      ...x,
                      disabled: r.authUpdated ? block : x.disabled,
                      blocked: block ? { reason: why || 'Blocked by an admin', at: Date.now(), by: me.uid } : null,
                    }
                  : x,
              ),
            }
          : cur,
      )
      toast(block ? `${u.email ?? u.uid} blocked` : `${u.email ?? u.uid} unblocked`)
      setReasonFor(null)
      setReason('')
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const unblock = async (u: AdminUser) => {
    if (await confirm({ title: `Unblock ${u.email ?? u.uid}?`, message: 'They can sign in and write again straight away.', confirmLabel: 'Unblock' }))
      void setBlocked(u, false, '')
  }

  return (
    <div data-testid="admin-users">
      <form onSubmit={submit} className="flex gap-2" role="search">
        <label htmlFor="user-q" className="sr-only">
          Email, uid or name
        </label>
        <input
          id="user-q"
          className="input"
          type="search"
          placeholder="Email, uid or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
        />
        <button type="submit" className="btn-secondary !px-4" aria-label="Search" disabled={result === undefined}>
          <Search size={18} />
        </button>
      </form>
      <p className="text-muted mt-2 px-1 text-xs">
        {q.trim() ? 'Matches by email, uid or name.' : 'Newest sign-ups.'} Blocking refuses every write from the account, disables it in Auth and drops its push
        and capture keys. Admins can’t be blocked here.
      </p>

      {result === undefined ? (
        <Loading />
      ) : !result ? (
        <div className="card mt-4 p-4 text-sm" role="alert">
          Couldn’t load accounts{error ? `: ${error}` : ''}.
        </div>
      ) : result.users.length === 0 ? (
        <div className="card mt-4 p-4 text-sm">No account matches.</div>
      ) : (
        <ul className="card mt-4 divide-y divide-slate-100 dark:divide-white/5" data-testid="admin-user-list">
          {result.users.map((u) => (
            <li key={u.uid} className="p-4">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                  aria-hidden
                >
                  {u.photo ? <img src={u.photo} alt="" className="h-full w-full object-cover" /> : (u.name ?? u.email ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{u.name ?? u.email ?? u.uid}</div>
                  {u.name && u.email && <div className="text-muted truncate text-sm">{u.email}</div>}
                  <div className="text-muted mt-0.5 truncate font-mono text-[11px]">{u.uid}</div>
                  <div className="text-muted mt-1 text-xs">
                    Joined {when(u.createdAt)} · last sign-in {when(u.lastSignInAt)}
                    {u.providers.length ? ` · ${u.providers.map((p) => p.replace('.com', '')).join(', ')}` : ''}
                  </div>
                  {u.blocked && (
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                      <Ban size={12} aria-hidden /> Blocked · {u.blocked.reason}
                    </div>
                  )}
                  {!u.blocked && u.disabled && <div className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">Disabled in Auth</div>}
                </div>
                {u.uid !== me.uid && (
                  <div className="shrink-0">
                    {u.blocked ? (
                      <button type="button" className="btn-secondary btn-sm" disabled={busy === u.uid} onClick={() => unblock(u)}>
                        {busy === u.uid ? <Loader2 size={16} className="animate-spin" /> : <ShieldOff size={16} />} Unblock
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary btn-sm text-rose-700 dark:text-rose-400"
                        disabled={busy === u.uid}
                        aria-expanded={reasonFor === u.uid}
                        onClick={() => {
                          setReasonFor(reasonFor === u.uid ? null : u.uid)
                          setReason('')
                        }}
                      >
                        <Ban size={16} /> Block
                      </button>
                    )}
                  </div>
                )}
              </div>
              {reasonFor === u.uid && (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void setBlocked(u, true, reason.trim())
                  }}
                >
                  <label htmlFor={`reason-${u.uid}`} className="sr-only">
                    Reason
                  </label>
                  <input
                    id={`reason-${u.uid}`}
                    className="input !py-2.5"
                    placeholder="Reason (shown to them)"
                    maxLength={200}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="btn-primary !min-h-0 !px-4 !py-2 text-sm" disabled={busy === u.uid}>
                    {busy === u.uid ? <Loader2 size={16} className="animate-spin" /> : 'Block now'}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {result?.truncated && <p className="text-muted mt-2 px-1 text-xs">Only the first 3,000 accounts were searched; try a more specific email.</p>}
    </div>
  )
}
