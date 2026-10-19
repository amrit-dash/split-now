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
