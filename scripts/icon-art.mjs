/*
 * Builds the app's icon drawings from the icon sets in devDependencies, so the app carries only
 * the drawings it uses as plain JSX: no icon library at runtime, nothing to tree-shake.
 *
 *   npm run icons:art          rewrite the generated files
 *   npm run icons:art -- --check   fail when they are out of date (CI-friendly)
 *
 * Three families, one per role (docs: the header of src/components/Icon.tsx):
 *   UI       MingCute line / fill, plus two drawings of ours on its grid (Live table, Insights):
 *            the tab bar, rows, sheets and actions → src/components/icons.tsx
 *   FEATURE  Solar line duotone / bold duotone, painted in the brand gradient: Help, empty
 *            screens and notices → src/components/feature-art-line.tsx, feature-art-bold.tsx
 *            (each loads on its own, only for the style in use)
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
 * 24 grid, 2-unit lines with round ends: MingCute's weight, so they sit in the tab bar beside
 * its icons. Each has the two UI drawings and the two Help (duotone) drawings; the duotone ones
 * mark their soft layer with opacity=".5" exactly as Solar does, so they paint the same way.
 */
const S = (d, w = 2, extra = '') =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
const F = (d, extra = '') => `<path d="${d}" fill="currentColor"${extra}/>`
const shine = 'M7.2 14.1a1 1 0 0 1-.7-1.2 6 6 0 0 1 3.6-3.7 1 1 0 1 1 .7 1.9 4 4 0 0 0-2.4 2.4 1 1 0 0 1-1.2.6Z'
const dome = 'M12 7.5a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z'
const CUSTOM = {
  /* Live table: a serving dome on a tray, the meal everyone at the table shares. Wider and
     lower than a desk bell, with the tray's rim under it so it reads as food, not "ring for service". */
  cloche: {
    line: S('M4 16.5a8 8 0 0 1 16 0') + S('M2.5 16.5h19') + S('M12 8.5V7') + S('M10 6.5h4') + S('M8 13.5a4.5 4.5 0 0 1 2.4-2.4') + S('M6 20h12'),
    fill: F(dome + shine, ' fill-rule="evenodd"') + S('M2.5 16.5h19', 2.5) + S('M12 8V6.75', 2.5) + S('M9.75 6.25h4.5', 2.5) + S('M6 20h12', 2.5),
    lineDuo:
      F('M4 16.5a8 8 0 0 1 16 0Z', ' opacity=".5"') +
      S('M4 16.5a8 8 0 0 1 16 0', 1.5) +
      S('M2.5 16.5h19', 1.5) +
      S('M12 8.5V7', 1.5) +
      S('M10 6.5h4', 1.5) +
      S('M6 20h12', 1.5),
    boldDuo: F(dome, ' opacity=".5"') + S('M2.5 16.5h19', 2) + S('M12 8V6.75', 2) + S('M9.75 6.25h4.5', 2) + S('M6 20h12', 2) + F(shine),
  },
  /* Insights: three rising bars, a bar chart and nothing else. */
  bars: {
    line: '<rect x="3.5" y="13" width="4.5" height="7.5" rx="1.75" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9.75" y="8.5" width="4.5" height="12" rx="1.75" fill="none" stroke="currentColor" stroke-width="2"/><rect x="16" y="3.5" width="4.5" height="17" rx="1.75" fill="none" stroke="currentColor" stroke-width="2"/>',
    fill: '<rect x="2.75" y="12.25" width="6" height="9" rx="2.25" fill="currentColor"/><rect x="9" y="7.75" width="6" height="13.5" rx="2.25" fill="currentColor"/><rect x="15.25" y="2.75" width="6" height="18.5" rx="2.25" fill="currentColor"/>',
    lineDuo:
      '<rect x="3.5" y="13" width="4.5" height="7.5" rx="1.75" fill="currentColor" opacity=".5"/><rect x="9.75" y="8.5" width="4.5" height="12" rx="1.75" fill="currentColor" opacity=".5"/><rect x="16" y="3.5" width="4.5" height="17" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    boldDuo:
      '<rect x="2.75" y="12.25" width="6" height="9" rx="2.25" fill="currentColor" opacity=".5"/><rect x="9" y="7.75" width="6" height="13.5" rx="2.25" fill="currentColor" opacity=".5"/><rect x="15.25" y="2.75" width="6" height="18.5" rx="2.25" fill="currentColor"/>',
  },
}

/* ---------------------------------------------------------------- UI: MingCute line / fill
 * Export name → MingCute base name (or ~custom). Names say what the icon is for where that is
 * clearer than what it draws. */
