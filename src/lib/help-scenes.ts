/*
 * The main features' animated scenes in Help (drawn by src/features/help/Scene.tsx): each is a
 * few small mock screens of the app, built from simple parts, and each step of the section
 * (src/lib/help-content.ts) names the part it's about with its `mark`. Playing a step shows the
 * screen holding that part (sliding in, or rising as a sheet over the screen before it) and
 * taps it: a pointer moves there, presses, and the part reacts (a field types its value, a
 * switch turns on, a chip is picked). Pure data and lookups, so a test can check every mark.
 */

import type { SceneGlyph } from './ui-icons'

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
  /** an emoji the person chose (a group's or an expense's icon, an avatar) */
  icon?: string
  /** an interface icon (src/lib/ui-icons.ts), drawn as the app draws it */
  glyph?: SceneGlyph
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

const tabbar = (plus?: string, active?: string, live?: string): Part => ({
  kind: 'tabbar',
  items: [
    { label: 'Home', glyph: 'house', on: active === 'Home' },
    { label: 'Groups', glyph: 'users', on: active === 'Groups' },
    { label: 'Create', icon: '+', mark: plus },
    { label: 'Live table', glyph: 'liveTable', mark: live, on: active === 'Live table' },
    { label: 'Profile', glyph: 'user', on: active === 'Profile' },
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
    { kind: 'field', label: 'Quick add', value: 'dinner 1200 with Rahul, I paid', mark: marks.line },
    ...(marks.chip ? [{ kind: 'chips' as const, mark: marks.chip, items: [{ label: 'Into Goa trip ▾', on: true }] }] : []),
    ...(marks.go ? [{ kind: 'button' as const, label: 'Send', mark: marks.go }] : []),
    { kind: 'note', label: 'or' },
    { kind: 'button', label: 'Add expense', primary: true, mark: marks.add },
    {
      kind: 'tiles',
      items: [
        { label: 'New group', glyph: 'users', mark: marks.group },
        { label: 'Scan', glyph: 'camera', mark: marks.scan },
      ],
    },
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
            { label: 'You · ₹1,212.50', glyph: 'checkCircle' },
            { label: 'Rahul · ₹1,212.50', glyph: 'checkCircle' },
            { label: 'Priya · ₹1,212.50', glyph: 'checkCircle' },
            { label: 'Dev · ₹1,212.50', glyph: 'checkCircle' },
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
        { kind: 'note', label: 'Private groups are off' },
        { kind: 'button', label: 'Turn on private groups', primary: true, mark: 'settings' },
        { kind: 'row', label: 'Universal pattern', value: '＋ Set' },
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
    {
      parts: [
        { kind: 'title', label: 'Hi Asha' },
        { kind: 'row', label: 'Settings', value: '›' },
        { kind: 'row', label: 'Insights', value: '›', mark: 'tab' },
        { kind: 'row', label: 'Balances', value: '›' },
        tabbar(undefined, 'Profile'),
      ],
    },
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

/*
 * The other sections' scenes: the same parts, smaller stories (a screen or two each), so every
 * section in Help plays rather than shows a picture.
 */
const settings = (title: string, parts: Part[]): Screen => ({ parts: [{ kind: 'title', label: title }, ...parts] })

Object.assign(SCENES, {
  'help-guide': [
    settings('Profile', [
      { kind: 'row', label: 'Settings', value: '›' },
      { kind: 'row', label: 'Help', value: 'New', mark: 'profile' },
      { kind: 'row', label: 'Balances', value: '›' },
    ]),
    settings('Help', [
      { kind: 'chips', mark: 'whatsnew', items: [{ label: 'Guide', on: true }, { label: 'What’s new ●' }] },
      { kind: 'field', label: 'Search', value: 'refund', mark: 'search' },
      {
        kind: 'tiles',
        items: [
          { label: 'Add an expense', glyph: 'receipt' },
          { label: 'Ways to split', glyph: 'divide' },
          { label: 'Settle up', glyph: 'money' },
          { label: 'Scan a bill', glyph: 'camera' },
        ],
      },
    ]),
  ],
  'sign-in': [
    settings('Split Now', [
      { kind: 'note', label: 'Split bills, not friendships.' },
      { kind: 'button', label: 'Continue with Google', primary: true, mark: 'google' },
      { kind: 'field', label: 'Your email', value: 'asha@example.com', mark: 'email' },
      { kind: 'button', label: 'Email me a sign-in link' },
    ]),
    settings('Welcome', [
      { kind: 'field', label: 'What should friends call you?', value: 'Asha Rao', mark: 'name' },
      { kind: 'button', label: 'Continue', primary: true },
    ]),
  ],
  'money-received': [
    settings('Add expense', [
      { kind: 'chips', mark: 'switch', items: [{ label: 'Expense' }, { label: 'Money received', on: true }] },
      { kind: 'field', label: 'Amount in INR', value: '₹1,000' },
      { kind: 'row', label: 'Received by', value: 'Rahul', mark: 'who' },
      { kind: 'row', label: 'Shared with', value: 'Everyone' },
      { kind: 'button', label: 'Save', primary: true, mark: 'save' },
    ]),
  ],
  'receipt-photos': [
    settings('Add expense', [
      { kind: 'field', label: 'What was it for?', value: 'Dinner at Toit', icon: '🍺' },
      { kind: 'field', label: 'Amount in INR', value: '₹3,240' },
      { kind: 'chips', items: [{ label: 'Today', on: true }, { label: 'Yesterday' }, { label: '📎 Attach', mark: 'attach' }] },
      {
        kind: 'list',
        label: '2 of 4 attached',
        items: [
          { label: 'Card slip', glyph: 'receipt' },
          { label: 'Second page', glyph: 'file' },
        ],
      },
      { kind: 'button', label: 'Save', primary: true, mark: 'save' },
    ]),
    settings('Dinner at Toit', [
      { kind: 'row', label: 'Photos (2)', value: 'Scanned receipt · 1 attached' },
      { kind: 'button', label: '＋ Add a photo', mark: 'add' },
    ]),
  ],
  'private-groups-setup': [
    settings('Settings', [
      { kind: 'row', label: 'Preferences', value: '›' },
      { kind: 'row', label: 'Encrypted groups', value: 'Off ›' },
      { kind: 'row', label: 'Notifications', value: '›' },
    ]),
    settings('Encrypted groups', [
      { kind: 'note', label: 'Private groups are off' },
      { kind: 'button', label: 'Turn on private groups', primary: true, mark: 'open' },
    ]),
    settings('Encrypted groups', [
      { kind: 'row', label: 'Passkey · Face ID', value: '＋ Add', mark: 'passkey' },

      { kind: 'row', label: 'Universal pattern', value: '＋ Set' },
      { kind: 'row', label: 'Encryption key', value: 'Ready ✓' },
    ]),
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'Universal pattern' },
        { kind: 'pattern', label: 'Tap and long-press, 6 or more', mark: 'pattern' },
        { kind: 'switch', label: 'Follow the sequence', mark: 'order' },
        { kind: 'button', label: 'Save pattern', primary: true, mark: 'save' },
      ],
    },
  ],
  'private-groups-unlock': [
    settings('Groups', [
      { kind: 'locked', label: 'Ẍq#v·9k' },
      { kind: 'pattern', label: 'Private groups', mark: 'pattern' },
      { kind: 'note', label: 'Checked a moment after you stop', mark: 'pause' },
    ]),
    { sheet: true, parts: [{ kind: 'faceid', label: 'Face ID', mark: 'faceid' }] },
  ],
  'private-groups-make': [
    settings('New group', [
      { kind: 'field', label: 'Name', value: 'Family', icon: '🏡' },
      { kind: 'switch', label: 'Private group', value: 'on', mark: 'new' },
      { kind: 'chips', items: [{ label: 'Universal pattern', on: true }, { label: 'Its own pattern' }] },
      { kind: 'row', label: 'Universal pattern', value: 'Ready ✓' },
    ]),
    settings('Goa trip ⋯', [
      { kind: 'row', label: 'Edit group', value: '›' },
      { kind: 'row', label: 'Make private', value: '🔐', mark: 'menu' },
      { kind: 'row', label: 'Export CSV', value: '›' },
    ]),
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'Private group' },
        { kind: 'chips', items: [{ label: 'Universal pattern', on: true }, { label: 'Its own pattern' }] },
        { kind: 'row', label: 'Passkey', value: 'Added ✓' },
        { kind: 'button', label: 'Turn off private', mark: 'off' },
      ],
    },
  ],
  'private-groups-own-pattern': [
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'Private group' },
        { kind: 'chips', mark: 'give', items: [{ label: 'Universal pattern' }, { label: 'Its own pattern', on: true }] },
        { kind: 'pattern', label: 'Any length', mark: 'draw' },
        { kind: 'note', label: 'Group pattern saved. Tell the group in person.', mark: 'tell' },
      ],
    },
  ],
  'private-groups-join': [
    settings('A private group', [
      { kind: 'note', label: 'Its creator lets each person in.' },
      { kind: 'button', label: 'Ask to join', primary: true, mark: 'ask' },
    ]),
    settings('Inbox', [
      { kind: 'list', label: 'Asking to join', items: [{ label: 'Priya', icon: '👩' }] },
      { kind: 'chips', mark: 'approve', items: [{ label: 'Let them in', on: true }, { label: 'Decline' }] },
    ]),
  ],
  'private-groups-auto-lock': [
    settings('Encrypted groups', [
      { kind: 'chips', mark: 'time', items: [{ label: '1 min' }, { label: '5 min', on: true }, { label: '1 hour' }, { label: 'On close' }] },
      { kind: 'switch', label: 'Lock when I leave the app', value: 'on', mark: 'leave' },
    ]),
  ],
  'private-groups-stop': [
    settings('Encrypted groups', [
      { kind: 'row', label: 'Universal pattern', value: 'Set' },
      { kind: 'row', label: 'Passkeys', value: '1' },
      { kind: 'button', label: 'Stop using private groups', mark: 'stop' },
    ]),
  ],
  'ai-features': [
    settings('Settings', [
      { kind: 'row', label: 'Preferences', value: '›' },
      { kind: 'row', label: 'AI features', value: '›', mark: 'open' },
    ]),
    settings('AI features', [
      { kind: 'switch', label: 'Use AI', mark: 'use' },
      { kind: 'row', label: 'Model for pictures', value: 'Recommended' },
      { kind: 'row', label: 'Which key', value: 'Automatic' },
    ]),
  ],
  'admin-console': [
    settings('Settings', [
      { kind: 'row', label: 'AI features', value: '›' },
      { kind: 'row', label: 'Admin', value: '🛠️', mark: 'admin' },
    ]),
  ],
  'invite-people': [
    settings('Goa trip', [
      { kind: 'row', label: 'You are owed', value: '₹1,200' },
      { kind: 'chips', items: [{ label: 'Settle up' }, { label: 'Invite', mark: 'invite' }] },
      {
        kind: 'list',
        items: [
          { label: 'Dinner at Bob’s Bar', icon: '🍽️' },
          { label: 'Scooter rental', icon: '🛵' },
        ],
      },
    ]),
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'Invite to group' },
        { kind: 'qr', label: 'Scan with the phone camera', mark: 'qr' },
        { kind: 'chips', items: [{ label: 'Copy link' }, { label: 'Share', mark: 'share' }] },
      ],
    },
  ],
  'join-group': [
    { parts: [{ kind: 'message', label: 'Rahul', value: 'Join Goa trip on Split Now: split-now.app/join/K7Q2', mark: 'open' }] },
    settings('Join Goa trip', [
      { kind: 'note', label: 'Which one is you?' },
      { kind: 'chips', mark: 'pick', items: [{ label: 'Priya' }, { label: 'Asha', on: true }, { label: 'I’m not listed' }] },
      { kind: 'button', label: 'Join group', primary: true, mark: 'join' },
    ]),
  ],
  'people-without-account': [
    settings('Members', [
      {
        kind: 'list',
        items: [
          { label: 'You', icon: '🙂' },
          { label: 'Rahul · Joined', icon: '😄' },
        ],
      },
      { kind: 'button', label: 'Add people', mark: 'add' },
    ]),
    {
      sheet: true,
      parts: [
        { kind: 'field', label: 'Name', value: 'Meera', mark: 'name' },
        { kind: 'field', label: 'Email (optional)', value: 'meera@example.com' },
        { kind: 'row', label: 'Meera', value: 'Not joined yet', mark: 'status' },
      ],
    },
  ],
  'merge-people': [
    settings('Members', [
      { kind: 'row', label: 'Meera', value: '← Merge', mark: 'swipe' },
      { kind: 'row', label: 'meera@example.com', value: 'Not joined yet' },
    ]),
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'Who else is Meera?' },
        {
          kind: 'list',
          items: [
            { label: 'meera@example.com', icon: '📧', mark: 'pick' },
            { label: 'Rahul', icon: '😄' },
          ],
        },
        { kind: 'button', label: 'Merge', primary: true, mark: 'merge' },
      ],
    },
  ],
  'edit-group': [
    settings('Goa trip', [
      { kind: 'row', label: '⚙ Group settings', value: '›', mark: 'menu' },
      { kind: 'row', label: 'You are owed', value: '₹1,200' },
    ]),
    settings('Edit group', [
      { kind: 'field', label: 'Name', value: 'Goa trip', icon: '🏖️', mark: 'name' },
      { kind: 'row', label: 'Currency · Budget', value: 'INR · ₹40,000', mark: 'money' },
      { kind: 'switch', label: 'Simplify debts' },
      { kind: 'button', label: 'Save changes', primary: true, mark: 'save' },
    ]),
  ],
  approvals: [
    settings('Edit group', [
      { kind: 'row', label: 'Approvals', value: '›', mark: 'open' },
      { kind: 'switch', label: 'Needs your OK for big expenses', mark: 'big' },
      { kind: 'row', label: 'Needs an OK above', value: '₹2,000' },
      { kind: 'switch', label: 'Approve small edits automatically', mark: 'small' },
      { kind: 'switch', label: 'Payments need the recipient’s OK', mark: 'pay' },
    ]),
  ],
  'approve-new-people': [
    settings('Edit group', [
      { kind: 'row', label: 'Approvals', value: 'New people' },
      { kind: 'switch', label: 'New people need my OK', value: 'on', mark: 'turn' },
    ]),
    settings('Join Goa trip', [
      { kind: 'note', label: 'The person who made this group lets new people in.' },
      { kind: 'button', label: 'Ask to join', primary: true, mark: 'ask' },
    ]),
    settings('Inbox', [
      { kind: 'list', label: 'Asking to join', items: [{ label: 'Priya', icon: '👩' }] },
      { kind: 'chips', mark: 'decide', items: [{ label: 'Let them in', on: true }, { label: 'Decline' }] },
    ]),
  ],
  'group-budget': [
    settings('Edit group', [
      { kind: 'field', label: 'Budget (optional)', value: '₹40,000', mark: 'set' },
      { kind: 'button', label: 'Save changes', primary: true },
    ]),
    settings('Goa trip', [{ kind: 'row', label: 'Budget ₹40,000 · 82% used', value: '₹7,200 left', mark: 'card' }, { kind: 'bars' }]),
  ],
  'group-types': [
    settings('New group', [
      { kind: 'field', label: 'Name', value: 'Goa trip', icon: '🏖️' },
      { kind: 'chips', mark: 'type', items: [{ label: 'Trip', on: true }, { label: 'Home' }, { label: 'Event' }, { label: 'Office' }] },
      { kind: 'row', label: 'Trip dates', value: '12 – 16 Oct', mark: 'dates' },
    ]),
    settings('Groups', [
      {
        kind: 'list',
        items: [
          { label: 'Goa trip · Live', icon: '🏖️', mark: 'live' },
          { label: 'Indiranagar flat', icon: '🏠' },
        ],
      },
    ]),
  ],
  'archive-leave-delete': [
    settings('Goa trip', [
      { kind: 'row', label: '⚙ Group settings', value: '›', mark: 'menu' },
      { kind: 'row', label: 'All settled up', value: '✓' },
    ]),
    {
      sheet: true,
      parts: [
        { kind: 'row', label: 'Archive', value: 'Only for you', mark: 'archive' },
        { kind: 'row', label: 'Leave group', value: '›', mark: 'leave' },
        { kind: 'row', label: 'Delete group', value: '30 days to restore', mark: 'delete' },
      ],
    },
  ],
  'remove-member': [
    settings('Members', [
      { kind: 'row', label: 'Kabir', value: '← Remove', mark: 'swipe' },
      { kind: 'row', label: 'Meera', value: 'settled' },
    ]),
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'Remove Kabir?' },
        { kind: 'note', label: 'Their expenses stay. They can rejoin with the invite link.' },
        { kind: 'button', label: 'Remove', primary: true, mark: 'remove' },
      ],
    },
  ],
  'group-chat': [
    settings('Goa trip', [
      { kind: 'row', label: '💬 Group chat', value: '●', mark: 'open' },
      { kind: 'row', label: 'You are owed', value: '₹1,200' },
    ]),
    settings('Chat', [
      { kind: 'message', label: 'Rahul', value: 'Who paid for the ferry?', mark: 'hold' },
      { kind: 'field', label: 'Message', value: '/settle', mark: 'slash' },
      { kind: 'chips', mark: 'tag', items: [{ label: '@Meera' }, { label: '@everyone' }] },
    ]),
  ],
  'open-items': [
    settings('Goa trip', [
      { kind: 'chips', items: [{ label: 'Expenses' }, { label: 'Open', on: true }, { label: 'Balances' }] },
      { kind: 'button', label: '＋ Add an open item', mark: 'add' },
    ]),
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'New open item' },
        { kind: 'field', label: 'What was it?', value: 'Ferry to Havelock', icon: '⛴️', mark: 'title' },
        { kind: 'chips', mark: 'who', items: [{ label: 'Rahul' }, { label: 'Priya' }, { label: 'Me' }] },
      ],
    },
    settings('Goa trip', [
      { kind: 'row', label: '⛴️ Ferry to Havelock', value: 'Rahul might have paid' },
      { kind: 'button', label: 'Claim', primary: true, mark: 'claim' },
    ]),
  ],
  'edit-delete-expense': [
    settings('Dinner at Bob’s Bar', [
      { kind: 'chips', mark: 'top', items: [{ label: '⧉ Add again' }, { label: '✎ Edit' }, { label: '🗑 Delete' }] },
      { kind: 'row', label: 'Paid by Asha', value: '₹3,240' },
      { kind: 'row', label: 'Split equally', value: '3 people' },
    ]),
    settings('Goa trip', [
      { kind: 'row', label: 'Scooter rental', value: '✎ Edit · 🗑 Delete', mark: 'swipe' },
      { kind: 'row', label: 'Ferry tickets', value: '₹600' },
      { kind: 'message', label: 'Deleted “Scooter rental”', value: 'Undo', mark: 'undo' },
    ]),
  ],
  'recently-deleted': [
    settings('Goa trip', [
      { kind: 'chips', items: [{ label: 'Expenses' }, { label: 'Balances' }, { label: 'Activity', mark: 'tab' }] },
      { kind: 'row', label: 'Recently deleted', value: '2', mark: 'open' },
      { kind: 'note', label: 'Rahul added Ferry tickets' },
    ]),
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'Recently deleted' },
        { kind: 'row', label: 'Scooter rental · 28d left', value: 'Restore', mark: 'restore' },
        { kind: 'row', label: 'Payment to Rahul · 12d left', value: 'Restore' },
      ],
    },
  ],
  'repeating-expenses': [
    settings('Add expense', [
      { kind: 'field', label: 'What was it for?', value: 'Rent', icon: '🏠' },
      { kind: 'row', label: 'More', value: 'Doesn’t repeat · No notes', mark: 'more' },
      { kind: 'chips', mark: 'repeat', items: [{ label: 'Weekly' }, { label: 'Monthly', on: true }, { label: 'Yearly' }] },
      { kind: 'row', label: 'Ends', value: 'Never', mark: 'ends' },
    ]),
    settings('Rent', [
      { kind: 'row', label: 'Repeats monthly', value: 'Next on 1 Nov' },
      { kind: 'button', label: 'Stop repeating', mark: 'stop' },
    ]),
  ],
  'comments-flags': [
    settings('Dinner at Bob’s Bar', [
      { kind: 'message', label: 'Rahul', value: 'Did this include the drinks?' },
      { kind: 'field', label: 'Add a comment', value: 'Yes, all of them', mark: 'comment' },
      { kind: 'button', label: 'Flag a problem', mark: 'flag' },
    ]),
    settings('Dinner at Bob’s Bar', [
      { kind: 'row', label: 'Flagged · still counted', value: 'Meera: I wasn’t there' },
      { kind: 'button', label: 'Resolve my flag', primary: true, mark: 'resolve' },
    ]),
  ],
  'categories-notes-dates': [
    settings('Add expense', [
      { kind: 'field', label: 'What was it for?', value: 'Uber to airport', icon: '🚕', mark: 'category' },
      { kind: 'chips', items: [{ label: 'Today' }, { label: 'Yesterday', mark: 'date' }, { label: '12 Oct' }] },
      { kind: 'field', label: 'Notes', value: 'Shared with Rahul', mark: 'notes' },
    ]),
  ],
  'foreign-currency': [
    settings('Add expense', [
      { kind: 'field', label: 'Amount', value: '฿1,200', mark: 'currency' },
      { kind: 'chips', mark: 'pick', items: [{ label: 'INR' }, { label: 'THB', on: true }, { label: 'USD' }] },
      { kind: 'note', label: '≈ ₹2,916 at 1 THB = 2.43 INR (ECB) · Edit rate', mark: 'rate' },
    ]),
  ],
  'split-by-items': [
    settings('Add expense', [
      { kind: 'chips', items: [{ label: 'Equally' }, { label: 'Exact' }, { label: 'By items', mark: 'items' }] },
      { kind: 'row', label: 'Pizza · Asha, Ravi', value: '₹640', mark: 'add' },
      { kind: 'row', label: 'Beer · Ravi ×2, Meera', value: '₹450', mark: 'portions' },
      { kind: 'row', label: 'Tax, tip or discount', value: '₹110 shared', mark: 'rest' },
    ]),
  ],
  'several-payers': [
    settings('Add expense', [{ kind: 'row', label: 'Paid by Asha', value: 'Change', mark: 'change' }]),
    {
      sheet: true,
      parts: [
        { kind: 'title', label: 'Who paid?' },
        { kind: 'row', label: 'One person paid', value: '' },
        { kind: 'row', label: 'Several people paid', value: '›', mark: 'several' },
      ],
    },
    settings('Add expense', [
      { kind: 'field', label: 'Asha put in', value: '₹2,000', mark: 'amounts' },
      { kind: 'field', label: 'Ravi put in', value: '₹1,240' },
      { kind: 'note', label: 'Nothing left to assign' },
    ]),
  ],
  'approve-expense': [
    settings('Goa trip', [
      { kind: 'row', label: 'Hotel · Needs OK', value: '₹18,000', mark: 'pill' },
      { kind: 'row', label: 'Ferry tickets', value: '₹600' },
    ]),
    settings('Hotel', [
      { kind: 'row', label: 'Your share', value: '₹6,000', mark: 'open' },
      { kind: 'note', label: 'Over ₹2,000: needs an OK from you and Meera' },
      { kind: 'button', label: 'Approve ₹6,000 share', primary: true, mark: 'approve' },
    ]),
  ],
  'search-expenses': [
    settings('Goa trip', [
      { kind: 'field', label: 'Search expenses and notes', value: 'ferry', mark: 'search' },
      { kind: 'row', label: 'Sort and filter', value: '2', mark: 'filter' },
    ]),
    settings('Sort and filter', [
      { kind: 'row', label: 'Sort by', value: 'Date spent, newest first ⌄' },
      { kind: 'chips', mark: 'quick', items: [{ label: 'Involving me', on: true }, { label: '🚕 Transport', on: true }, { label: '🍔 Food & drink' }] },
      { kind: 'chips', items: [{ label: 'Everything', on: true }, { label: 'Expenses' }, { label: 'Payments' }] },
    ]),
    settings('Goa trip', [
      {
        kind: 'chips',
        mark: 'chips',
        items: [
          { label: 'Involving me ✕', on: true },
          { label: 'Transport ✕', on: true },
        ],
      },
      { kind: 'row', label: 'Ferry to Havelock', value: '₹2,400' },
    ]),
  ],
  'live-table': [
    {
      parts: [{ kind: 'title', label: 'Hi Asha' }, { kind: 'row', label: 'Overall, you are owed', value: '₹2,450' }, tabbar(undefined, 'Home', 'tile')],
    },
    settings('Live table', [
      { kind: 'row', label: 'Pizza · Pasta · 2 Beer', value: '₹1,980' },
      { kind: 'row', label: 'Tax / fees · Tip', value: '₹220' },
      { kind: 'button', label: 'Start table', primary: true, mark: 'start' },
    ]),
    settings('Table ABCD-2345', [
      { kind: 'qr', label: 'Scan to join', value: 'Closes after 24 hours' },
      { kind: 'chips', mark: 'claim', items: [{ label: 'Pizza · Ravi' }, { label: 'Beer · Meera ×2' }] },
      { kind: 'button', label: 'Finish', primary: true, mark: 'finish' },
    ]),
  ],
  'splitwise-import': [
    { parts: [{ kind: 'message', label: 'splitwise.com', value: 'Goa trip → Export as spreadsheet', mark: 'export' }] },
    settings('Import a group', [
      { kind: 'button', label: 'Choose a CSV file', mark: 'file' },
      { kind: 'chips', mark: 'who', items: [{ label: 'Asha = me', on: true }, { label: 'Ravi' }, { label: 'Meera' }] },
      { kind: 'button', label: 'Import 42 items', primary: true, mark: 'import' },
    ]),
  ],
  'delete-account': [
    settings('Data', [
      { kind: 'row', label: 'Export a group', value: 'Share CSV' },
      { kind: 'row', label: 'Delete my account', value: '›', mark: 'open' },
    ]),
    settings('Delete my account', [
      { kind: 'row', label: 'You owe ₹300 in Goa trip', value: 'Settle up ›', mark: 'sort' },
      { kind: 'row', label: 'Deleted with your account', value: 'My spending', mark: 'plan' },
      { kind: 'row', label: 'You leave', value: 'Goa trip, Flat' },
    ]),
    settings('Confirm', [
      { kind: 'row', label: 'Confirm it’s you', value: 'Google · or an emailed link', mark: 'reauth' },
      { kind: 'field', label: 'Type DELETE to confirm', value: 'DELETE' },
      { kind: 'button', label: 'Delete my account', primary: true, mark: 'confirm' },
    ]),
  ],
  'export-csv': [
    settings('Goa trip', [{ kind: 'row', label: '⚙ Export CSV', value: 'Every expense and payment', mark: 'menu' }]),
    settings('Data', [{ kind: 'row', label: 'Export a group', value: 'Share CSV', mark: 'data' }]),
  ],
  'remind-pay-me': [
    settings('Balances', [
      { kind: 'row', label: 'Rahul owes you', value: '₹1,200 ↗', mark: 'share' },
      { kind: 'row', label: 'Meera owes you', value: '₹450 ↗' },
    ]),
    {
      sheet: true,
      parts: [
        {
          kind: 'tiles',
          items: [
            { label: 'WhatsApp', glyph: 'chat', mark: 'app' },
            { label: 'Messages', glyph: 'envelope' },
            { label: 'Copy', glyph: 'copy' },
          ],
        },
      ],
    },
    settings('Pay Asha', [
      { kind: 'qr', label: 'Rahul owes Asha ₹1,200', value: 'Pay with UPI' },
      { kind: 'button', label: 'I’ve paid', primary: true, mark: 'paid' },
    ]),
  ],
  nudge: [
    settings('Balances', [
      { kind: 'row', label: 'Rahul owes you', value: '₹1,200 🔔', mark: 'bell' },
      { kind: 'row', label: 'Meera owes you', value: '₹450 🔔' },
    ]),
    { parts: [{ kind: 'message', label: 'Goa trip', value: 'Asha reminded you: you owe ₹1,200 in Goa trip. Pay in one tap.', mark: 'push' }] },
  ],
  'balances-screen': [
    settings('Hi Asha', [
      { kind: 'row', label: 'Overall, you are owed', value: '₹2,450 ›', mark: 'open' },
      {
        kind: 'list',
        items: [
          { label: 'Goa trip', icon: '🏖️' },
          { label: 'Indiranagar flat', icon: '🏠' },
        ],
      },
    ]),
    settings('Balances', [
      { kind: 'chips', items: [{ label: 'By person', on: true, mark: 'view' }, { label: 'By group' }] },
      { kind: 'row', label: 'You owe Kabir', value: 'Pay', mark: 'pay' },
      { kind: 'row', label: 'Rahul owes you', value: '₹1,200' },
    ]),
    settings('Settle up', [
      { kind: 'row', label: 'Goa trip', value: '₹800 · clears' },
      { kind: 'row', label: 'Flat', value: '₹400 · clears' },
      { kind: 'button', label: 'Record ₹1,200', primary: true, mark: 'record' },
    ]),
  ],
  'record-payment': [
    settings('Settle up', [
      { kind: 'chips', mark: 'amount', items: [{ label: 'Full ₹1,247' }, { label: '₹1,200', on: true }, { label: '₹1,250' }] },
      { kind: 'switch', label: 'Waive the rest (₹47)', mark: 'waive' },
      { kind: 'chips', mark: 'method', items: [{ label: 'UPI' }, { label: 'Cash' }, { label: 'Bank transfer' }] },
      { kind: 'button', label: 'Record ₹1,200', primary: true, mark: 'record' },
    ]),
  ],
  'confirm-payment': [
    settings('Inbox', [
      { kind: 'row', label: 'Payments to confirm', value: '1', mark: 'inbox' },
      { kind: 'row', label: 'Rahul paid you ₹1,200', value: 'UPI · today' },
      { kind: 'chips', mark: 'confirm', items: [{ label: 'Not received' }, { label: 'Confirm', on: true }] },
    ]),
  ],
  'upi-id': [
    settings('Profile', [
      { kind: 'row', label: 'How friends can pay you', value: '›', mark: 'open' },
      { kind: 'field', label: 'UPI ID', value: 'asha@okaxis', mark: 'upi' },
      { kind: 'note', label: 'Only members of groups you’re in can see these.' },
    ]),
  ],
  'settle-reminders': [
    settings('Settings', [
      { kind: 'row', label: 'Notifications', value: '›', mark: 'open' },
      { kind: 'switch', label: 'Settle-up reminders', mark: 'switch' },
      { kind: 'note', label: 'A gentle weekly nudge when you’ve owed someone for a week.' },
    ]),
  ],
  inbox: [
    settings('Hi Asha', [
      { kind: 'row', label: '📥 Inbox', value: '3', mark: 'open' },
      { kind: 'row', label: 'Overall, you are owed', value: '₹2,450' },
    ]),
    settings('Inbox', [
      {
        kind: 'chips',
        items: [
          { label: 'To sort', on: true, mark: 'sort' },
          { label: 'Updates', mark: 'updates' },
        ],
      },
      { kind: 'row', label: 'Needs your OK', value: '1' },
      { kind: 'row', label: 'Captured payments', value: '2' },
    ]),
  ],
  notifications: [
    settings('Notifications', [
      { kind: 'row', label: 'Settings → Notifications', value: '›', mark: 'open' },
      { kind: 'button', label: 'Turn on notifications', primary: true, mark: 'device' },
      { kind: 'switch', label: 'New expenses', mark: 'kinds' },
      { kind: 'switch', label: 'Someone pays you back' },
    ]),
  ],
  'captured-payment': [
    settings('Inbox', [
      { kind: 'row', label: 'Captured payments', value: '2 to sort' },
      { kind: 'row', label: '₹450 at Blue Tokai', value: '›', mark: 'open' },
    ]),
    settings('Captured payment', [
      { kind: 'note', label: 'You spent ₹450 at Blue Tokai. Is this a group expense?' },
      { kind: 'chips', mark: 'group', items: [{ label: 'Goa trip', on: true }, { label: 'Flat' }] },
      { kind: 'button', label: 'Split equally in Goa trip', primary: true, mark: 'split' },
      { kind: 'chips', mark: 'other', items: [{ label: 'Personal' }, { label: 'Not shared' }, { label: 'Decide later' }] },
    ]),
  ],
  'capture-filters': [
    settings('Settings', [{ kind: 'row', label: 'Automation', value: '›', mark: 'open' }]),
    settings('Automation', [
      { kind: 'switch', label: 'Capture payments', value: 'on', mark: 'master' },
      { kind: 'chips', mark: 'what', items: [{ label: 'Only during a trip', on: true }, { label: 'All bank & UPI' }] },
      { kind: 'row', label: 'Ignore small payments · SIP, rent', value: '₹50', mark: 'filters' },
      { kind: 'switch', label: 'Capture for Goa trip', value: 'on', mark: 'trip' },
    ]),
  ],
  'capture-keys': [
    settings('Automation', [
      { kind: 'button', label: 'Set up on a new phone', primary: true, mark: 'setup' },
      { kind: 'row', label: 'All my trips', value: '← Revoke', mark: 'revoke' },
    ]),
    settings('Auto-capture', [
      { kind: 'chips', mark: 'scope', items: [{ label: 'All my trips', on: true }, { label: 'Goa trip' }] },
      { kind: 'button', label: 'Create your capture key', primary: true },
    ]),
  ],
  'apple-pay-share': [
    settings('Automation', [{ kind: 'row', label: 'Advanced: Apple Pay Shortcut and capture links', value: '›', mark: 'advanced' }]),
    { parts: [{ kind: 'message', label: 'Shortcuts · Transaction', value: 'When I tap any card → Open URL', mark: 'shortcut' }] },
    {
      sheet: true,
      parts: [
        {
          kind: 'tiles',
          items: [
            { label: 'Split Now', icon: '🟣', mark: 'share' },
            { label: 'Photos', icon: '🖼️' },
            { label: 'Mail', icon: '✉️' },
          ],
        },
      ],
    },
  ],
  'home-tour': [
    {
      parts: [
        { kind: 'row', label: 'Hi Asha', value: '📥 2 · 🙂', mark: 'top' },
        { kind: 'row', label: 'Overall, you are owed', value: '₹2,450', mark: 'balance' },
        {
          kind: 'list',
          label: 'Groups & friends',
          mark: 'groups',
          items: [
            { label: 'Goa trip', icon: '🏖️' },
            { label: 'Indiranagar flat', icon: '🏠' },
          ],
        },
        { kind: 'row', label: 'Recent activity', value: '3 new ⌄', mark: 'recent' },
        tabbar('plus', 'Home'),
      ],
    },
  ],
  'personal-wallet': [
    home('new'),
    settings('New group', [
      { kind: 'chips', items: [{ label: 'Group' }, { label: '1:1 friend' }, { label: 'Personal', on: true }] },
      { kind: 'field', label: 'Name', value: 'My spending', icon: '👛', mark: 'name' },
      { kind: 'field', label: 'Budget (optional)', value: '₹15,000' },
    ]),
    settings('My spending', [
      { kind: 'row', label: 'Petrol', value: '₹2,100', mark: 'add' },
      { kind: 'row', label: 'Groceries', value: '₹1,340' },
    ]),
  ],
  'look-and-detail': [
    settings('Settings', [{ kind: 'row', label: 'Preferences', value: '›', mark: 'open' }]),
    settings('Preferences', [
      { kind: 'chips', mark: 'theme', items: [{ label: 'Auto' }, { label: 'Light' }, { label: 'Dark', on: true }] },
      { kind: 'chips', mark: 'accent', items: [{ label: '🟣 Violet', on: true }, { label: '🔵 Ocean' }, { label: '🟡 Gold' }] },
      { kind: 'chips', mark: 'icons', items: [{ label: 'Default' }, { label: 'Outline' }, { label: 'Filled', on: true }] },
      { kind: 'chips', mark: 'detail', items: [{ label: 'Full' }, { label: 'When needed', on: true }, { label: 'Minimal' }, { label: 'Tooltip' }] },
    ]),
  ],
  'money-preferences': [
    settings('Preferences', [
      { kind: 'row', label: 'Default currency', value: 'INR ₹', mark: 'currency' },
      { kind: 'switch', label: 'Collect in INR', mark: 'collect' },
      { kind: 'note', label: 'Rates synced today' },
    ]),
  ],
  animations: [
    settings('Settings', [{ kind: 'row', label: 'Animations', value: '›', mark: 'open' }]),
    settings('Animations', [
      { kind: 'switch', label: 'All animations', value: 'on', mark: 'all' },
      { kind: 'row', label: 'Fireworks · Background', value: 'Normal', mark: 'tune' },
      { kind: 'bars' },
    ]),
  ],
  'profile-account': [
    settings('Hi Asha', [{ kind: 'row', label: 'Your photo', value: '🙂 ›', mark: 'open' }]),
    settings('Profile', [
      { kind: 'field', label: 'Name', value: 'Asha Rao', icon: '🙂', mark: 'name' },
      { kind: 'row', label: 'Signing in · Google', value: 'Linked', mark: 'signin' },
      { kind: 'button', label: 'Add another email', mark: 'email' },
    ]),
  ],
  'install-offline': [
    settings('Home', [{ kind: 'button', label: 'Install Split Now', primary: true, mark: 'install' }]),
    settings('Goa trip', [
      { kind: 'note', label: 'Offline — changes will sync when you’re back', mark: 'offline' },
      { kind: 'row', label: 'Ferry tickets', value: '₹600' },
      { kind: 'message', label: 'New version ready', value: 'Later · Update', mark: 'update' },
    ]),
    settings('Profile', [
      { kind: 'row', label: 'Your photo', value: '🙂 ›' },
      { kind: 'row', label: 'New version ready', value: 'Tap to update', mark: 'later' },
      { kind: 'row', label: 'Install Split Now', value: '›' },
    ]),
  ],
} satisfies Record<string, Scene>)

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
