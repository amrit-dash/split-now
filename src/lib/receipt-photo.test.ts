import { describe, expect, it } from 'vitest'
import {
  attachedNote,
  expensePhotos,
  fitAttached,
  formPhoto,
  formPhotosView,
  MAX_ATTACHED,
  nextZoom,
  photoArrived,
  photosKey,
  photosSummary,
  receiptCard,
  scanReplacedNote,
  stepPhoto,
  photoStrip,
  stripLine,
  photoHash,
  alreadyHere,
  alreadyNote,
  rescanAsk,
} from './receipt-photo'

describe('photos in the form', () => {
  it('a photo scanned here wins over the saved one', () => {
    expect(formPhoto({ picked: true, stored: true })).toBe('new')
    expect(formPhoto({ picked: false, stored: true })).toBe('saved')
    expect(formPhoto({ picked: false, stored: false })).toBe('none')
  })
  it('one scanned receipt, and up to four attached: Attach is disabled when full', () => {
    expect(formPhotosView({ scan: 'none', attachedSaved: 0, attachedNew: 0 })).toEqual({ scan: null, attachLeft: 4, attachDisabled: false, attachedLine: null })
    expect(formPhotosView({ scan: 'new', attachedSaved: 0, attachedNew: 1 })).toMatchObject({
      scan: { label: 'Scanned receipt', remove: true },
      attachLeft: 3,
      attachedLine: '1 of 4 attached',
    })
    expect(formPhotosView({ scan: 'saved', attachedSaved: 2, attachedNew: 2 })).toMatchObject({
      scan: { label: 'Scanned receipt · saved', remove: false },
      attachDisabled: true,
      attachedLine: '4 of 4 attached · 2 new',
    })
  })
  it('several picked at once: what fits goes in, and the toast says the rest didn’t', () => {
    expect(fitAttached(['a', 'b', 'c'], 2)).toEqual({ take: ['a', 'b'], dropped: 1 })
    expect(fitAttached(['a'], 0)).toEqual({ take: [], dropped: 1 })
    expect(attachedNote(1, 0)).toBe('Photo attached')
    expect(attachedNote(2, 1)).toBe('2 photos attached. One didn’t fit: an expense keeps up to 4 attached photos.')
    expect(attachedNote(0, 2)).toBe('2 didn’t fit: an expense keeps up to 4 attached photos.')
  })
  it('a scan over a scanned receipt replaces it, and says so', () => {
    expect(scanReplacedNote(true)).toMatch(/replaced the scanned receipt/)
    expect(scanReplacedNote(false)).toBe('')
  })
})

describe('photos on the expense screen', () => {
  const e = { receiptPath: 'receipts/g/s.jpg', receiptUrl: 'https://x/s', photos: [{ path: 'receipts/g/a.jpg' }, { url: 'data:image/jpeg;base64,AA' }] }
  it('the scanned receipt first, then the attached ones, labelled apart', () => {
    const p = expensePhotos(e)
    expect(p.map((x) => [x.kind, x.label])).toEqual([
      ['scan', 'Scanned receipt'],
      ['attached', 'Attached photo 1'],
      ['attached', 'Attached photo 2'],
    ])
    expect(expensePhotos({ photos: [{ path: 'p' }] })[0].label).toBe('Attached photo')
    expect(expensePhotos({ photos: 'nope' as never })).toEqual([])
    expect(photosSummary(p)).toBe('Scanned receipt · 2 attached')
    expect(photosSummary(expensePhotos({ photos: [{ path: 'p' }] }))).toBe('1 attached photo')
    expect(photosSummary(expensePhotos({ receiptPath: 'x' }))).toBe('Scanned receipt')
    expect(photosKey(p)).toBe('receipts/g/s.jpg|receipts/g/a.jpg|data:image/jpeg;base64,AA')
  })
  it('adds while there is room, replaces the scan, removes attached ones; read-only in the trash', () => {
    expect(receiptCard({ scan: false, attached: 0, trashed: false, canSeal: true })).toEqual({
      show: true,
      add: true,
      replaceScan: false,
      removeAttached: false,
    })
    expect(receiptCard({ scan: true, attached: MAX_ATTACHED, trashed: false, canSeal: true })).toEqual({
      show: true,
      add: false,
      replaceScan: true,
      removeAttached: true,
    })
    expect(receiptCard({ scan: true, attached: 1, trashed: true, canSeal: true })).toEqual({
      show: true,
      add: false,
      replaceScan: false,
      removeAttached: false,
    })
    expect(receiptCard({ scan: false, attached: 0, trashed: true, canSeal: true }).show).toBe(false)
  })
  it('a locked private group takes no new photo', () => {
    expect(receiptCard({ scan: false, attached: 0, trashed: false, canSeal: false })).toEqual({
      show: false,
      add: false,
      replaceScan: false,
      removeAttached: false,
    })
  })
  it('knows when the photos changed', () => {
    expect(photoArrived('a', 'a')).toBe(false)
    expect(photoArrived(undefined, 'b')).toBe(true)
    expect(photoArrived('a', undefined)).toBe(false)
  })
  it('the viewer switches size and steps through the photos, stopping at the ends', () => {
    expect(nextZoom('fit')).toBe('full')
    expect(nextZoom('full')).toBe('fit')
    expect(stepPhoto(0, 1, 3)).toBe(1)
    expect(stepPhoto(2, 1, 3)).toBe(2)
    expect(stepPhoto(0, -1, 3)).toBe(0)
    expect(stepPhoto(0, 1, 0)).toBe(0)
  })
})

