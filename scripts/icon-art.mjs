/*
 * Builds the app's icon drawings from the icon sets in devDependencies, so the app carries only
 * the drawings it uses as plain JSX: no icon library at runtime, nothing to tree-shake.
 *
 *   npm run icons:art          rewrite the generated files
 *   npm run icons:art -- --check   fail when they are out of date (CI-friendly)
 *
 * Three families, one per role (docs: the header of src/components/Icon.tsx):
 *   UI       Fluent UI System Icons, 24 Regular / Filled (MIT): the tab bar, rows, sheets and
 *            actions → src/components/icons.tsx. One drawing of ours on its grid (Help's lifebuoy).
 *   FEATURE  Solar line duotone / bold duotone, painted in the brand gradient: Help, empty
 *            screens and notices → src/components/feature-art-line.tsx, feature-art-bold.tsx
 *            (each loads on its own, only for the style in use). A picture Solar lacks (Live
 *            table's fork and knife) is Fluent's, made two-tone the same way (half-tone fill
 *            under the line).
 *   controls lucide (chevrons, close, check, spinners): not built here.
 * Edit the lists below, run the script, commit the output. svgo trims each drawing to one
 * decimal on the 24 grid (invisible at the sizes the app draws, a third smaller).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { optimize } = require('svgo')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ---------------------------------------------------------------- our own drawings
 * On Fluent's grid and weight (1.5 line, round ends), for what Fluent doesn't draw.
 */
const S = (d, w = 1.5, extra = '') =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
const ring = (r, w = 1.5) => `<circle cx="12" cy="12" r="${r}" fill="none" stroke="currentColor" stroke-width="${w}"/>`
/** A rupee sign on a 24 px phone's screen: smaller, and raised clear of the phone's bottom bar. */
const RUPEE =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.1" transform="translate(2.4 -.6) scale(.8)" d="M9.25 8.25h5.5M9.25 10.75h5.5M10.25 8.25c1.9 0 2.9.9 2.9 2.25s-1 2.5-2.9 2.5h-1l4.25 4"/>'

