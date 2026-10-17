import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteDraftBlob, draftBlobKey, getDraftBlob, isDraftBlobKey, putDraftBlob } from '@/lib/draft-blob'
import { downscale, imagePreviewUrl } from '@/lib/image'
import { uid } from '@/lib/id'

/** One photo attached in the form, not uploaded yet: the file, its thumbnail, and where the draft keeps it. */
export interface AttachedPick {
  id: string
  file: File
  src: string | null
  /** the IndexedDB key the stored draft points at (src/lib/draft-blob.ts), once it's written */
  key?: string
}

/**
 * The photos attached in the expense form (Attach), up to the room left. Each is kept in IndexedDB
 * beside the sessionStorage draft, like the scanned receipt, so a reload (iOS drops a page while
 * the camera is open) brings them back. `keys` is what the stored draft lists; `forget` drops the
 * kept copies once the draft is saved or discarded. The uploads happen after the save
 * (repo.attachReceipt with slot 'attached').
 */
export function useAttachedPhotos(storeKey: string, restoreKeys: string[] | undefined, done: { current: boolean }) {
  const [picks, setPicks] = useState<AttachedPick[]>([])
  const live = useRef<AttachedPick[]>([])
  live.current = picks

  // Thumbnails go when the form does.
  useEffect(
    () => () => {
      for (const p of live.current) if (p.src) URL.revokeObjectURL(p.src)
    },
    [],
  )

  const keep = useCallback(
    (pick: AttachedPick) => {
      const key = draftBlobKey(storeKey)
      void (async () => {
        const small = await downscale(pick.file, 1600, 0.8).catch(() => pick.file)
        const ok = await putDraftBlob(key, small, pick.file.name)
        // Removed, saved or discarded while writing: don't leave it behind.
        if (!ok) return
        if (done.current || !live.current.some((p) => p.id === pick.id)) return void deleteDraftBlob(key)
        setPicks((ps) => ps.map((p) => (p.id === pick.id ? { ...p, key } : p)))
      })()
    },
    [storeKey, done],
  )

  const add = useCallback(
    (files: File[], opts: { persist?: boolean } = {}) => {
      const fresh = files.map((file) => ({ id: uid('ph_'), file, src: imagePreviewUrl(file) ?? null }))
      setPicks((ps) => [...ps, ...fresh])
      if (opts.persist !== false) for (const p of fresh) keep(p)
      return fresh
    },
    [keep],
  )

  const remove = useCallback((id: string) => {
    const p = live.current.find((x) => x.id === id)
    if (!p) return
    if (p.src) URL.revokeObjectURL(p.src)
    void deleteDraftBlob(p.key)
    setPicks((ps) => ps.filter((x) => x.id !== id))
  }, [])

  const forget = useCallback(() => {
    for (const p of live.current) void deleteDraftBlob(p.key)
  }, [])

  // A restored draft's attached photos, once.
  const restored = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, for the draft the form opened with
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const keys = (restoreKeys ?? []).filter((k) => isDraftBlobKey(k, storeKey))
    if (!keys.length) return
    let on = true
    void Promise.all(keys.map(async (k) => [k, await getDraftBlob(k)] as const)).then((pairs) => {
      if (!on) return
      const back = pairs.filter((x): x is readonly [string, File] => !!x[1])
      setPicks((ps) => [...ps, ...back.map(([key, file]) => ({ id: uid('ph_'), file, src: imagePreviewUrl(file) ?? null, key }))])
    })
    return () => {
      on = false
    }
  }, [])

  return { picks, keys: picks.map((p) => p.key).filter((k): k is string => !!k), add, remove, forget }
}
