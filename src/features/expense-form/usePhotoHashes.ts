import { useEffect, useState } from 'react'
import { photoHash } from '@/lib/receipt-photo'

/**
 * Fingerprints (src/lib/receipt-photo.ts photoHash) of the photos in the form, by key: a picked
 * file is read as it is, a saved one fetched from its thumbnail (a private group's opened copy,
 * or its download link). One that can't be read just has no fingerprint, and isn't checked.
 */
export function usePhotoHashes(items: Array<{ key: string; file?: Blob | null; src?: string | null }>): Record<string, string | null> {
  const [hashes, setHashes] = useState<Record<string, string | null>>({})
  const sig = items.map((i) => `${i.key}:${i.file ? 'f' : (i.src ?? '')}`).join('|')
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature names every item's source
  useEffect(() => {
    let live = true
    for (const it of items) {
      if (it.key in hashes) continue
      void (async () => {
        let blob = it.file ?? null
        if (!blob && it.src)
          blob = await fetch(it.src)
            .then((r) => (r.ok ? r.blob() : null))
            .catch(() => null)
        const h = blob ? await photoHash(blob) : null
        if (live) setHashes((m) => ({ ...m, [it.key]: h }))
      })()
    }
    return () => {
      live = false
    }
  }, [sig])
  return hashes
}
