/*
 * The main features' animated scenes in Help (drawn by src/features/help/Scene.tsx): each is a
 * few small mock screens of the app, built from simple parts, and each step of the section
 * (src/lib/help-content.ts) names the part it's about with its `mark`. Playing a step shows the
 * screen holding that part (sliding in, or rising as a sheet over the screen before it) and
 * taps it: a pointer moves there, presses, and the part reacts (a field types its value, a
 * switch turns on, a chip is picked). Pure data and lookups, so a test can check every mark.
 */

export type PartKind =
  | 'title' // a screen's heading
  | 'field' // a text field: types `value` when tapped
  | 'row' // a label with a value on the right (Paid by, Split)
  | 'button' // a full-width button; `primary` for the main one
  | 'chips' // a row of choices; the tapped one is picked
  | 'tiles' // big buttons in a grid (the + sheet)
  | 'list' // rows of people or groups, each with an icon
  | 'switch' // a labelled switch: turns on when tapped
  | 'note' // a quiet line of text
  | 'emoji' // a grid of icons
  | 'qr' // a payment QR card
  | 'pattern' // a lock button taking taps and long presses
  | 'faceid' // the Face ID prompt
  | 'locked' // a private group's row while locked
  | 'donut' // a category chart
  | 'bars' // a bar chart
  | 'tabbar' // the bottom tab bar, with the + in the middle
  | 'message' // a phone notification or SMS

export interface PartItem {
  label: string
  icon?: string
  mark?: string
  /** shown as chosen before anything is tapped */
  on?: boolean
}

export interface Part {
  kind: PartKind
  label?: string
  value?: string
  icon?: string
  mark?: string
  primary?: boolean
  items?: PartItem[]
}

export interface Screen {
  /** drawn as a sheet rising over the screen before it */
  sheet?: boolean
  parts: Part[]
}

export type Scene = Screen[]

const tabbar = (plus?: string, active?: string, insights?: string): Part => ({
  kind: 'tabbar',
  items: [
    { label: 'Home', icon: '🏠', on: active === 'Home' },
    { label: 'Groups', icon: '👥', on: active === 'Groups' },
    { label: 'Create', icon: '+', mark: plus },
    { label: 'Insights', icon: '📊', mark: insights, on: active === 'Insights' },
    { label: 'Profile', icon: '🙂' },
  ],
})

const home = (mark?: string): Screen => ({
  parts: [
    { kind: 'title', label: 'Hi Asha' },
    { kind: 'row', label: 'Overall, you are owed', value: '₹2,450' },
    {
      kind: 'list',
      items: [
        { label: 'Goa trip', icon: '🏖️' },
        { label: 'Indiranagar flat', icon: '🏠' },
      ],
    },
    tabbar(mark, 'Home'),
  ],
})

const createSheet = (marks: { add?: string; scan?: string; group?: string; line?: string; chip?: string; go?: string }): Screen => ({
  sheet: true,
  parts: [
    { kind: 'button', label: 'Add expense', primary: true, mark: marks.add },
    {
      kind: 'tiles',
      items: [
        { label: 'Live table', icon: '🍽️' },
        { label: 'Scan', icon: '📷', mark: marks.scan },
        { label: 'New group', icon: '👥', mark: marks.group },
        { label: 'Settle up', icon: '💸' },
      ],
    },
    { kind: 'field', label: 'Quick add', value: 'dinner 1200 with Rahul, I paid', mark: marks.line },
    ...(marks.chip ? [{ kind: 'chips' as const, mark: marks.chip, items: [{ label: 'Into Goa trip ▾', on: true }] }] : []),
    ...(marks.go ? [{ kind: 'button' as const, label: 'Send', mark: marks.go }] : []),
  ],
})

const expenseForm = (marks: Partial<Record<'group' | 'desc' | 'amount' | 'payer' | 'split' | 'save', string>>): Screen => ({
  parts: [
    { kind: 'title', label: 'Add expense' },
    { kind: 'row', label: 'With', value: 'Goa trip · Change', mark: marks.group },
    { kind: 'field', label: 'What was it for?', value: 'Beach shack dinner', icon: '🍽️', mark: marks.desc },
    { kind: 'field', label: 'Amount in INR', value: '₹4,850', mark: marks.amount },
    { kind: 'row', label: 'Paid by', value: 'You', mark: marks.payer },
    { kind: 'row', label: 'Split', value: 'Equally · ₹1,212.50 each', mark: marks.split },
    { kind: 'button', label: 'Save', primary: true, mark: marks.save },
  ],
})