const UI = {
  AddIcon: 'add',
  ArchiveIcon: 'archive',
  BalanceIcon: 'balance',
  BellIcon: 'notification',
  BellRingingIcon: 'bell-ringing',
  BellSlashIcon: 'notification-off',
  CalendarIcon: 'calendar',
  CameraIcon: 'camera-2',
  CardIcon: 'bank-card',
  ChatIcon: 'chat-3',
  ChatsIcon: 'chat-4',
  CheckCircleIcon: 'check-circle',
  ChecksIcon: 'checks',
  CompassIcon: 'compass',
  ConfettiIcon: 'celebrate',
  ContrastIcon: 'sun-cloudy',
  CopyIcon: 'copy-2',
  DataIcon: 'safe-box',
  DownloadIcon: 'download-2',
  EditIcon: 'edit-2',
  ExitIcon: 'exit',
  ExportIcon: 'file-export',
  ExternalIcon: 'external-link',
  FaceIdIcon: 'faceid',
  EyeIcon: 'eye-2',
  EyeSlashIcon: 'eye-close',
  FileIcon: 'file',
  FileUploadIcon: 'file-upload',
  FilterIcon: 'filter',
  FlagIcon: 'flag-1',
  GroupsIcon: 'group-2',
  HandCoinsIcon: 'hand-card',
  HandHeartIcon: 'hand-heart',
  HelpIcon: 'question',
  HistoryIcon: 'history-anticlockwise',
  HomeIcon: 'home-4',
  HourglassIcon: 'time-duration',
  ImageIcon: 'pic',
  ImageAddIcon: 'pic-2',
  InboxIcon: 'inbox',
  InsightsIcon: '~bars',
  KeyIcon: 'key-2',
  KeyboardIcon: 'keyboard',
  LightbulbIcon: 'bulb',
  LightningIcon: 'flash',
  LinkIcon: 'link',
  LiveTableIcon: '~cloche',
  LockIcon: 'lock',
  LockOpenIcon: 'unlock',
  MagicIcon: 'magic-2',
  MailIcon: 'mail',
  MemberAddIcon: 'user-add-2',
  MemberRemoveIcon: 'user-remove-2',
  MoonIcon: 'moon',
  PaletteIcon: 'palette',
  PauseIcon: 'pause',
  PauseCircleIcon: 'pause-circle',
  PhoneIcon: 'cellphone',
  PinIcon: 'pin',
  PlantIcon: 'leaf',
  PlugsIcon: 'plugin-2',
  ProfileIcon: 'user-4',
  ProhibitIcon: 'forbid-circle',
  PulseIcon: 'heartbeat-2',
  QrIcon: 'qrcode-2',
  ReceiptIcon: 'bill',
  RefreshIcon: 'refresh-2',
  RepeatIcon: 'repeat',
  ScanIcon: 'scan',
  SearchIcon: 'search',
  SendIcon: 'send-plane',
  SettingsIcon: 'settings-3',
  ShapesIcon: 'emoji-2',
  ShareIcon: 'share-forward',
  ShieldIcon: 'safety-certificate',
  SortIcon: 'sort-descending',
  SplitIcon: 'chart-pie-2',
  SparkleIcon: 'sparkles',
  SuitcaseIcon: 'luggage',
  SunIcon: 'sun',
  SwapIcon: 'transfer-3',
  TagIcon: 'tag',
  TicketIcon: 'ticket',
  TrashIcon: 'delete-2',
  UserIcon: 'user-3',
  WalletIcon: 'wallet-4',
  WarningIcon: 'warning',
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
  chart: '~bars',
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
  liveTable: '~cloche',
  lock: 'lock-keyhole-minimalistic',
  lockKey: 'lock-password',
  lockOpen: 'lock-keyhole-minimalistic-unlocked',
  magicWand: 'magic-stick-3',
  merge: 'arrow-to-down-left',
  money: 'wallet-money',
  notePencil: 'pen-new-square',
  palette: 'palette',
  password: 'password-minimalistic',
  pattern: 'widget-4',
  pause: 'pause-circle',
  pencil: 'pen',
  phone: 'smartphone',
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

const art = (ref, kind, where) => {
  if (ref.startsWith('~')) {
    const c = CUSTOM[ref.slice(1)]
    if (!c) problems.push(`${where}: no custom drawing ${ref}`)
    return jsx(slim(c[kind], where))
  }
  const [setName, suffix] = {
    line: ['mingcute', '-line'],
    fill: ['mingcute', '-fill'],
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
const ui = `${header('UI icons: MingCute line / fill (Apache-2.0, mgc.mingcute.com), and our own Live table and Insights drawings on its grid.')}
import { makeIcon } from './Icon'

${uiNames
  .map((n) => {
    const ref = UI[n]
    const src = ref.startsWith('~') ? 'ours' : `mingcute ${ref}`
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
) => `${header(`Help and empty-screen pictures, ${label}: Solar (CC BY 4.0, 480 Design, github.com/480-Design/Solar-Icon-Set) and our own. Loaded on its own, only when this style is in use (src/components/Icon.tsx).`)}
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
