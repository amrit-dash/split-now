/**
 * The group menu's Archive / Unarchive row (archiving is personal: shared/archive.ts). You can
 * archive a group only once you are square in it, so it never hides money you owe or are owed;
 * a new expense or payment that involves you brings it back by itself. Unarchiving is always
 * allowed. A personal wallet has nobody to settle with.
 */
export interface ArchiveRowInput {
  archived: boolean
  personal: boolean
  /** your net balance in the group (minor units) */
  myBalance: number
  /** expenses or payments involving you still waiting for an OK */
  waitingOnYou: number
}

export interface ArchiveRow {
  label: 'Archive' | 'Unarchive'
  hint: string
  disabled: boolean
}

export function archiveRow(i: ArchiveRowInput): ArchiveRow {
  if (i.archived) return { label: 'Unarchive', hint: 'Back into your balances and pickers', disabled: false }
  if (!i.personal && i.myBalance !== 0) return { label: 'Archive', hint: 'Settle up first: archive once you’re square', disabled: true }
  if (!i.personal && i.waitingOnYou > 0) return { label: 'Archive', hint: 'Once nothing waits for your OK', disabled: true }
  return {
    label: 'Archive',
    hint: i.personal ? 'Kept, but out of your pickers' : 'Only for you: hidden from balances and pickers until something new involves you',
    disabled: false,
  }
}