const CUSTOM = {
  /* Profile's Settings button: Fluent's gear with a clean, even ring in the middle (owner: Fluent's own
     inner circle looked off), the same weight as the gear's outline. Filled is Fluent's as it is. */
  fluentGear: {
    get line() {
      const outer = body('fluent', 'settings-24-regular').match(/d="(M[^M"]+)/)[1]
      return `<path fill="currentColor" d="${outer}"/>${ring(2.9, 1.6)}`
    },
    get fill() {
      return body('fluent', 'settings-24-filled')
    },
  },
  /* Notifications row: Solar's bell with a round dot at its top right (owner: the line inside the
     bell read as a mouse), the bell drawn a little smaller and lower so the dot sits clear of it. */
  bellDot: {
    get line() {
      return `<g transform="translate(-.5 3.5) scale(.85)">${body('solar', 'bell-line-duotone')}</g><circle cx="18.75" cy="4.75" r="2.75" fill="currentColor"/>`
    },
    get fill() {
      return `<g transform="translate(-.5 3.5) scale(.85)">${body('solar', 'bell-bold-duotone')}</g><circle cx="18.75" cy="4.75" r="2.75" fill="currentColor"/>`
    },
  },
  /* Settings row: Solar's gear with the shades swapped (owner): the gear strong, the middle light. */
  gear: {
    get line() {
      return body('solar', 'settings-line-duotone')
        .replace(' opacity=".5"', '')
        .replace('<circle cx="12" cy="12" r="3"/>', '<circle cx="12" cy="12" r="3" opacity=".5"/>')
    },
    get fill() {
      // The gear with a hole where the middle goes, so the light middle isn't drawn over the strong gear.
      const gearD = body('solar', 'settings-bold-duotone').match(/<path fill-rule="evenodd" d="([^"]+)"/)[1]
      return `<g fill="currentColor"><path fill-rule="evenodd" d="${gearD}M12.5 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z"/><circle cx="12.5" cy="12" r="2.25" opacity=".5"/></g>`
    },
  },
  /* Scan → Payment: a phone with a rupee on its screen (owner: the bare phone looked empty). */
  phonePay: {
    get lineDuo() {
      return `${body('solar', 'smartphone-line-duotone')}${RUPEE}`
    },
    get boldDuo() {
      return `<g opacity=".5">${body('solar', 'smartphone-bold-duotone')}</g>${RUPEE}`
    },
  },
  /* Help: a lifebuoy (the "floating tube"), the owner's pick: help when you're stuck. Four bands
     across the ring at the diagonals. Solid: the ring's four coloured sections, the bands left as gaps. */
  lifebuoy: {
    line: ring(8.75) + ring(3.75) + S('M5.8 5.8l3.55 3.55M14.65 14.65l3.55 3.55M18.2 5.8l-3.55 3.55M9.35 14.65 5.8 18.2'),
    fill: '<path fill="currentColor" d="M19.93 5.91A10 10 0 0 1 19.93 18.09L15.90 13.69A4.25 4.25 0 0 0 15.90 10.31ZM18.09 19.93A10 10 0 0 1 5.91 19.93L10.31 15.90A4.25 4.25 0 0 0 13.69 15.90ZM4.07 18.09A10 10 0 0 1 4.07 5.91L8.10 10.31A4.25 4.25 0 0 0 8.10 13.69ZM5.91 4.07A10 10 0 0 1 18.09 4.07L13.69 8.10A4.25 4.25 0 0 0 10.31 8.10Z"/>',
  },
  /* The 1:1 badge (owner, 22 Oct 2026; replaces the 🤝 emoji): Fluent's handshake. Outline is its
     line over its own fill at .42 (the duotone the light theme shows); Filled is the fill alone (the
     dark theme's, where the soft layer muddied). src/components/GroupIcon.tsx picks per theme. */
  handshake: {
    get line() {
      return `<g opacity=".42">${body('fluent', 'handshake-24-filled')}</g>${body('fluent', 'handshake-24-regular')}`
    },
    get fill() {
      return body('fluent', 'handshake-24-filled')
    },
  },
  /* The lifebuoy as a Solar-style duotone, for the Profile row tiles beside Solar's pictures:
     Outline, a line ring with its coloured sections at half tone; Filled, the classic buoy (half-tone
     ring, solid sections). */
  lifebuoyDuo: {
    line: '<path fill="currentColor" opacity=".5" d="M19.14 6.52A9 9 0 0 1 19.14 17.48L16.13 13.78A4.5 4.5 0 0 0 16.13 10.22ZM17.48 19.14A9 9 0 0 1 6.52 19.14L10.22 16.13A4.5 4.5 0 0 0 13.78 16.13ZM4.86 17.48A9 9 0 0 1 4.86 6.52L7.87 10.22A4.5 4.5 0 0 0 7.87 13.78ZM6.52 4.86A9 9 0 0 1 17.48 4.86L13.78 7.87A4.5 4.5 0 0 0 10.22 7.87Z"/><circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="4.25" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    fill: '<path fill="currentColor" opacity=".5" fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20ZM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8Z"/><path fill="currentColor" d="M19.93 5.91A10 10 0 0 1 19.93 18.09L15.68 13.58A4 4 0 0 0 15.68 10.42ZM18.09 19.93A10 10 0 0 1 5.91 19.93L10.42 15.68A4 4 0 0 0 13.58 15.68ZM4.07 18.09A10 10 0 0 1 4.07 5.91L8.32 10.42A4 4 0 0 0 8.32 13.58ZM5.91 4.07A10 10 0 0 1 18.09 4.07L13.58 8.32A4 4 0 0 0 10.42 8.32Z"/>',
  },
}

/* ---------------------------------------------------------------- UI: Fluent Regular / Filled
 * Export name → Fluent base name (24 px drawing), or ~custom. Names say what the icon is for
 * where that is clearer than what it draws. */
