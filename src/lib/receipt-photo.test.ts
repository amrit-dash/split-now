import { describe, expect, it } from 'vitest'
import { formPhoto, formPhotoView, nextZoom, photoArrived, receiptCard, scanReplacedNote } from './receipt-photo'

describe('receipt photo in the form', () => {
  it('a photo picked here wins over the saved one', () => {
    expect(formPhoto({ picked: true, stored: true })).toBe('new')
    expect(formPhoto({ picked: false, stored: true })).toBe('saved')
    expect(formPhoto({ picked: false, stored: false })).toBe('none')
  })
  it('one photo: Attach is disabled while one is attached, and the photo has its own row', () => {
    expect(formPhotoView('none')).toEqual({ attachDisabled: false, row: null })
    expect(formPhotoView('new')).toEqual({ attachDisabled: true, row: { label: 'Receipt photo', remove: true } })
    expect(formPhotoView('saved')).toEqual({ attachDisabled: true, row: { label: 'Receipt photo · saved', remove: false } })
  })
  it('a scan over an attached photo says it replaced it', () => {
    expect(scanReplacedNote(true)).toMatch(/replaced the photo/)
    expect(scanReplacedNote(false)).toBe('')
  })
})

describe('receipt card on the expense screen', () => {
  it('add without a photo, replace with one', () => {
    expect(receiptCard({ hasPhoto: false, trashed: false, canSeal: true })).toEqual({ show: true, add: true, replace: false })
    expect(receiptCard({ hasPhoto: true, trashed: false, canSeal: true })).toEqual({ show: true, add: false, replace: true })
  })
  it('a deleted expense only shows what it has', () => {
    expect(receiptCard({ hasPhoto: true, trashed: true, canSeal: true })).toEqual({ show: true, add: false, replace: false })
    expect(receiptCard({ hasPhoto: false, trashed: true, canSeal: true }).show).toBe(false)
  })
  it('a locked private group takes no new photo', () => {
    expect(receiptCard({ hasPhoto: false, trashed: false, canSeal: false })).toEqual({ show: false, add: false, replace: false })
  })
  it('knows when the new photo has arrived', () => {
    expect(photoArrived('a', 'a')).toBe(false)
    expect(photoArrived(undefined, 'b')).toBe(true)
    expect(photoArrived('a', 'b')).toBe(true)
    expect(photoArrived('a', undefined)).toBe(false)
  })
  it('the viewer switches between fitted and full size', () => {
    expect(nextZoom('fit')).toBe('full')
    expect(nextZoom('full')).toBe('fit')
  })
})