describe('the form’s photo strip', () => {
  it('the scanned receipt first, then the attached ones; what was picked here can be crossed out', () => {
    const s = photoStrip({
      scan: { src: 'a', saved: false },
      attached: [
        { id: 'p1', src: 'b', saved: true },
        { id: 'p2', src: 'c', saved: false },
      ],
    })
    expect(s.map((p) => [p.kind, p.removable, p.label])).toEqual([
      ['scan', true, 'Scanned receipt'],
      ['attached', false, 'Attached photo 1'],
      ['attached', true, 'Attached photo 2'],
    ])
    expect(photoStrip({ scan: { src: null, saved: true }, attached: [] })[0].removable).toBe(false)
    expect(photoStrip({ scan: null, attached: [] })).toEqual([])
  })
  it('says what is there and the room left: five in all, one scanned and four attached', () => {
    expect(stripLine({ scan: true, attached: 2 })).toBe('Scanned receipt + 2 of 4 attached')
    expect(stripLine({ scan: true, attached: 0 })).toBe('Scanned receipt')
    expect(stripLine({ scan: false, attached: 1 })).toBe('1 of 4 attached')
    expect(stripLine({ scan: false, attached: 0 })).toBeNull()
  })
  it('notices the same picture twice by its contents', async () => {
    const a = await photoHash(new Blob([new Uint8Array([1, 2, 3])]))
    const b = await photoHash(new Blob([new Uint8Array([1, 2, 3])]))
    const c = await photoHash(new Blob([new Uint8Array([3, 2, 1])]))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(alreadyHere(a, { scan: a, attached: [] })).toBe('scan')
    expect(alreadyHere(a, { scan: c, attached: [null, a] })).toBe('attached')
    expect(alreadyHere(a, { scan: null, attached: [c] })).toBeNull()
    expect(alreadyHere(null, { scan: null, attached: [null] })).toBeNull()
  })
  it('says why nothing was added twice', () => {
    expect(alreadyNote('attached', 'attach')).toBe('That photo is already attached.')
    expect(alreadyNote('scan', 'attach', 2)).toBe('2 of those photos are already here as the scanned receipt.')
    expect(alreadyNote('scan', 'scan')).toMatch(/already scanned/)
    expect(alreadyNote('attached', 'scan')).toMatch(/now the scanned receipt/)
  })
  it('asks before a new scan replaces the scanned receipt, in the words of the detail level', () => {
    expect(rescanAsk('full').message).toMatch(/replaces the scanned receipt and fills in/)
    expect(rescanAsk('needed').message).toBe(rescanAsk('full').message)
    expect(rescanAsk('minimal').message).toBe('It replaces the scanned receipt and its details.')
    expect(rescanAsk('tooltip')).toMatchObject({ title: 'Scan another receipt?', confirmLabel: 'Scan another' })
  })
})