const UI = {
  /* Profile and Settings rows (RowTile): Solar line duotone (Outline) / bold duotone (Filled), the
     family of Help's pictures, drawn white on the accent gradient so the rows read heavier. */
  RowAdminIcon: 'solar:shield-user',
  RowAiIcon: 'solar:stars',
  RowAnimationsIcon: 'solar:magic-stick-3',
  RowAutomationIcon: 'solar:routing-2',
  RowBalancesIcon: 'solar:round-transfer-horizontal',
  RowChatIcon: 'solar:chat-round-dots',
  RowDataIcon: 'solar:folder-cloud',
  RowDeleteAccountIcon: 'solar:user-block-rounded',
  RowEncryptedIcon: 'solar:shield-keyhole',
  RowHelpIcon: '~lifebuoyDuo',
  RowIconsIcon: 'solar:emoji-funny-circle',
  RowImportIcon: 'solar:move-to-folder',
  RowInsightsIcon: 'solar:chart-2',
  RowInstallIcon: 'solar:download-minimalistic',
  RowKeyboardIcon: 'solar:keyboard',
  RowNotificationsIcon: '~bellDot',
  RowPayIcon: 'solar:wallet-money',
  RowPreferencesIcon: 'solar:tuning-2',
  RowScanIcon: 'solar:camera',
  RowSettingsIcon: '~gear',
  RowSupportIcon: 'solar:hand-heart',
  RowUpdateIcon: 'solar:refresh-circle',
  RowVoiceIcon: 'solar:microphone',
  AddIcon: 'add',
  AdvancedModeIcon: 'options',
  /* Profile header's mode button in Advanced: one of five, picked at random on each switch (src/lib/mode-icon.ts). */
  AdvancedBrainIcon: 'brain-circuit',
  AdvancedChipIcon: 'developer-board',
  AdvancedDevToolsIcon: 'window-dev-tools',
  AdvancedRocketIcon: 'rocket',
  AdvancedToolsIcon: 'wrench-screwdriver',
  AdminIcon: 'shield-keyhole',
  AiIcon: 'brain-sparkle',
  AnimationsIcon: 'emoji-sparkle',
  ArchiveIcon: 'archive',
  AutomationIcon: 'flash-auto',
  BalanceIcon: 'scales',
  BellIcon: 'alert',
  BellRingingIcon: 'alert-on',
  BellSlashIcon: 'alert-off',
  BotIcon: 'bot',
  CalendarIcon: 'calendar-ltr',
  CameraIcon: 'camera',
  ChatIcon: 'chat',
  ChatsIcon: 'chat-multiple',
  CheckCircleIcon: 'checkmark-circle',
  ChecksIcon: 'checkbox-checked',
  ContrastIcon: 'dark-theme',
  CopyIcon: 'copy',
  DataIcon: 'database',
  DownloadIcon: 'arrow-download',
  EditIcon: 'edit',
  EncryptedIcon: 'lock-shield',
  ExitIcon: 'sign-out',
  ExportIcon: 'arrow-export-ltr',
  ExternalIcon: 'open',
  EyeIcon: 'eye',
  EyeSlashIcon: 'eye-off',
  FaceIdIcon: 'fingerprint',
  FileIcon: 'document',
  FileUploadIcon: 'document-arrow-up',
  FlagIcon: 'flag',
  GroupsIcon: 'people-team',
  HandshakeIcon: '~handshake',
  /* Claim: Solar's hand holding a note, two-tone like the lifebuoy (owner): the note strong, the hand lighter. */
  HandCoinsIcon: 'solar:hand-money',
  HandHeartIcon: 'heart',
  HelpIcon: '~lifebuoy',
  HistoryIcon: 'history',
  HomeIcon: 'home',
  ImageIcon: 'image',
  ImageAddIcon: 'image-add',
  InboxIcon: 'mail-inbox',
  InsightsIcon: 'data-bar-vertical-ascending',
  KeyIcon: 'key',
  KeyboardIcon: 'keyboard',
  LightbulbIcon: 'lightbulb',
  LightningIcon: 'flash',
  LinkIcon: 'link',
  LiveTableIcon: 'food',
  LockIcon: 'lock-closed',
  LockOpenIcon: 'lock-open',
  MagicIcon: 'wand',
  MailIcon: 'mail',
  MemberAddIcon: 'person-add',
  MemberRemoveIcon: 'person-delete',
  /* Voice: Quick add's mic, and + while it is held to talk. */
  MicIcon: 'mic',
  MoonIcon: 'weather-moon',
  NotificationsIcon: 'alert-badge',
  PaletteIcon: 'color',
  /* Balances' Pay button (owner, 22 Oct 2026): a rupee note, not the paper plane */
  PayIcon: 'money',
  PauseIcon: 'pause',
  PhoneIcon: 'phone',
  PreferencesIcon: 'options',
  ProfileIcon: 'person-circle',
  ProhibitIcon: 'prohibited',
  PulseIcon: 'pulse',
  QrIcon: 'qr-code',
  ReceiptIcon: 'receipt',
  RefreshIcon: 'arrow-sync',
  RepeatIcon: 'arrow-repeat-all',
  ScanIcon: 'scan-camera',
  SendIcon: 'send',
  SettingsIcon: '~fluentGear',
  /* a group's settings button (owner, 22 Oct 2026): a set of toggles, apart from Profile's gear */
  GroupSettingsIcon: 'toggle-multiple',
  SimpleModeIcon: 'leaf-one',
  ShapesIcon: 'shapes',
  ShareIcon: 'share',
  ShieldIcon: 'shield-checkmark',
  SortIcon: 'arrow-sort-down-lines',
  SparkleIcon: 'sparkle',
  SplitIcon: 'data-pie',
  SuitcaseIcon: 'luggage',
  SunIcon: 'weather-sunny',
  SwapIcon: 'arrow-swap',
  TicketIcon: 'ticket-diagonal',
  TrashIcon: 'delete',
  UserIcon: 'person',
  WalletIcon: 'wallet',
}

