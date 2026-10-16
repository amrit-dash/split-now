/*
 * An expense's receipt photo: what the form and the expense screen offer for it. A photo can be
 * attached without being read (Attach a photo), kept when Scan can't read it, added later or
 * replaced from the expense screen, and opened full screen. Uploading is repo.attachReceipt
 * (downscaled, and sealed first in a private group); this file only decides what to show.
 */

/** The form's photo: none, one picked in this form (not uploaded yet), or the one the saved expense already has. */
export type FormPhoto = 'none' | 'new' | 'saved'

export function formPhoto(o: { picked: boolean; stored: boolean }): FormPhoto {
  if (o.picked) return 'new'
  return o.stored ? 'saved' : 'none'
}

/** The line under the form's date row for each state: what it says and the one action beside it. */
export function formPhotoLine(p: FormPhoto): { text: string | null; action: 'attach' | 'remove' | 'replace' } {
  switch (p) {
    case 'new':
      return { text: 'Photo attached', action: 'remove' }
    case 'saved':
      return { text: 'Receipt attached', action: 'replace' }
    case 'none':
      return { text: null, action: 'attach' }
  }
}

/**
 * The expense screen's receipt card. A deleted expense is read-only; a private group's photo can
 * be added only while the group is open (it has to be sealed with the group's key on the phone).
 */
export function receiptCard(o: { hasPhoto: boolean; trashed: boolean; canSeal: boolean }): { show: boolean; add: boolean; replace: boolean } {
  const writable = !o.trashed && o.canSeal
  return { show: o.hasPhoto || writable, add: !o.hasPhoto && writable, replace: o.hasPhoto && writable }
}

/** A photo added on the expense screen counts as done once the expense names a different photo than before. */
export const photoArrived = (before: string | undefined, now: string | undefined): boolean => !!now && now !== before

/** The full-screen viewer: fitted to the screen, or at full size (scrolled); a tap switches. */
export type ViewerZoom = 'fit' | 'full'
export const nextZoom = (z: ViewerZoom): ViewerZoom => (z === 'fit' ? 'full' : 'fit')