export const SCENES: Record<string, Scene> = {
  'create-group': [
    home('plus'),
    createSheet({}),
    {
      parts: [
        { kind: 'title', label: 'New group' },
        {
          kind: 'chips',
          mark: 'kind',
          items: [{ label: 'Group', on: true }, { label: '1:1 friend' }, { label: 'Personal' }],
        },
        { kind: 'field', label: 'Name', value: 'Goa trip', icon: '🏖️', mark: 'name' },
        { kind: 'chips', items: [{ label: '✈️ Trip', on: true }, { label: '🍽️ Dinner' }, { label: '🏠 Home' }] },
        {
          kind: 'list',
          mark: 'members',
          label: 'Members',
          items: [
            { label: 'You', icon: '🙂' },
            { label: 'Rahul', icon: '🧑' },
            { label: 'Priya', icon: '👩' },
          ],
        },
        { kind: 'row', label: 'More options', value: 'INR · simplify on', mark: 'more' },
        { kind: 'button', label: 'Create group', primary: true, mark: 'save' },
      ],
    },
  ],
  'add-expense': [home('plus'), createSheet({}), expenseForm({ group: 'group', desc: 'desc', amount: 'amount', payer: 'payer', split: 'split', save: 'save' })],
  'split-types': [
    expenseForm({ split: 'split' }),
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'How to split it' },
        {
          kind: 'chips',
          items: [
            { label: 'Equally', mark: 'equal', on: true },
            { label: 'Exact', mark: 'exact' },
            { label: 'By items', mark: 'items' },
            { label: 'More ways', mark: 'more' },
          ],
        },
        {
          kind: 'list',
          items: [
            { label: 'You · ₹1,212.50', icon: '✅' },
            { label: 'Rahul · ₹1,212.50', icon: '✅' },
            { label: 'Priya · ₹1,212.50', icon: '✅' },
            { label: 'Dev · ₹1,212.50', icon: '✅' },
          ],
        },
        { kind: 'button', label: 'Done', primary: true, mark: 'done' },
      ],
    },
  ],
  'settle-up-upi': [
    {
      parts: [
        { kind: 'title', label: 'Goa trip' },
        { kind: 'row', label: 'You owe Rahul', value: '₹1,240' },
        { kind: 'button', label: 'Settle up', primary: true, mark: 'settle' },
        { kind: 'chips', items: [{ label: 'Expenses', on: true }, { label: 'Balances' }, { label: 'Activity' }] },
      ],
    },
    {
      parts: [
        { kind: 'title', label: 'Settle up' },
        { kind: 'row', label: 'You → Rahul', value: '₹1,240', mark: 'people' },
        { kind: 'qr', label: 'Pay ₹1,240 with a UPI app', value: 'rahul@okaxis', mark: 'upi' },
        { kind: 'chips', items: [{ label: 'UPI', on: true }, { label: 'Cash' }, { label: 'Bank transfer' }] },
        { kind: 'button', label: 'Record ₹1,240', primary: true, mark: 'record' },
      ],
    },
  ],
  'scan-receipt': [
    home(undefined),
    createSheet({ scan: 'scan' }),
    {
      parts: [
        { kind: 'title', label: 'Scan' },
        { kind: 'chips', items: [{ label: 'Bill', on: true }, { label: 'Payment' }, { label: 'Statement' }] },
        { kind: 'button', label: '📷 Camera', primary: true, mark: 'camera' },
        { kind: 'button', label: 'Photos' },
      ],
    },
    {
      parts: [
        { kind: 'title', label: 'What we found' },
        {
          kind: 'list',
          mark: 'found',
          items: [
            { label: 'Britto’s, Baga', icon: '🏪' },
            { label: 'Total ₹3,240', icon: '🧾' },
            { label: '4 items', icon: '🍤' },
          ],
        },
        {
          kind: 'list',
          label: 'Add to which group?',
          mark: 'group',
          items: [
            { label: 'Goa trip · Continue →', icon: '🏖️' },
            { label: 'Indiranagar flat', icon: '🏠' },
          ],
        },
      ],
    },
  ],
  'quick-add': [home('plus'), createSheet({ line: 'line', chip: 'chip', go: 'go' }), expenseForm({ save: 'save' })],
  'private-groups': [
    {
      parts: [
        { kind: 'title', label: 'Encrypted groups' },
        { kind: 'switch', label: 'Passkey added', value: 'on' },
        { kind: 'button', label: 'Set universal pattern', primary: true, mark: 'settings' },
      ],
    },
    {
      parts: [
        { kind: 'title', label: 'New group' },
        { kind: 'field', label: 'Name', value: 'Family', icon: '🏡' },
        { kind: 'switch', label: 'Private group', mark: 'make' },
        { kind: 'note', label: 'Encrypted, opens with your pattern and Face ID.' },
      ],
    },
    {
      parts: [
        { kind: 'title', label: 'Groups' },
        { kind: 'locked', label: 'Ẍq#v·9k', mark: 'locked' },
        { kind: 'pattern', label: 'Private groups', mark: 'pattern' },
      ],
    },
    { sheet: true, parts: [{ kind: 'faceid', label: 'Face ID', mark: 'faceid' }] },
  ],
  'icons-and-ai': [
    {
      parts: [
        { kind: 'title', label: 'Add expense' },
        { kind: 'field', label: 'What was it for?', value: 'Ferry to Havelock', icon: '⛴️', mark: 'title' },
        { kind: 'row', label: 'Icon', value: '⛴️ · hold to change', mark: 'icon' },
        { kind: 'field', label: 'Amount in INR', value: '₹640' },
      ],
    },
    {
      sheet: true,
      parts: [
        { kind: 'row', label: 'Automatic', value: '⛴️', mark: 'auto' },
        { kind: 'field', label: 'Search icons', value: 'kayak', mark: 'search' },
        { kind: 'emoji', items: [{ label: '🛶' }, { label: '🚣' }, { label: '🏝️' }, { label: '🌊' }, { label: '⛵' }, { label: '🐬' }] },
        { kind: 'button', label: '✨ Suggest with AI for “kayak”', mark: 'ai' },
      ],
    },
  ],
  'auto-capture-setup': [
    {
      parts: [
        { kind: 'title', label: 'Automation' },
        { kind: 'button', label: 'Set up auto-capture', primary: true, mark: 'start' },
        { kind: 'note', label: 'Takes about 3 minutes. Works with any bank that sends SMS.' },
      ],
    },
    {
      parts: [
        { kind: 'title', label: 'Your phone' },
        { kind: 'row', label: 'Capture key', value: 'Copied', mark: 'key' },
        { kind: 'button', label: 'Add the Split Now shortcut', primary: true, mark: 'phone' },
      ],
    },
    {
      parts: [
        { kind: 'message', label: 'HDFC Bank', value: 'Rs 840 debited at SWIGGY' },
        { kind: 'row', label: 'Got it', value: '₹840 at Swiggy', mark: 'got' },
        { kind: 'button', label: 'Split equally in Goa trip', primary: true, mark: 'split' },
      ],
    },
  ],
  insights: [
    { parts: [{ kind: 'title', label: 'Home' }, { kind: 'row', label: 'Overall, you are owed', value: '₹2,450' }, tabbar(undefined, 'Home', 'tab')] },
    {
      parts: [
        { kind: 'title', label: 'Insights' },
        { kind: 'chips', mark: 'filters', items: [{ label: 'Last 3 months', on: true }, { label: 'All groups' }, { label: 'My share' }] },
        { kind: 'donut', label: 'Where it goes', mark: 'donut' },
        { kind: 'bars', label: 'Spending over time', mark: 'bars' },
      ],
    },
  ],
}