/* ---------------------------------------------------------------- FEATURE: Solar duotone
 * Every name in src/lib/ui-icons.ts → Solar base name (or ~custom). */
const FEATURE = {
  alarm: 'alarm',
  archive: 'archive',
  arrowBack: 'card-recive',
  badge: 'user-id',
  bell: 'bell',
  bellRinging: 'bell-bing',
  bellSlash: 'bell-off',
  calculator: 'calculator-minimalistic',
  camera: 'camera',
  card: 'card',
  cash: 'wad-of-money',
  chart: 'chart-2',
  chat: 'chat-round-dots',
  checkCircle: 'check-circle',
  cloudDown: 'cloud-download',
  coins: 'dollar',
  compass: 'compass',
  confetti: 'confetti',
  copy: 'copy',
  divide: 'pie-chart-2',
  door: 'login-3',
  download: 'download-minimalistic',
  envelope: 'letter',
  exchange: 'transfer-horizontal',
  export: 'file-send',
  eyeSlash: 'eye-closed',
  faceId: 'face-scan-circle',
  file: 'document-text',
  flag: 'flag',
  folders: 'folder-with-files',
  funnel: 'filter',
  funnelSimple: 'tuning-2',
  handCoins: 'hand-money',
  handshake: 'hand-shake',
  history: 'history',
  hourglass: 'hourglass',
  house: 'home-smile',
  idCard: 'card-2',
  images: 'gallery',
  jar: 'hand-heart',
  key: 'key',
  lightning: 'bolt',
  link: 'link-round',
  listChecks: 'checklist-minimalistic',
  liveTable: 'fluent:food',
  lock: 'lock-keyhole-minimalistic',
  lockKey: 'lock-password',
  lockOpen: 'lock-keyhole-minimalistic-unlocked',
  magicWand: 'magic-stick-3',
  merge: 'arrow-to-down-left',
  mic: 'microphone',
  money: 'wallet-money',
  notePencil: 'pen-new-square',
  palette: 'palette',
  password: 'password-minimalistic',
  pattern: 'widget-4',
  pause: 'pause-circle',
  pencil: 'pen',
  phone: '~phonePay',
  plant: 'leaf',
  plugs: 'plug-circle',
  prohibit: 'forbidden-circle',
  pushPin: 'pin',
  question: 'question-circle',
  receipt: 'bill-list',
  repeat: 'repeat',
  restore: 'restart',
  scales: 'scale',
  search: 'magnifer',
  send: 'plain',
  shield: 'shield-check',
  signIn: 'login-2',
  sliders: 'tuning-2',
  sparkle: 'stars-minimalistic',
  stop: 'stop-circle',
  suitcase: 'suitcase',
  tag: 'tag',
  target: 'target',
  thumbsUp: 'like',
  timer: 'stopwatch',
  trash: 'trash-bin-trash',
  tray: 'inbox',
  trayDown: 'inbox-in',
  user: 'user-circle',
  userPlus: 'user-plus-rounded',
  userDashed: 'user-rounded',
  userMinus: 'user-minus-rounded',
  users: 'users-group-rounded',
  wallet: 'wallet',
  warning: 'danger-circle',
  wrench: 'settings-minimalistic',
  yarn: 'routing-2',
}

