import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, History, RotateCcw, X } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { downscale } from '@/lib/image'
import { uid as newId } from '@/lib/id'
import {
  clearHistory,
  deleteScan,
  describeScan,
  findMatch,
  fingerprint,
  historyKey,
  loadHistory,
  onHistoryChange,
  recordOutcome,
  saveScan,
  scannedSentence,
  scannedWhen,
  thumbnail,
  type ScanEntry,
  type ScanKind,
  type ScanMatch,
  type ScanOutcome,
  type ScanPrint,
  type ScanResult,
} from '@/lib/scanHistory'

/**
 * The signed-in user's recent scans of one kind, plus the helpers a scan screen needs: fingerprint
 * picked images and look for a match (in this kind and any `alsoMatch` kinds that produce the same
 * result), save a fresh scan, delete one, clear all, and note what a scan led to.
 */
export function useScanHistory(kind: ScanKind, alsoMatch: ScanKind[] = []) {
  const { user } = useMe()
  const uid = user.uid
  const [entries, setEntries] = useState<ScanEntry[]>([])
  const kinds = [kind, ...alsoMatch].join(',')

  useEffect(() => {
    let live = true
    const load = () =>
      loadHistory(uid, kind).then((l) => {
        if (live) setEntries(l)
      })
    load()
    const off = onHistoryChange((k) => {
      if (k === historyKey(uid, kind)) load()
    })
    return () => {
      live = false
      off()
    }
  }, [uid, kind])

  /** Fingerprint the picked images and find a scan that already has them all. */
  const check = useCallback(
    async (files: Blob[]): Promise<{ prints: ScanPrint[]; match?: ScanMatch }> => {
      let prints: ScanPrint[] = []
      try {
        prints = await Promise.all(files.map(fingerprint))
      } catch {
        return { prints: [] }
      }
      const lists = await Promise.all(kinds.split(',').map((k) => loadHistory(uid, k as ScanKind)))
      return { prints, match: findMatch(lists.flat(), prints) }
    },
    [uid, kinds],
  )

  /** Remember a finished scan. Resolves to its id (undefined when history is unavailable). */
  const save = useCallback(
    async (files: Blob[], prints: ScanPrint[], result: ScanResult): Promise<string | undefined> => {
      if (!files.length) return
      try {
        const keepImage = kind === 'receipt' || kind === 'bill'
        const [thumb, image] = await Promise.all([thumbnail(files[0]), keepImage ? downscale(files[0], 1280, 0.72) : undefined])
        const entry: ScanEntry = { id: newId('scan_'), kind, at: Date.now(), thumb, prints, result, ...(image ? { image } : {}) }
        return (await saveScan(uid, entry)) ? entry.id : undefined
      } catch {
        return undefined
      }
    },
    [uid, kind],
  )

  return {
    entries,
    check,
    save,
    remove: (id: string) => deleteScan(uid, kind, id),
    clear: () => clearHistory(uid, kind),
    /** Note what a scan led to; the entry may be of another kind (a receipt opened on /split). */
    outcome: (id: string | undefined, o: Omit<ScanOutcome, 'at'>, of: ScanKind = kind) => {
      if (id) void recordOutcome(uid, of, id, o)
    },
  }
}

const KIND_LABEL: Record<ScanKind, string> = { receipt: 'receipt', bill: 'bill', payment: 'payment', statement: 'statement' }

/** A horizontal row of the last scans. Hidden when there are none. */
export function RecentScans({
  entries,
  currency,
  onOpen,
  onDelete,
  onClear,
  className = '',
}: {
  entries: ScanEntry[]
  currency: string
  onOpen: (e: ScanEntry) => void
  onDelete: (e: ScanEntry) => void
  onClear: () => void
  className?: string
}) {
  const [confirm, setConfirm] = useState(false)
  if (!entries.length) return null
  return (
    <section className={`mt-5 ${className}`} data-testid="recent-scans">
      <div className="mb-1 flex items-center justify-between px-1">
        <h2 className="text-muted flex items-center gap-1.5 text-sm font-semibold">
          <History size={14} aria-hidden /> Recent scans
        </h2>
        {confirm ? (
          <span className="flex items-center gap-1 text-xs font-semibold">
            <button type="button" className="text-muted min-h-11 px-2" onClick={() => setConfirm(false)}>
              Keep
            </button>
            <button
              type="button"
              className="min-h-11 px-2 text-rose-700 dark:text-rose-400"
              onClick={() => {
                setConfirm(false)
                onClear()
              }}
              data-testid="recent-scans-clear-confirm"
            >
              Clear all
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="-mr-2 min-h-11 px-2 text-xs font-semibold text-brand-600 dark:text-brand-300"
            onClick={() => setConfirm(true)}
            data-testid="recent-scans-clear"
          >
            Clear history
          </button>
        )}
      </div>
      <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
        {entries.map((e) => {
          const s = describeScan(e, currency)
          return (
            <div key={e.id} className="relative w-36 shrink-0 snap-start" data-testid="recent-scan">
              <button
                type="button"
                onClick={() => onOpen(e)}
                className="card block w-full overflow-hidden text-left active:scale-[0.98] transition-transform"
                aria-label={`Open ${s.title}, scanned ${scannedWhen(e.at)}`}
              >
                <div className="relative h-20 bg-slate-100 dark:bg-ink-800">
                  <img src={e.thumb} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
                  {e.prints.length > 1 && (
                    <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white">
                      {e.prints.length} images
                    </span>
                  )}
                </div>
                <div className="px-2.5 py-2">
                  <div className="truncate text-sm font-semibold leading-tight">{s.title}</div>
                  <div className="text-muted truncate text-xs tabular-nums">{s.detail}</div>
                  {e.outcome ? (
                    <div className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={11} className="shrink-0" aria-hidden />
                      <span className="truncate">{e.outcome.label}</span>
                    </div>
                  ) : (
                    <div className="text-muted mt-1 truncate text-[11px]">{scannedWhen(e.at)}</div>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDelete(e)}
                aria-label={`Remove this ${KIND_LABEL[e.kind]} from history`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:bg-black/70"
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** "You scanned this on 8 Oct — open that result / scan again". */
export function DuplicatePrompt({
  match: { entry, exact },
  currency,
  onOpen,
  onRescan,
  className = '',
}: {
  match: ScanMatch
  currency: string
  onOpen: () => void
  onRescan: () => void
  className?: string
}) {
  const s = describeScan(entry, currency)
  return (
    <div className={`card mt-4 p-4 ${className}`} role="alertdialog" aria-label="Already scanned" data-testid="scan-duplicate">
      <div className="flex gap-3">
        <img src={entry.thumb} alt="" className="h-16 w-14 shrink-0 rounded-xl bg-slate-100 object-cover object-top dark:bg-ink-800" />
        <div className="min-w-0 flex-1">
          <div className="font-bold leading-snug">{scannedSentence(entry.at, Date.now(), exact)}</div>
          <div className="text-muted mt-0.5 truncate text-sm">
            {s.title} · {s.detail}
          </div>
          {entry.outcome && (
            <div className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={12} className="shrink-0" aria-hidden />
              <span className="truncate">{entry.outcome.label}</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary" onClick={onOpen} data-testid="scan-duplicate-open">
          Open that result
        </button>
        <button type="button" className="btn-secondary" onClick={onRescan} data-testid="scan-duplicate-rescan">
          <RotateCcw size={16} aria-hidden /> Scan again
        </button>
      </div>
    </div>
  )
}
