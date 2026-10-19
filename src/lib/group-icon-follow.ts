/*
 * Whether a group's icon follows its name as it's typed (the app's own rules, then the AI pick and
 * its second icon: src/pages/GroupForm.tsx). Pure.
 *
 * A new group: until an icon is chosen. A saved group: its icon was chosen when it was made, so only
 * once it's renamed, until one is chosen on the edit screen, and never over a drawn picture or photo
 * (those take real effort to make; the AI's emoji would quietly throw them away).
 */
export function iconFollowsName(o: { editing: boolean; renamed: boolean; iconTouched: boolean; iconChosen: boolean; hasPicture: boolean }): boolean {
  if (!o.editing) return !o.iconTouched
  return o.renamed && !o.iconChosen && !o.hasPicture
}

/** The AI's answer for a name: its pick, then the others it offered. */
export interface AiPick {
  title: string
  emojis: string[]
}

/** The AI's others to offer as pills: while the icon is one of its answer for this name, the rest of it. */
export function altsOffered(pick: AiPick | null, o: { name: string; emoji: string; picking: boolean }): string[] {
  if (o.picking || !pick || pick.title !== o.name || !pick.emojis.includes(o.emoji)) return []
  return pick.emojis.filter((e) => e !== o.emoji)
}

/** Whether the icon now is one the name gave (the app's own rules, or the AI's answer). */
export const iconFromName = (emoji: string, nameIcon: string | null, pick: AiPick | null): boolean => emoji === nameIcon || !!pick?.emojis.includes(emoji)

/**
 * A type chosen after the name gave the icon: its icon is offered beside the name's, not swapped in
 * (the AI comes last, the name says more than the type). Null: nothing to offer.
 */
export function typeIconOffer(o: { editing: boolean; typeChosen: boolean; fromName: boolean; typeIcon: string; emoji: string }): string | null {
  if (o.editing || !o.typeChosen || !o.fromName || !o.typeIcon || o.typeIcon === o.emoji) return null
  return o.typeIcon
}