/** Every mark in a part or its items. */
const marksOf = (p: Part): string[] => [p.mark, ...(p.items ?? []).map((i) => i.mark)].filter((m): m is string => !!m)

/** Each scene's marks, in order: what steps may point at (a test checks the content against it). */
export const SCENE_MARKS: Record<string, string[]> = Object.fromEntries(
  Object.entries(SCENES).map(([id, scene]) => [id, scene.flatMap((s) => s.parts.flatMap(marksOf))]),
)

/**
 * Where a mark is: its screen (and, for a sheet, the screen under it), and its part and item.
 * The insights scene's tab sits on the first screen; the pointer taps it there. Null for a
 * mark the scene doesn't have (the step is shown without a pointer, on the first screen).
 */
export function findMark(scene: Scene, mark: string | undefined): { screen: number; base: number | null; part: number; item: number | null } | null {
  if (!mark) return null
  for (let s = 0; s < scene.length; s++) {
    const parts = scene[s].parts
    for (let p = 0; p < parts.length; p++) {
      const item = (parts[p].items ?? []).findIndex((i) => i.mark === mark)
      if (parts[p].mark === mark || item >= 0) return { screen: s, base: baseOf(scene, s), part: p, item: item >= 0 ? item : null }
    }
  }
  return null
}

/** The screen a sheet rises over: the nearest one before it that isn't a sheet. */
export function baseOf(scene: Scene, s: number): number | null {
  if (!scene[s]?.sheet) return null
  for (let i = s - 1; i >= 0; i--) if (!scene[i].sheet) return i
  return null
}
