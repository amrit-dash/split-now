/*
 * Cancel for work that can't be cancelled itself (a Cloud Functions callable, a recognize job on
 * the shared OCR worker): the caller stops waiting the moment the signal fires, and whatever the
 * work answers later is dropped. The work's own late rejection is swallowed so it never surfaces
 * as an unhandled rejection.
 */

/** The error an aborted wait rejects with (the signal's reason when it is an Error, else an AbortError). */
export function abortReason(signal: AbortSignal): Error {
  const r: unknown = signal.reason
  if (r instanceof Error) return r
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

/** True for the rejection of an aborted wait (ours, `fetch`'s, or a DOMException AbortError). */
export function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}

/** Throws the abort error when `signal` has already fired; a stage boundary check. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal)
}

/** `p`, or a rejection as soon as `signal` aborts, whichever comes first. No signal: `p` as is. */
export function abortable<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p
  if (signal.aborted) {
    p.catch(() => {})
    return Promise.reject(abortReason(signal))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}
