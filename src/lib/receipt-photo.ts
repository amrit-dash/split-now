/*
 * An expense's photos: what the form and the expense screen offer for them. An expense has at
 * most one scanned receipt (the photo Scan read, in receiptUrl / receiptPath: a new scan replaces
 * it) and up to MAX_ATTACHED attached photos (Attach: the card slip, the delivery screenshot, a
 * second page; in `photos`). Attached ones are added and removed one by one; adding or removing a
 * photo never changes the amount. Uploading is repo.attachReceipt (downscaled, and sealed first in
 * a private group); this file only decides what to show.
 */

/** Attached photos an expense may keep (the rules cap `photos` the same). */
export const MAX_ATTACHED = 4

/** The form's scanned photo: none, one scanned in this form (not uploaded yet), or the one the saved expense already has. */
export type FormPhoto = 'none' | 'new' | 'saved'

export function formPhoto(o: { picked: boolean; stored: boolean }): FormPhoto {
  if (o.picked) return 'new'
  return o.stored ? 'saved' : 'none'
}

export interface FormPhotosView {
  /** the scanned photo's row: a thumbnail, its label, and Remove for one scanned in this form */
  scan: null | { label: string; remove: boolean }
  /** how many more can be attached; Attach is disabled at 0 (kept in place so the row doesn't shift) */
  attachLeft: number
  attachDisabled: boolean
  /** the line under the attached thumbnails ("2 of 4 attached"), or null with none */
  attachedLine: string | null
}

/** What the form shows for the scanned photo and the attached ones (saved + picked here). */
export function formPhotosView(o: { scan: FormPhoto; attachedSaved: number; attachedNew: number }): FormPhotosView {
  const attached = o.attachedSaved + o.attachedNew
  const left = Math.max(0, MAX_ATTACHED - attached)
  return {
    scan: o.scan === 'none' ? null : { label: o.scan === 'new' ? 'Scanned receipt' : 'Scanned receipt · saved', remove: o.scan === 'new' },
    attachLeft: left,
    attachDisabled: left === 0,
    attachedLine: attached ? `${attached} of ${MAX_ATTACHED} attached${o.attachedSaved && o.attachedNew ? ` · ${o.attachedNew} new` : ''}` : null,
  }
}

/** The photos picked in one go that still fit (the rest are left out, and the toast says so). */
export function fitAttached<T>(picked: T[], left: number): { take: T[]; dropped: number } {
  const take = picked.slice(0, Math.max(0, left))
  return { take, dropped: picked.length - take.length }
}

/** The toast after attaching: how many went in, and how many didn't fit. */
export function attachedNote(taken: number, dropped: number): string {
  const head = taken === 1 ? 'Photo attached' : `${taken} photos attached`
  if (!dropped) return head
  return `${taken ? `${head}. ` : ''}${dropped === 1 ? 'One didn’t fit' : `${dropped} didn’t fit`}: an expense keeps up to ${MAX_ATTACHED} attached photos.`
}

/** Scanning over a scanned photo replaces it: the toast after a scan says so. Attached photos stay. */
export const scanReplacedNote = (hadScan: boolean): string => (hadScan ? ' It replaced the scanned receipt.' : '')

/** One photo the expense screen shows: the scanned receipt first, then the attached ones in the order added. */
export interface ShownPhoto {
  key: string
  kind: 'scan' | 'attached'
  label: string
  url?: string
  path?: string
}

export function expensePhotos(e: { receiptUrl?: string; receiptPath?: string; photos?: Array<{ url?: string; path?: string }> }): ShownPhoto[] {
  const out: ShownPhoto[] = []
  if (e.receiptUrl || e.receiptPath)
    out.push({ key: e.receiptPath ?? e.receiptUrl ?? 'scan', kind: 'scan', label: 'Scanned receipt', url: e.receiptUrl, path: e.receiptPath })
  const attached = (Array.isArray(e.photos) ? e.photos : []).filter((p) => p && (p.url || p.path)).slice(0, MAX_ATTACHED)
  for (const [i, p] of attached.entries())
    out.push({
      key: p.path ?? p.url ?? `p${i}`,
      kind: 'attached',
      label: attached.length > 1 ? `Attached photo ${i + 1}` : 'Attached photo',
      url: p.url,
      path: p.path,
    })
  return out
}

/** The folded row's line: what's there, in a few words. */
export function photosSummary(photos: ShownPhoto[]): string {
  const scan = photos.some((p) => p.kind === 'scan')
  const attached = photos.filter((p) => p.kind === 'attached').length
  if (!attached) return scan ? 'Scanned receipt' : 'No photos'
  const a = `${attached} attached`
  return scan ? `Scanned receipt · ${a}` : attached === 1 ? '1 attached photo' : `${attached} attached photos`
}

/**
 * The expense screen's photo card. A deleted expense is read-only; a private group's photos can be
 * added only while the group is open (they have to be sealed with the group's key on the phone).
 * The scanned receipt can be replaced; attached photos removed one by one, and more added up to the cap.
 */
export function receiptCard(o: { scan: boolean; attached: number; trashed: boolean; canSeal: boolean }): {
  show: boolean
  add: boolean
  replaceScan: boolean
  removeAttached: boolean
} {
  const writable = !o.trashed && o.canSeal
  const any = o.scan || o.attached > 0
  return { show: any || writable, add: writable && o.attached < MAX_ATTACHED, replaceScan: o.scan && writable, removeAttached: writable && o.attached > 0 }
}

/** A photo added on the expense screen counts as done once the expense's photos changed. */
export const photoArrived = (before: string | undefined, now: string | undefined): boolean => !!now && now !== before

/** The expense's photos as one string, to see when one was added, replaced or removed. */
export const photosKey = (photos: ShownPhoto[]): string => photos.map((p) => p.key).join('|')

/** The full-screen viewer: fitted to the screen, or at full size (scrolled); a tap switches. */
export type ViewerZoom = 'fit' | 'full'
export const nextZoom = (z: ViewerZoom): ViewerZoom => (z === 'fit' ? 'full' : 'fit')

/** Moving through several photos in the viewer: next / previous, stopping at the ends. */
export const stepPhoto = (i: number, by: -1 | 1, count: number): number => Math.min(Math.max(0, i + by), Math.max(0, count - 1))
