import { beforeEach, describe, expect, it } from 'vitest'
import {
  DRAFT_BLOB_MAX_BYTES,
  DRAFT_BLOB_TTL,
  deleteDraftBlob,
  draftBlobKey,
  fitsCap,
  getDraftBlob,
  isDraftBlobKey,
  isExpired,
  memoryBlobStore,
  putDraftBlob,
  setDraftBlobStore,
  staleKeys,
  type DraftBlobStore,
} from './draft-blob'

const K = 'splitit-expense-draft:new'
const img = (size = 10) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' })

describe('draft image keys', () => {
  it('hangs a fresh id off the draft route', () => {
    const a = draftBlobKey(K)
    expect(a.startsWith(`${K}#`)).toBe(true)
    expect(draftBlobKey(K)).not.toBe(a)
    expect(draftBlobKey(K, 'x1')).toBe(`${K}#x1`)
    expect(isDraftBlobKey(a, K)).toBe(true)
    expect(isDraftBlobKey(`${K}#`, K)).toBe(false)
    expect(isDraftBlobKey('splitit-expense-draft:edit:e1#x', K)).toBe(false)
    expect(isDraftBlobKey(5, K)).toBe(false)
  })

  it('expires old, future-dated and broken timestamps', () => {
    expect(isExpired(1000, 1000)).toBe(false)
    expect(isExpired(0, DRAFT_BLOB_TTL)).toBe(false)
    expect(isExpired(0, DRAFT_BLOB_TTL + 1)).toBe(true)
    expect(isExpired(10 * 60_000, 0)).toBe(true)
    expect(isExpired(Number.NaN, 0)).toBe(true)
  })

  it('caps the size', () => {
    expect(fitsCap(0)).toBe(false)
    expect(fitsCap(1)).toBe(true)
    expect(fitsCap(DRAFT_BLOB_MAX_BYTES)).toBe(true)
    expect(fitsCap(DRAFT_BLOB_MAX_BYTES + 1)).toBe(false)
  })

  it('sweeps expired entries and the oldest beyond the limit', () => {
    const now = DRAFT_BLOB_TTL * 2
    const ages: Array<[string, number]> = [
      ['old', 0],
      ['a', now - 1],
      ['b', now - 2],
      ['c', now - 3],
      ['d', now - 4],
    ]
    expect(staleKeys(ages, now, 4).sort()).toEqual(['old'])
    expect(staleKeys(ages, now, 2).sort()).toEqual(['c', 'd', 'old'])
    // Room is kept for the entry being added, which itself is never swept.
    expect(staleKeys([...ages, ['new', 0]], now, 2, 'new').sort()).toEqual(['b', 'c', 'd', 'old'])
  })
})

describe('keeping the receipt image', () => {
  let s: DraftBlobStore
  beforeEach(() => {
    s = memoryBlobStore()
    setDraftBlobStore(s)
  })

  it('stores, reads back as a File and deletes', async () => {
    const k = draftBlobKey(K, '1')
    expect(await putDraftBlob(k, img(20), 'bill.jpg', 100)).toBe(true)
    const f = await getDraftBlob(k, 200)
    expect(f).toBeInstanceOf(File)
    expect(f?.name).toBe('bill.jpg')
    expect(f?.type).toBe('image/jpeg')
    expect(f?.size).toBe(20)
    await deleteDraftBlob(k)
    expect(await getDraftBlob(k, 200)).toBeNull()
    await deleteDraftBlob(undefined)
  })

  it('refuses empty or oversized images and drops expired ones on read', async () => {
    expect(await putDraftBlob('k', img(0), 'a.jpg')).toBe(false)
    expect(await putDraftBlob('k', { size: DRAFT_BLOB_MAX_BYTES + 1, type: 'image/jpeg' } as Blob, 'a.jpg')).toBe(false)
    await putDraftBlob('k', img(), 'a.jpg', 0)
    expect(await getDraftBlob('k', DRAFT_BLOB_TTL + 1)).toBeNull()
    expect(await s.ages()).toEqual([])
  })

  it('sweeps stale entries when adding one', async () => {
    await putDraftBlob('old', img(), 'a.jpg', 0)
    await putDraftBlob('new', img(), 'b.jpg', DRAFT_BLOB_TTL + 1)
    expect((await s.ages()).map(([k]) => k)).toEqual(['new'])
  })

  it('fails quietly when storage is unavailable', async () => {
    const no = () => Promise.reject(new Error('No IndexedDB'))
    setDraftBlobStore({ get: no, put: no, del: no, ages: no })
    expect(await putDraftBlob('k', img(), 'a.jpg')).toBe(false)
    expect(await getDraftBlob('k')).toBeNull()
    await expect(deleteDraftBlob('k')).resolves.toBeUndefined()
  })
})