/* ---------------------------------------------------------------- build */
const sets = {}
const set = (name) => {
  if (!sets[name]) sets[name] = require(`@iconify-json/${name}/icons.json`)
  return sets[name]
}
const problems = []
function body(setName, name) {
  const j = set(setName)
  let n = name
  for (let i = 0; i < 5 && !j.icons[n] && j.aliases?.[n]; i++) n = j.aliases[n].parent
  const icon = j.icons[n]
  if (!icon) {
    problems.push(`${setName}:${name} not found`)
    return ''
  }
  if ((icon.width ?? j.width ?? 24) !== 24 || (icon.height ?? j.height ?? 24) !== 24) problems.push(`${setName}:${name} is not on a 24 grid`)
  return icon.body
}

function slim(svgBody, where) {
  const out = optimize(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${svgBody}</svg>`, {
    floatPrecision: 1,
    multipass: true,
    plugins: ['preset-default'],
  }).data.replace(/^<svg[^>]*>|<\/svg>$/g, '')
  // An id would repeat on every copy of the icon on a page; none of the chosen drawings needs one.
  if (/\sid="/.test(out)) problems.push(`${where} uses an id`)
  return out
}

const camel = (a) => a.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
/** SVG markup (svgo's output: elements and attributes only) as JSX. */
function jsx(markup) {
  return markup
    .replace(/<([a-zA-Z]+)((?:\s+[a-zA-Z:-]+="[^"]*")*)\s*(\/?)>/g, (_, tag, attrs, self) => {
      const a = attrs.replace(/\s+([a-zA-Z:-]+)="([^"]*)"/g, (_m, k, v) => ` ${k === 'class' ? 'className' : camel(k)}="${v}"`)
      return `<${tag}${a}${self ? ' /' : ''}>`
    })
    .trim()
}

// The Profile and Settings rows draw Solar's 1.5 lines at 2, so they read as firmly as the text beside them.
const thicker = (markup, where) => (where.startsWith('Row') || where === 'HandCoinsIcon' ? markup.replace(/stroke-width="1\.5"/g, 'stroke-width="2"') : markup)

/*
 * Two-tone where an icon sits on colour: the tab you're on and the icons inside primary (accent
 * gradient) buttons get a soft fill under their line, like the lifebuoy and Claim. The fill is in
 * the line drawing but hidden (`.icon-duo`, index.css) until such a place shows it, so these icons
 * stay plain line icons everywhere else. Owner, 22 Oct 2026.
 */
const DUO = new Set([
  'HomeIcon',
  'GroupsIcon',
  'LiveTableIcon',
  'InsightsIcon',
  'ProfileIcon',
  'AddIcon',
  'DownloadIcon',
  'KeyIcon',
  'ImageAddIcon',
  'CameraIcon',
  'BellIcon',
  'WalletIcon',
  'PayIcon',
  'ShieldIcon',
  'ShareIcon',
  'MemberAddIcon',
  'LockIcon',
  'LinkIcon',
  'ChecksIcon',
])

const art = (ref, kind, where) => {
  if (kind === 'line' && DUO.has(where) && !ref.startsWith('~') && !ref.startsWith('solar:')) {
    return jsx(slim(`<g class="icon-duo" opacity=".3">${body('fluent', `${ref}-24-filled`)}</g>${body('fluent', `${ref}-24-regular`)}`, where))
  }
  // A Fluent drawing as a Help picture: its fill at half tone under its line (Outline), or its
  // fill (Filled), so it paints like the Solar duotone around it.
  if (ref.startsWith('fluent:')) {
    const n = ref.slice(7)
    const fill = body('fluent', `${n}-24-filled`)
    const markup = kind === 'lineDuo' ? `<g opacity=".5">${fill}</g>${body('fluent', `${n}-24-regular`)}` : fill
    return jsx(slim(markup, where))
  }
  if (ref.startsWith('solar:')) {
    const suffix = kind === 'line' || kind === 'lineDuo' ? '-line-duotone' : '-bold-duotone'
    return jsx(slim(thicker(body('solar', ref.slice(6) + suffix), where), where))
  }
  if (ref.startsWith('~')) {
    const c = CUSTOM[ref.slice(1)]
    if (!c) problems.push(`${where}: no custom drawing ${ref}`)
    return jsx(slim(thicker(c[kind], where), where))
  }
  const [setName, suffix] = {
    line: ['fluent', '-24-regular'],
    fill: ['fluent', '-24-filled'],
    lineDuo: ['solar', '-line-duotone'],
    boldDuo: ['solar', '-bold-duotone'],
  }[kind]
  return jsx(slim(body(setName, ref + suffix), where))
}

const header = (what) => `/*
 * GENERATED by scripts/icon-art.mjs (npm run icons:art): edit the lists there, not this file.
 * ${what}
 */
`

const uiNames = Object.keys(UI).sort()
const ui = `${header('UI icons: Fluent UI System Icons 24 Regular / Filled (MIT, github.com/microsoft/fluentui-system-icons), and our own lifebuoy on its grid.')}
import { makeIcon } from './Icon'

${uiNames
  .map((n) => {
    const ref = UI[n]
    const src = ref.startsWith('~') ? 'ours' : ref.startsWith('solar:') ? `${ref} duotone` : `fluent ${ref}`
    return `/** ${src} */\nexport const ${n} = /* @__PURE__ */ makeIcon(\n  '${n.replace(/Icon$/, '')}',\n  <>${art(ref, 'line', n)}</>,\n  <>${art(ref, 'fill', n)}</>,\n)`
  })
  .join('\n\n')}
`

// The feature list must match src/lib/ui-icons.ts exactly.
const uiIconsTs = readFileSync(join(root, 'src/lib/ui-icons.ts'), 'utf8')
const declared = [...uiIconsTs.slice(uiIconsTs.indexOf('UI_ICONS = ['), uiIconsTs.indexOf('] as const')).matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1])
for (const n of declared) if (!FEATURE[n]) problems.push(`feature icon ${n} (src/lib/ui-icons.ts) has no drawing`)
for (const n of Object.keys(FEATURE)) if (!declared.includes(n)) problems.push(`feature icon ${n} is not in src/lib/ui-icons.ts`)

const feature = (
  kind,
  label,
) => `${header(`Help and empty-screen pictures, ${label}: Solar (CC BY 4.0, 480 Design, github.com/480-Design/Solar-Icon-Set), with Fluent's fork and knife for Live table. Loaded on its own, only when this style is in use (src/components/Icon.tsx).`)}
import type { ReactElement } from 'react'
import type { UiIconName } from '@/lib/ui-icons'

const art: Record<UiIconName, ReactElement> = {
${declared.map((n) => `  ${n}: <>${art(FEATURE[n], kind, n)}</>,`).join('\n')}
}
export default art
`

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
const files = {
  'src/components/icons.tsx': ui,
  'src/components/feature-art-line.tsx': feature('lineDuo', 'line duotone (Outline)'),
  'src/components/feature-art-bold.tsx': feature('boldDuo', 'bold duotone (Filled)'),
}
const check = process.argv.includes('--check')
let stale = false
// Formatted the way the repo formats (biome.json), so `npm run format:check` and `--check` agree.
const format = (file, text) =>
  execFileSync(join(root, 'node_modules/.bin/biome'), ['format', `--stdin-file-path=${file}`], { input: text, cwd: root, maxBuffer: 1 << 26 }).toString()
for (const [file, raw] of Object.entries(files)) {
  const text = format(file, raw)
  const path = join(root, file)
  let current = ''
  try {
    current = readFileSync(path, 'utf8')
  } catch {}
  if (current === text) continue
  if (check) {
    console.error(`${file} is out of date: run npm run icons:art`)
    stale = true
  } else {
    writeFileSync(path, text)
    console.log(`wrote ${file}`)
  }
}
if (stale) process.exit(1)
