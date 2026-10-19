import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronRight, Loader2, Lock, Stamp, UserMinus, Users } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { createGroup, useAllExpenses, useCaptureTokens, useGroup, useGroups, useJoinRequests } from '@/hooks/data'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useFlag } from '@/hooks/useAppConfig'
import { usePrivateGroups } from '@/hooks/usePrivateGroups'
import { saveCapturePrefs, tripCaptureNotice } from '@/lib/capture-settings'
import { iconFollowsName } from '@/lib/group-icon-follow'
import { setTripPaused } from '@/lib/capture-filters'
import type { Group, GroupType, Member } from '@/types'
import { CURRENCIES, centsToInput } from '@/lib/money'
import { colorFor } from '@/lib/colors'
import { todayISO, uid } from '@/lib/id'
import { parsePeopleParam } from '@/lib/quick-ai'
import { isLiveTrip } from '@/lib/capture'
import { walletNaming } from '@/lib/wallets'
import { errText } from '@/lib/errors'
import { usePageTitle } from '@/lib/brand'
import { thresholdOf } from '@/lib/trust'
import {
  APPROVAL_BASE_CURRENCY,
  currencyLocked,
  defaultEditAutoApprove,
  defaultThreshold,
  groupApprovalInCurrency,
  shortMoney,
  tableThreshold,
  approvalsSummary,
} from '@/lib/approval'
import { getRate } from '@/lib/fx'
import { approveJoinsShown, joinsOffBlocker, waitingRequests } from '@/lib/join-approval'
import { useTodayRates } from '@/hooks/useFx'
import { GROUP_TYPES, SHARED_TYPES, groupTypeInfo, groupTypeOf, guessGroup, iconsFor, isSharedType, parseGroupType } from '@/lib/groupTypes'
import { useIconAi } from '@/hooks/useIconAi'
import { Avatar } from '@/components/Avatar'
import { IconPickerField, SuggestionPill, SuggestionRow, TypeSuggestion } from '@/components/IconPicker'
import { useAutoIconPick } from '@/hooks/useAutoIconPick'
import { groupPickRequest } from '@/lib/icon-pick'
import { Select, currencyOptions } from '@/components/Select'
import { LiveBadge, Loading, PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { currentMemberMatch } from '@/lib/members'
import { DateField } from '@/components/DateField'
import { Switch } from '@/components/Switch'
import { openNewGroup, passkeyCancelled, passkeyProof, registerPasskey } from '@/features/vault/passkey'
import type { VaultStatus } from '@/lib/vault-api'
import { defaultOpensWith, type OpensWith, privateBlocker } from '@/lib/vault-setup'
import { LockSetup } from '@/features/vault/LockSetup'
import { SetPatternSheet } from '@/features/vault/SetPatternSheet'
import { Collapsible } from '@/components/Collapsible'
import { MoneyInput } from '@/components/MoneyInput'
import { formatRange } from '@/components/Misc'
import { formatMoney } from '@/lib/money'
import { DeleteGroupButton } from '@/components/DeleteGroup'
import { activeMembers, memberState } from '@/lib/members'
import { MemberPicker } from '@/components/MemberPicker'
import { sharedPhotoURL } from '@/lib/memberSync'
import { SwipeRow } from '@/components/SwipeRow'
import { Detail, HintText, InfoTip, useLook, useShows, type Hint } from '@/components/Hint'

const DATES_HINT: Hint = {
  full: 'While it’s on, new expenses and captured payments default to this group.',
  short: 'While it’s on, new expenses go to this group.',
}
const TRIP_CAPTURE_HINT: Hint = {
  full: 'Adds your bank and UPI payments to this trip. Just for you: others keep their own.',
  short: 'Adds your payments to this trip, just for you.',
}
const SIMPLIFY_HINT: Hint = { full: 'Fewer payments: if A owes B and B owes C, A pays C directly.', short: 'Fewer payments, same balances.' }
const PRIVATE_HINT: Hint = {
  full: 'Its name, people’s names, descriptions, notes, comments and chat are encrypted. It opens with a pattern of taps and long presses, everyone’s universal one or one just for this group, plus Face ID or a passkey. You can turn it off later from the group’s menu.',
  short: 'Encrypted, opens with your pattern and Face ID.',
  tier: 'key',
}
const APPROVAL_HINT: Hint = {
  full: 'In this group, a big expense added by someone else stays pending (not counted) until everyone charged taps Approve.',
  short: 'Big expenses by others wait for an OK.',
}
const EDIT_AUTO_HINT: Hint = {
  full: 'In this group, when someone edits an expense that needs an OK, a change of up to this amount keeps its approvals. A bigger change asks everyone again.',
  short: 'Small changes keep their approvals.',
}
const CONVERTS_HINT: Hint = { full: 'Changing the currency converts these amounts.' }
const PAYMENT_OK_HINT: Hint = {
  full: "In this group, a payment someone records as paid to you counts once you confirm it, or straight away when their screenshot matches. It applies to payments recorded while it's on: turning it off later doesn't skip the OK for those, and new payments then count at once.",
  short: 'Payments to you count once you confirm them.',
}
const JOINS_HINT: Hint = {
  full: 'Nobody joins from the invite link, old links included. They ask, you get a notification, and you let them in or decline from the Inbox. Turning it off lets people join from the link again.',
  short: 'People ask to join; you let them in from the Inbox.',
}
const SWIPE_HINT: Hint = { full: 'Swipe a person left, or press and hold, to remove them.' }

const maxOthersFor = (t: GroupType) => (t === 'personal' ? 0 : t === 'direct' ? 1 : Infinity)

type Kind = 'group' | 'direct' | 'personal'
const KINDS: Array<{ kind: Kind; emoji: string; label: string; hint: string }> = [
  { kind: 'group', emoji: '👥', label: 'Group', hint: 'Trips & more' },
  { kind: 'direct', emoji: '🤝', label: '1:1 friend', hint: 'You + 1 friend' },
  { kind: 'personal', emoji: '👛', label: 'Personal', hint: 'Your own wallet' },
]

type Field = 'name' | 'budget' | 'dates' | 'threshold' | 'editAuto'

export default function GroupForm() {
  const { groupId } = useParams()
  const [params] = useSearchParams()
  const existing = useGroup(groupId)
  // Including trashed items: once there are any, the currency is fixed.
  const expenses = useAllExpenses(groupId)
  const groups = useGroups()
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  // Minimal look: the optional extras (type chips, the type guess) step aside.
  const extras = useShows(2)
  // A 'help' line is drawn only in Full and When needed; aria-describedby must not point at nothing.
  const look = useLook()
  const helpLines = look === 'full' || look === 'needed'

  const [initialType] = useState(() => parseGroupType(params.get('type')))
  // Quick add ("… in a new group Bali trip") opens a new group with ?name= filled in, as if typed.
  const [prefillName] = useState(() => (groupId ? '' : (params.get('name') ?? '').trim().slice(0, 60)))
  // …and with ?people= the people its line named (matched to people you know): "Rahul Sharma,Priya".
  const [prefillPeople] = useState(() => (groupId ? [] : parsePeopleParam(params.get('people'))))
  const [name, setName] = useState(prefillName)
  const [emoji, setEmoji] = useState(GROUP_TYPES[initialType].emoji)
  // An AI-drawn icon (Group.iconSvg), shown over the emoji; never in a private group.
  const [iconSvg, setIconSvg] = useState<string | undefined>(undefined)
  const [type, setType] = useState<GroupType>(initialType)
  // What the user chose themselves; name-based guesses and type defaults never overwrite these.
  const [nameTouched, setNameTouched] = useState(!!prefillName)
  const [typeTouched, setTypeTouched] = useState(false)
  const [iconTouched, setIconTouched] = useState(false)
  // Editing: an icon chosen on this screen (the saved one counts as chosen, until the name changes).
  const [iconChosen, setIconChosen] = useState(false)
  const [datesTouched, setDatesTouched] = useState(false)
  const [typedName, setTypedName] = useState(!!prefillName)
  const [dismissed, setDismissed] = useState('')
  const [currency, setCurrency] = useState(profile.currency)
  const [budget, setBudget] = useState<number | undefined>(undefined)
  const [simplify, setSimplify] = useState(true)
  const [requireApproval, setRequireApproval] = useState(false)
  // A private group (docs/VAULT.md): chosen here when the group is made; later, its creator turns it on or off from the group's menu.
  const [privateOn, setPrivateOn] = useState(false)
  const iconAi = useIconAi(privateOn || !!existing?.vault)
  // A picture from Draw a picture (Group.iconImage), shown over the drawn icon and the emoji.
  const [iconImage, setIconImage] = useState<string | undefined>(undefined)
  // A private group must open with a pattern: the person's universal one or its own, chosen right
  // here (LockSetup), along with their passkey. Saving waits until one is ready (privateBlocker).
  const [privateNote, setPrivateNote] = useState<string | null>(null)
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null)
  const [opensWith, setOpensWith] = useState<OpensWith>('universal')
  const [settingUniversal, setSettingUniversal] = useState(false)
  const [vaultBusy, setVaultBusy] = useState<'passkey' | null>(null)
  const loadVault = async () => {
    const s = await repo.vault<VaultStatus>({ op: 'status' })
    setVaultStatus(s)
    return s
  }
  const turnPrivate = async (on: boolean) => {
    setPrivateNote(null)
    if (!on) return setPrivateOn(false)
    try {
      const s = await loadVault()
      setOpensWith(defaultOpensWith(s, { set: !!ownPattern }))
      setPrivateOn(true)
    } catch (e) {
      setPrivateNote(errText(e))
    }
  }
  // Offered only to someone who turned private groups on (Settings → Encrypted groups); they start off.
  const privateShown = usePrivateGroups().offered
  // Its own pattern, chosen as it's made (optional): it opens only this group, for anyone told it in person.
  const [ownPattern, setOwnPattern] = useState<{ pattern: string; ordered: boolean } | null>(null)
  const [settingOwn, setSettingOwn] = useState(false)
  const [paymentApproval, setPaymentApproval] = useState(false)
  const [approveJoins, setApproveJoins] = useState(false)
  const [threshold, setThreshold] = useState<number | undefined>(undefined)
  const [thresholdTouched, setThresholdTouched] = useState(false)
  const [editAuto, setEditAuto] = useState(false)
  const [editAmount, setEditAmount] = useState<number | undefined>(undefined)
  const [editAmountTouched, setEditAmountTouched] = useState(false)
  const [startDate, setStartDate] = useState(() => (GROUP_TYPES[initialType].datesToday ? todayISO() : ''))
  const [endDate, setEndDate] = useState(() => (GROUP_TYPES[initialType].datesToday ? todayISO() : ''))
  const [members, setMembers] = useState<Record<string, Member>>({})
  /** photos of people picked from your other groups, by draft member id (display only) */
  const [photos, setPhotos] = useState<Record<string, string>>({})
  // People set aside when switching to 1:1 or Personal; they come back on switching to a group.
  const [parked, setParked] = useState<Record<string, Member>>({})
  const [busy, setBusy] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [approvalsOpen, setApprovalsOpen] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const lastShared = useRef<GroupType>(isSharedType(initialType) ? initialType : 'trip')
  usePageTitle(groupId ? (existing ? `Edit ${existing.name}` : existing === null ? 'Group not found' : undefined) : 'New group')

  // Load once: later snapshots (e.g. someone joining) must not wipe unsaved edits.
  const loaded = useRef<{ key: string; base?: Group } | null>(null)
  useEffect(() => {
    if (loaded.current?.key === (groupId ?? 'new')) return
    if (existing) {
      loaded.current = { key: existing.id, base: existing }
      // The rules do not validate `type`: an unknown value reads as Other instead of crashing the screen.
      setName(existing.name)
      setEmoji(existing.emoji)
      setIconSvg(existing.iconSvg)
      setIconImage(existing.iconImage)
      setType(groupTypeOf(existing))
      setCurrency(existing.currency)
      setNameTouched(true)
      setTypeTouched(true)
      setIconTouched(true)
      setDatesTouched(true)
      setBudget(existing.budget || undefined)
      setSimplify(existing.simplify)
      setMembers(existing.members)
      setStartDate(existing.startDate ?? '')
      setEndDate(existing.endDate ?? '')
      setRequireApproval(!!existing.requireApproval)
      setPaymentApproval(!!existing.paymentApproval)
      setApproveJoins(!!existing.approveJoins)
      setThreshold(existing.approvalThreshold)
      setThresholdTouched(existing.approvalThreshold !== undefined)
      setEditAuto(!!existing.editAutoApprove)
      setEditAmount(existing.editAutoApprove)
      setEditAmountTouched(existing.editAutoApprove !== undefined)
    } else if (!groupId) {
      loaded.current = { key: 'new' }
      const named = prefillPeople.map((n, i) => [uid('p_'), { name: n, color: colorFor(i + 1) }] as const)
      // Your own photo shows from the start (the saved group gets it too: firebaseRepo fills it in on create).
      const photo = sharedPhotoURL(profile.photoURL, repo.mode === 'demo')
      setMembers({
        [user.uid]: { name: profile.displayName, uid: user.uid, email: user.email, color: colorFor(0), ...(photo ? { photoURL: photo } : {}) },
        ...Object.fromEntries(named),
      })
    }
  }, [existing, groupId, user.uid, user.email, profile.displayName, profile.photoURL, prefillPeople])

  // Approval is a group setting, off for a new group. Turning it on fills in the currency's
  // defaults (₹2,000 to need an OK, ₹100 for small edits); an amount nobody typed follows the
  // currency (a currency off the default table converts the INR default at today's rate).
  const approvalRates = useTodayRates(currency, tableThreshold(currency) === undefined ? [APPROVAL_BASE_CURRENCY] : [])
  const inrRate = approvalRates?.[APPROVAL_BASE_CURRENCY]?.rate
  const suggested = groupId ? thresholdOf({ currency }) : defaultThreshold(currency, inrRate)
  const suggestedEdit = defaultEditAutoApprove(currency, groupId ? undefined : inrRate)
  useEffect(() => {
    if (!groupId && !thresholdTouched) setThreshold(suggested)
  }, [groupId, thresholdTouched, suggested])
  useEffect(() => {
    if (!groupId && !editAmountTouched) setEditAmount(suggestedEdit)
  }, [groupId, editAmountTouched, suggestedEdit])
  // Switching approval (or small edits) on in a group without a saved amount fills in the default.
  const turnApproval = (on: boolean) => {
    setRequireApproval(on)
    if (on && threshold === undefined) setThreshold(suggested)
  }
  const turnEditAuto = (on: boolean) => {
    setEditAuto(on)
    if (on && editAmount === undefined) setEditAmount(suggestedEdit)
  }
  // Any member may change the approval settings and the currency; a currency change converts the amounts.
  // Once the group has an expense (even a trashed one) the currency is fixed: amounts are stored in it.
  const lockCurrency = currencyLocked(!!existing, expenses)

  /** The group's currency changed: amounts someone set are converted at today's rate and rounded (no rate: the new currency's defaults). */
  const changeCurrency = async (next: string) => {
    const from = currency
    setCurrency(next)
    if (next === from) return
    // A filled-in default nobody typed becomes the new currency's default (new groups: the effect above).
    if (groupId && !thresholdTouched && threshold !== undefined) setThreshold(defaultThreshold(next))
    if (groupId && !editAmountTouched && editAmount !== undefined) setEditAmount(defaultEditAutoApprove(next))
    if (!(thresholdTouched || editAmountTouched)) return
    const rate = (await getRate(from, next, todayISO()))?.rate ?? null
    const out = groupApprovalInCurrency(
      { threshold: thresholdTouched ? threshold : undefined, editAutoApprove: editAmountTouched ? editAmount : undefined },
      from,
      next,
      rate,
    )
    if (out.threshold !== undefined) setThreshold(out.threshold)
    if (out.editAutoApprove !== undefined) setEditAmount(out.editAutoApprove)
  }

  // A new 1:1 is named after the friend until the user types a name of their own.
  const firstOther = Object.values(members).find((m) => m.uid !== user.uid)?.name ?? ''
  useEffect(() => {
    if (!groupId && !nameTouched) setName(type === 'direct' ? firstOther : '')
  }, [groupId, nameTouched, type, firstOther])

  // Trip auto-capture state (used further down; hooks stay above the early returns).
  const capturePrefs = useCapturePrefs()
  const captureTokens = useCaptureTokens()
  const captureEnabled = useFlag('autoCapture')
  const joinApprovalOn = useFlag('joinApproval')
  const [captureOn, setCaptureOn] = useState<boolean | null>(null)
  // When the name finds no icon by the app's own rules, the AI picks one of the group icons (and the type, while it wasn't chosen).
  // The AI's second icon for the name ("Sri Lanka bees": 🐝, or 🇱🇰), offered beside the one it picked.
  const [pickAlt, setPickAlt] = useState<{ title: string; emoji: string } | null>(null)
  // The icon follows the name: a new group's until one is chosen; a saved group's once it's renamed,
  // until one is chosen here, and never over a drawn picture (src/lib/group-icon-follow.ts).
  const followName = iconFollowsName({
    editing: !!existing,
    renamed: !!existing && name.trim() !== existing.name.trim(),
    iconTouched,
    iconChosen,
    hasPicture: !!(iconSvg || iconImage),
  })
  const pickingIcon = useAutoIconPick({
    title: name,
    offered: iconAi.auto,
    need: isSharedType(type) && typedName && followName && !privateOn && !guessGroup(name),
    request: (t) => groupPickRequest(t, { typeTouched }),
    onAnswer: (title, a) => {
      if (title !== name || !followName) return
      // applyType is defined below the early returns; the answer only arrives after a render that defined it.
      // A saved group keeps its type: only its icon follows a new name.
      if (a.type && !typeTouched && !existing) applyType(a.type, a.emoji)
      else if (a.emoji) setEmoji(a.emoji)
      setPickAlt(a.emoji && a.alt ? { title, emoji: a.alt } : null)
    },
  })

  // Its creator, with the setting on: who is still waiting to be let in (it stays on until they're answered).
  const joinWaitlist = useJoinRequests(groupId && existing?.approveJoins && existing.createdBy === user.uid ? [groupId] : null)
  if (groupId && existing === undefined) return <Loading />
  // Fixed: this group is gone for you, and every screen of it behind this one would say the same, so back leaves the group.
  if (groupId && existing === null) return <PageHeader title="Group not found" back={{ to: '/groups', mode: 'fixed' }} />

  const others = Object.entries(members).filter(([, m]) => m.uid !== user.uid)
  const peopleCount = existing ? Object.keys(activeMembers(existing.members)).length : 0
  const info = groupTypeInfo(type)
  const maxOthers = maxOthersFor(type)
  const shared = isSharedType(type)
  const showDates = shared && (info.dates !== null || !!startDate || !!endDate)
  // Types whose dates drive behaviour (a trip, an outing, an event) show them at the top of the form;
  // an Other/Home group that happens to carry dates keeps them under More options.
  const datesOnTop = showDates && info.dates !== null
  const shareable = type !== 'personal'
  const live = showDates && isLiveTrip({ startDate: startDate || undefined, endDate: endDate || undefined }, todayISO())
  // Trip auto-capture is this person's own setting (pausedTrips in their capture settings), not
  // the group's: the switch here only changes what their phone adds. A new group has no id yet,
  // so its choice is applied right after it's created.
  const captureNotice =
    showDates && capturePrefs && captureTokens
      ? tripCaptureNotice(
          { id: existing?.id ?? '', type, archived: existing?.archived, startDate: startDate || undefined, endDate: endDate || undefined },
          todayISO(),
          { tokens: captureTokens, pausedTrips: capturePrefs.pausedTrips, capturePaused: capturePrefs.capturePaused, enabled: captureEnabled },
        )
      : null
  const captureSwitch = captureNotice === 'on' || captureNotice === 'paused'
  const captureChecked = captureOn ?? captureNotice !== 'paused'
  const saveCapture = (id: string) => {
    if (!captureSwitch || captureOn === null || !capturePrefs || captureOn === (captureNotice === 'on')) return
    saveCapturePrefs(user.uid, repo.mode, { pausedTrips: setTripPaused(capturePrefs.pausedTrips, id, !captureOn) }).catch((e) => toast(errText(e), 'err'))
  }
  // Several wallets are fine (Fuel, Groceries…); only the first defaults to "My spending".
  const wallet = walletNaming((groups ?? []).filter((g) => g.type === 'personal' && g.id !== groupId).length)
  // Types you can switch between here: any shared type, but never to or from 1:1 / Personal once saved.
  const typeChips = shared && (!existing || isSharedType(groupTypeOf(existing)))
  const kind: Kind = shared ? 'group' : type === 'direct' ? 'direct' : 'personal'
  const guess = shared && typedName ? guessGroup(name) : null
  const guessKey = guess ? `${guess.type}${guess.emoji}` : ''
  const showGuess =
    !!guess &&
    (guess.type !== type || guess.emoji !== emoji) &&
    guessKey !== dismissed &&
    isSharedType(guess.type) &&
    (!existing || isSharedType(groupTypeOf(existing)))
  // The pills under the name (one scrolling row): the AI's second icon, and the type the name looks like.
  const altShown = !pickingIcon && !!pickAlt && pickAlt.title === name && followName && pickAlt.emoji !== emoji
  // Renamed, and the icon followed: the saved one is a tap away.
  const keepShown = !!existing && !iconChosen && !existing.iconSvg && !existing.iconImage && emoji !== existing.emoji
  const typeShown = extras && showGuess && !!guess
  // "New people need my OK": the creator's alone (the rules refuse anyone else's change), so it is
  // shown, and saved, only for them; a private group always asks.
  const joinsShown = approveJoinsShown(
    { type, vault: !!existing?.vault || (privateOn && privateShown), approveJoins: existing?.approveJoins },
    { flag: joinApprovalOn, creator: !existing || existing.createdBy === user.uid },
  )
  // Still waiting to be let in: the setting stays on until each is answered.
  const joinsOff = joinsOffBlocker(existing ? waitingRequests(joinWaitlist ?? [], [existing]).filter((r) => r.status === 'pending').length : 0)
  const approvals = approvalsSummary({ requireApproval, threshold, paymentApproval, approveJoins: joinsShown && approveJoins }, currency)
  const moreSummary = [
    currency,
    budget ? `budget ${formatMoney(budget, currency)}` : 'no budget',
    showDates && !datesOnTop && (startDate || endDate) ? formatRange(startDate || undefined, endDate || undefined) : null,
    type !== 'personal' ? `simplify ${simplify ? 'on' : 'off'}` : null,
    shareable && (requireApproval || paymentApproval || (joinsShown && approveJoins))
      ? `approvals: ${approvals.charAt(0).toLowerCase()}${approvals.slice(1)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const clearError = (f: Field) => setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e))

  /** Switch type; the icon, dates (new groups) and member list follow unless the user set them. */
  const applyType = (t: GroupType, icon?: string) => {
    setType(t)
    if (isSharedType(t)) lastShared.current = t
    if (icon) setEmoji(icon)
    else if (!iconTouched) setEmoji(GROUP_TYPES[t].emoji)
    if (existing) return
    if (!datesTouched) {
      const d = GROUP_TYPES[t].datesToday ? todayISO() : ''
      setStartDate(d)
      setEndDate(d)
    }
    // 1:1 keeps you and one friend, Personal only you; the rest wait in `parked`.
    const max = maxOthersFor(t)
    const keep: Record<string, Member> = {}
    const park: Record<string, Member> = {}
    let n = 0
    for (const [id, m] of Object.entries({ ...members, ...parked })) {
      if (m.uid === user.uid || n++ < max) keep[id] = m
      else park[id] = m
    }
    const newlyParked = Object.keys(park).filter((id) => !(id in parked)).length
    setMembers(keep)
    setParked(park)
    if (newlyParked)
      toast(
        `${newlyParked} ${newlyParked === 1 ? 'person' : 'people'} set aside: ${t === 'personal' ? 'a personal wallet is just you' : 'a 1:1 is you and one friend'}`,
      )
  }

  const chooseType = (t: GroupType) => {
    setTypeTouched(true)
    applyType(t)
  }
  const chooseKind = (k: Kind) => {
    if (k !== kind) chooseType(k === 'group' ? lastShared.current : k)
  }
  const chooseIcon = (e: string) => {
    setIconTouched(true)
    setIconChosen(true)
    setEmoji(e)
    setIconSvg(undefined)
    setIconImage(undefined)
  }
  const chooseSvg = (svg: string) => {
    setIconTouched(true)
    setIconChosen(true)
    setIconSvg(svg)
    setIconImage(undefined)
  }
  const chooseImage = (image: string) => {
    setIconTouched(true)
    setIconChosen(true)
    setIconImage(image)
    setIconSvg(undefined)
  }

  const onName = (v: string) => {
    setName(v)
    setNameTouched(true)
    setTypedName(true)
    clearError('name')
    // Until the user picks a type or icon, follow the name ("Goa trip" → trip, 🏖️).
    // A name the rules don't know keeps what's there (the AI may pick one in a moment); it never
    // falls back to a trip's ✈️, which looked as if typing had changed nothing.
    if (!existing && shared && !typeTouched && !iconTouched) {
      const g = guessGroup(v)
      if (g) applyType(g.type, g.emoji)
    }
    // A saved group: its icon follows a new name (its type stays), and the old name brings its icon back.
    if (existing && shared && !iconChosen && !existing.iconSvg && !existing.iconImage) {
      if (v.trim() === existing.name.trim()) setEmoji(existing.emoji)
      else {
        const g = guessGroup(v)
        if (g) setEmoji(g.emoji)
      }
    }
  }

  const addPerson = (personName: string, email?: string, accountUid?: string, photoURL?: string) => {
    if (!personName.trim() || others.length >= maxOthers) return
    // The same person twice (same account or email) would split their money across two entries.
    const already = currentMemberMatch(members, { email, uid: accountUid })
    if (already) return toast(`${members[already]!.name} is already in this group`, 'err')
    const id = uid('p_')
    // Shown on this screen only: their photo joins the group's entry when they claim their spot (memberSync), not before.
    if (photoURL) setPhotos((p) => ({ ...p, [id]: photoURL }))
    setMembers((m) => ({ ...m, [id]: { name: personName.trim(), email: email?.trim() || undefined, color: colorFor(Object.keys(m).length) } }))
  }
  /** Problems with what was typed, next to the field they belong to (not a passing toast). */
  const validate = (finalName: string): Partial<Record<Field, string>> => {
    const errs: Partial<Record<Field, string>> = {}
    if (!finalName) errs.name = type === 'direct' ? 'Add your friend' : type === 'personal' ? 'Give your wallet a name' : 'Give your group a name'
    if (startDate && endDate && endDate < startDate) errs.dates = 'It ends before it starts'
    if (shareable && requireApproval && threshold !== undefined && threshold <= 0) errs.threshold = 'Enter an amount above zero'
    if (shareable && requireApproval && editAuto && editAmount !== undefined && editAmount <= 0) errs.editAuto = 'Enter an amount above zero'
    if (budget !== undefined && budget <= 0) errs.budget = 'A budget must be above zero'
    return errs
  }

  const save = async () => {
    // A 1:1 has no name of its own: it shows as the other person to each of you (shared/names.ts
    // groupNameFor). The friend's name is still stored, for notifications and older apps.
    const finalName = type === 'direct' ? (existing?.name ?? others[0]?.[1].name ?? '') : name.trim() || (type === 'personal' ? wallet.fallbackName : '')
    const errs = validate(finalName)
    if (!existing && others.length > maxOthers) return toast(type === 'direct' ? 'A 1:1 is you and one friend' : 'A personal wallet is just you', 'err')
    if (Object.keys(errs).length) {
      setErrors(errs)
      if (errs.name) nameRef.current?.focus()
      else {
        // Trip-like dates sit at the top of the form; everything else may be inside More options.
        if (!(errs.dates && datesOnTop)) setMoreOpen(true)
        if (errs.threshold || errs.editAuto) setApprovalsOpen(true)
        requestAnimationFrame(() =>
          document
            .getElementById(errs.budget ? 'group-budget' : errs.dates ? 'trip-start' : errs.threshold ? 'approval-threshold' : 'edit-auto-approve')
            ?.focus(),
        )
      }
      return
    }
    // A private group can't be made until something opens it.
    if (!existing && privateOn && privateShown && shareable) {
      const blocked = vaultStatus ? privateBlocker(vaultStatus, { opensWith, own: { set: !!ownPattern }, demo: repo.mode === 'demo' }) : 'Checking…'
      if (blocked) {
        setPrivateNote(blocked)
        return document.getElementById('group-private-setup')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
    // A personal wallet only ever holds you, whatever was typed before switching to it.
    const saved = type === 'personal' && !existing ? Object.fromEntries(Object.entries(members).filter(([, m]) => m.uid === user.uid)) : members
    setBusy(true)
    try {
      const data = {
        name: finalName,
        emoji,
        // A private group has none: it can't be sealed (the rules refuse it), and the name must not leave the phone.
        iconSvg: privateOn || existing?.vault ? undefined : iconSvg,
        iconImage: privateOn || existing?.vault ? undefined : iconImage,
        type,
        currency,
        budget,
        simplify,
        members: saved,
        startDate: showDates ? startDate || undefined : undefined,
        endDate: showDates ? endDate || undefined : undefined,
        // A new group stores its threshold, so one in a currency off the default table keeps the converted figure.
        ...(shareable
          ? {
              requireApproval: requireApproval || undefined,
              approvalThreshold: requireApproval ? (threshold ?? (existing ? undefined : suggested)) : undefined,
              editAutoApprove: requireApproval && editAuto ? (editAmount ?? suggestedEdit) : undefined,
              paymentApproval: paymentApproval || undefined,
            }
          : {}),
        // Only when shown: leaving it out keeps someone else's setting as it is.
        ...(joinsShown ? { approveJoins: approveJoins || undefined } : {}),
        ...(!existing && shareable && privateOn ? { vault: true as const } : {}),
        memberUids: [
          ...new Set(
            Object.values(saved)
              .map((m) => m.uid)
              .filter(Boolean) as string[],
          ),
        ],
      }
      if (existing) {
        // Settings only: members are managed on the Members screen (per-member writes, so concurrent joins survive).
        const { members: _m, memberUids: _u, ...settings } = data
        await repo.updateGroupSettings(loaded.current?.base ?? existing, settings)
        saveCapture(existing.id)
        toast('Group updated')
        nav(`/groups/${existing.id}`, { replace: true })
      } else {
        const id = await createGroup({ ...data, createdBy: user.uid } as Omit<Group, 'id' | 'createdAt' | 'updatedAt' | 'inviteCode'>)
        saveCapture(id)
        // Its first key, here, so the person who made it lands in it open; if that fails it opens with their pattern.
        if (data.vault) await openNewGroup(repo, id, opensWith === 'own' ? (ownPattern ?? undefined) : undefined).catch(() => {})
        toast(type === 'personal' ? 'Wallet created' : 'Group created')
        // ?next=add: opened from Add expense, so go straight back there with the new group picked
        // (&quick=1: from Quick add, whose line waits in memory to fill the form).
        // (&capture=: from a captured payment's "Personal" → "New wallet…", which goes on to the form for it.)
        const capture = params.get('capture')
        nav(
          params.get('next') === 'add'
            ? `/add?group=${id}${params.get('quick') ? '&quick=1' : ''}${capture ? `&capture=${encodeURIComponent(capture)}` : ''}`
            : `/groups/${id}`,
          { replace: true },
        )
      }
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const FieldError = ({ id, text }: { id: string; text?: string }) =>
    text ? (
      <p id={id} role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-400">
        {text}
      </p>
    ) : null

  // Dates, their Live badge and the per-person SMS auto-capture switch: at the top for trip-like types, else under More options.
  const datesBlock = (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label !mb-0 flex items-center">
          {info.dates ?? 'Dates'} (optional)
          <InfoTip hint={DATES_HINT} label="About the dates" />
        </span>
        {live && <LiveBadge type={type} />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="trip-start" className="text-muted mb-1 block text-xs font-medium">
            Start
          </label>
          <DateField
            id="trip-start"
            aria-label="Start date"
            placeholder="Add date"
            clearable
            value={startDate}
            max={endDate || undefined}
            onChange={(v) => {
              setDatesTouched(true)
              setStartDate(v)
              clearError('dates')
            }}
          />
        </div>
        <div>
          <label htmlFor="trip-end" className="text-muted mb-1 block text-xs font-medium">
            End
          </label>
          <DateField
            id="trip-end"
            aria-label="End date"
            placeholder="Add date"
            clearable
            value={endDate}
            min={startDate || undefined}
            onChange={(v) => {
              setDatesTouched(true)
              setEndDate(v)
              clearError('dates')
            }}
          />
        </div>
      </div>
      <FieldError id="trip-dates-error" text={errors.dates} />
      <HintText hint={DATES_HINT} className="text-muted mt-1.5 text-xs" />
      {captureSwitch ? (
        <Detail min={2}>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800" data-testid="group-trip-capture">
            <div id="trip-capture-label">
              <div className="flex items-center font-semibold">
                SMS auto-capture
                <InfoTip hint={TRIP_CAPTURE_HINT} label="About SMS auto-capture" />
              </div>
              <HintText hint={TRIP_CAPTURE_HINT} className="text-muted text-xs" as="div" />
            </div>
            <Switch checked={captureChecked} onChange={setCaptureOn} label="SMS auto-capture for this trip" testId="group-trip-capture-switch" />
          </div>
        </Detail>
      ) : captureNotice === 'off' ? (
        <p className="text-muted mt-1 text-xs">
          Your SMS auto-capture is paused.{' '}
          <Link to="/settings/automation" className="font-semibold text-brand-600 dark:text-brand-300">
            Settings
          </Link>
        </p>
      ) : (
        captureNotice === 'setup' && (
          <HintText
            className="text-muted mt-1 text-xs"
            hint={{
              full: (
                <>
                  Tip: each person can add their own bank and UPI payments to this trip with{' '}
                  {existing ? (
                    <Link to={`/settings/auto-capture?group=${existing.id}`} className="font-semibold text-brand-600 dark:text-brand-300">
                      SMS auto-capture
                    </Link>
                  ) : (
                    <b>SMS auto-capture</b>
                  )}
                  {existing ? '' : ' (on the group page after saving)'}.
                </>
              ),
              tier: 'extra',
            }}
          />
        )
      )}
    </div>
  )

  const thresholdHint: Hint = {
    full: (
      <>
        In this group, a new expense above {shortMoney(threshold ?? suggested, currency)} waits for an OK. At or below it counts straight away.
        {threshold === undefined && ` Empty means the default for ${currency}.`}
      </>
    ),
    short: `Above ${shortMoney(threshold ?? suggested, currency)} waits for an OK.`,
  }

  // Currency, budget, simplify and approval: folded under More options for a new group, open when editing.
  const options = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="label" id="group-currency-label">
            Currency
          </div>
          <Select
            aria-label="Currency"
            value={currency}
            onChange={(c) => void changeCurrency(c)}
            options={currencyOptions(CURRENCIES)}
            disabled={lockCurrency}
          />
        </div>
        <div>
          <label className="label" htmlFor="group-budget">
            Budget (optional)
          </label>
          <MoneyInput
            id="group-budget"
            value={budget}
            currency={currency}
            onChange={(v) => {
              setBudget(v)
              clearError('budget')
            }}
            aria-label="Budget"
            aria-invalid={!!errors.budget}
            aria-describedby={errors.budget ? 'group-budget-error' : undefined}
          />
          <FieldError id="group-budget-error" text={errors.budget} />
        </div>
      </div>
      {lockCurrency && expenses && (
        <div className="-mt-2" data-testid="group-currency-locked">
          <HintText
            hint={{ full: "The currency can't change once the group has expenses.", short: 'Currency is fixed once there are expenses.', tier: 'key' }}
            className="text-muted text-xs"
          />
        </div>
      )}
      {showDates && !datesOnTop && datesBlock}
      {type !== 'personal' && (
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
          <div id="simplify-label">
            <div className="flex items-center font-semibold">
              Simplify debts
              <InfoTip hint={SIMPLIFY_HINT} label="About Simplify debts" />
            </div>
            <HintText hint={SIMPLIFY_HINT} className="text-muted text-xs" as="div" />
          </div>
          <Switch checked={simplify} onChange={setSimplify} label="Simplify debts" testId="group-simplify" />
        </div>
      )}
      {existing?.vault && (
        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800" data-testid="group-private-on">
          <Lock size={16} aria-hidden /> <span className="font-semibold">Private group</span>
          <span className="text-muted">· opens with your pattern and passkey</span>
        </div>
      )}
      {shareable && (
        // Everything that needs someone's OK in this group, in one place; closed, its line says what is on.
        <Collapsible
          title="Approvals"
          icon={<Stamp size={20} aria-hidden />}
          summary={approvals}
          open={approvalsOpen}
          onOpenChange={setApprovalsOpen}
          className="!mt-0 !bg-slate-50 !shadow-none !ring-0 dark:!bg-ink-800"
          testId="group-approvals"
        >
          <div className="space-y-3">
            <div className="rounded-2xl bg-white p-3 dark:bg-ink-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center font-semibold">
                    Needs your OK for big expenses
                    <InfoTip hint={APPROVAL_HINT} label="About approval for big expenses" />
                  </div>
                  <HintText hint={APPROVAL_HINT} className="text-muted text-xs" as="div" />
                </div>
                <Switch checked={requireApproval} onChange={turnApproval} label="Require approval for big expenses" testId="group-approval" />
              </div>
              {requireApproval && (
                <div className="mt-3">
                  <div className="flex items-center">
                    <label className="label" htmlFor="approval-threshold">
                      Needs an OK above
                    </label>
                    <InfoTip hint={thresholdHint} label="About the approval amount" />
                  </div>
                  <MoneyInput
                    id="approval-threshold"
                    value={threshold}
                    currency={currency}
                    placeholder={centsToInput(suggested, currency)}
                    onChange={(v) => {
                      setThreshold(v)
                      setThresholdTouched(true)
                      clearError('threshold')
                    }}
                    aria-invalid={!!errors.threshold}
                    aria-describedby={errors.threshold ? 'approval-threshold-error' : helpLines ? 'approval-threshold-hint' : undefined}
                    data-testid="group-approval-threshold"
                  />
                  <HintText id="approval-threshold-hint" hint={thresholdHint} className="text-muted mt-1 text-xs" />
                  <FieldError id="approval-threshold-error" text={errors.threshold} />
                </div>
              )}
              {requireApproval && (
                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center font-semibold">
                        Approve small edits automatically
                        <InfoTip hint={EDIT_AUTO_HINT} label="About approving small edits" />
                      </div>
                      <HintText hint={EDIT_AUTO_HINT} className="text-muted text-xs" as="div" />
                    </div>
                    <Switch checked={editAuto} onChange={turnEditAuto} label="Approve small edits automatically" testId="group-edit-auto" />
                  </div>
                  {editAuto && (
                    <div className="mt-3">
                      <label className="label" htmlFor="edit-auto-approve">
                        Changes of up to
                      </label>
                      <MoneyInput
                        id="edit-auto-approve"
                        value={editAmount}
                        currency={currency}
                        placeholder={centsToInput(suggestedEdit, currency)}
                        onChange={(v) => {
                          setEditAmount(v)
                          setEditAmountTouched(true)
                          clearError('editAuto')
                        }}
                        aria-invalid={!!errors.editAuto}
                        aria-describedby={errors.editAuto ? 'edit-auto-approve-error' : undefined}
                        data-testid="group-edit-auto-amount"
                      />
                      <FieldError id="edit-auto-approve-error" text={errors.editAuto} />
                    </div>
                  )}
                </div>
              )}
              {requireApproval && !lockCurrency && <HintText hint={CONVERTS_HINT} className="text-muted mt-3 text-xs" />}
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-3 dark:bg-ink-900">
              <div>
                <div className="flex items-center font-semibold">
                  Payments need the recipient's OK
                  <InfoTip hint={PAYMENT_OK_HINT} label="About payment approval" />
                </div>
                <HintText hint={PAYMENT_OK_HINT} className="text-muted text-xs" as="div" />
              </div>
              <Switch checked={paymentApproval} onChange={setPaymentApproval} label="Payments need the recipient's OK" testId="group-payment-approval" />
            </div>
            {joinsShown && (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-3 dark:bg-ink-900" data-testid="group-approve-joins-row">
                <div>
                  <div className="flex items-center font-semibold">
                    New people need my OK
                    <InfoTip hint={JOINS_HINT} label="About new people needing your OK" />
                  </div>
                  <HintText hint={JOINS_HINT} className="text-muted text-xs" as="div" />
                </div>
                <Switch
                  checked={approveJoins}
                  onChange={(on) => {
                    if (!on && joinsOff) return toast(joinsOff, 'err')
                    setApproveJoins(on)
                  }}
                  label="New people need my OK"
                  testId="group-approve-joins"
                />
              </div>
            )}
            {joinsShown && approveJoins && joinsOff && (
              <p className="text-muted px-1 text-xs" role="status" data-testid="group-approve-joins-waiting">
                {joinsOff}{' '}
                <Link to="/inbox" className="font-semibold text-brand-700 dark:text-brand-300">
                  Open the Inbox
                </Link>
              </p>
            )}
          </div>
        </Collapsible>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader
        title={
          existing ? (type === 'direct' ? 'Edit 1:1' : 'Edit group') : type === 'direct' ? 'New 1:1' : type === 'personal' ? 'Personal wallet' : 'New group'
        }
        back={existing ? `/groups/${existing.id}` : '/groups'}
      />
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        noValidate
      >
        {!existing && (
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-ink-800" role="radiogroup" aria-label="What are you creating?">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={kind === k.kind}
                onClick={() => chooseKind(k.kind)}
                className={`min-w-0 rounded-xl px-2.5 py-2.5 text-left transition active:scale-[.98] ${kind === k.kind ? 'accent-live bg-gradient-to-br from-fill to-fill-to text-on-fill shadow-md shadow-fill/25' : 'text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-ink-700'}`}
              >
                <div className="text-xl leading-none" aria-hidden>
                  {k.emoji}
                </div>
                <div className="mt-1.5 truncate text-sm font-bold">{k.label}</div>
                <div className={`truncate text-xs ${kind === k.kind ? 'text-on-fill/90' : 'text-muted'}`}>{k.hint}</div>
              </button>
            ))}
          </div>
        )}
        <div className={`card space-y-4 p-4 ${type === 'direct' && !typeChips ? 'hidden' : ''}`}>
          {type !== 'direct' && (
            <IconPickerField
              emoji={emoji}
              onChange={chooseIcon}
              emojis={iconsFor(type)}
              iconSvg={privateOn || existing?.vault ? undefined : iconSvg}
              onPickSvg={chooseSvg}
              iconImage={privateOn || existing?.vault ? undefined : iconImage}
              onPickImage={chooseImage}
              picture={iconAi.picture}
              pictureCost={iconAi.pictureCost}
              aiWhy={iconAi.why}
              pictureOff={iconAi.pictureWhy}
              ai={iconAi.suggest ? { kind: 'group' } : undefined}
            >
              <label className="label" htmlFor="group-name">
                Name
              </label>
              <input
                ref={nameRef}
                id="group-name"
                className={`input ${errors.name ? 'ring-2 ring-rose-500' : ''}`}
                placeholder={type === 'personal' ? wallet.placeholder : info.placeholder}
                value={name}
                onChange={(e) => onName(e.target.value)}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="done"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'group-name-error' : undefined}
              />
            </IconPickerField>
          )}
          {type !== 'direct' && <FieldError id="group-name-error" text={errors.name} />}
          {pickingIcon && (
            <p className="text-muted flex items-center gap-1.5 px-1 text-xs" role="status" data-testid="group-icon-picking">
              <Loader2 size={12} className="animate-spin" aria-hidden /> Picking an icon for “{name.trim()}”…
            </p>
          )}
          {(altShown || typeShown || keepShown) && (
            <SuggestionRow>
              {keepShown && existing && (
                <SuggestionPill
                  testId="group-icon-keep"
                  dismissLabel="Dismiss"
                  onDismiss={() => setIconChosen(true)}
                  onApply={() => {
                    setIconChosen(true)
                    setEmoji(existing.emoji)
                    setPickAlt(null)
                  }}
                >
                  Keep{' '}
                  <span aria-hidden className="mx-1">
                    {existing.emoji}
                  </span>
                  <span className="sr-only">the icon {existing.emoji}</span>
                </SuggestionPill>
              )}
              {altShown && pickAlt && (
                <SuggestionPill
                  testId="group-icon-alt"
                  dismissLabel="Dismiss the other icon"
                  onDismiss={() => setPickAlt(null)}
                  onApply={() => {
                    setIconTouched(true)
                    setIconChosen(true)
                    setEmoji(pickAlt.emoji)
                    setPickAlt(null)
                  }}
                >
                  Or{' '}
                  <span aria-hidden className="mx-1">
                    {pickAlt.emoji}
                  </span>
                  <span className="sr-only">the icon {pickAlt.emoji}</span> · use it
                </SuggestionPill>
              )}
              {typeShown && guess && (
                <TypeSuggestion
                  guess={guess}
                  onDismiss={() => setDismissed(guessKey)}
                  onApply={() => {
                    setTypeTouched(true)
                    setIconTouched(true)
                    applyType(guess.type, guess.emoji)
                  }}
                />
              )}
            </SuggestionRow>
          )}
          {extras && typeChips && (
            <div role="radiogroup" aria-labelledby="group-type-label">
              <div className="label" id="group-type-label">
                Type
              </div>
              <div className="flex flex-wrap gap-2">
                {SHARED_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    onClick={() => chooseType(t)}
                    className={`chip min-h-10 ${type === t ? 'chip-on' : ''}`}
                  >
                    <span aria-hidden>{GROUP_TYPES[t].emoji}</span> {GROUP_TYPES[t].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {datesOnTop && <div className="card p-4">{datesBlock}</div>}

        {type !== 'personal' && !existing && (
          <div className="card p-4">
            <div className="label">{type === 'direct' ? 'Your friend' : 'Members'}</div>
            <ul className="-mx-4">
              {/* A 1:1 is about the friend: you're in it anyway, so you aren't listed. */}
              {Object.entries(members)
                .filter(([, m]) => type !== 'direct' || m.uid !== user.uid)
                .map(([id, m]) => (
                  <SwipeRow
                    key={id}
                    contentClassName="flex items-center gap-3 px-4 py-1.5"
                    menuTitle={m.name}
                    actions={
                      m.uid === user.uid
                        ? []
                        : [
                            {
                              label: 'Remove',
                              ariaLabel: `Remove ${m.name}`,
                              icon: <UserMinus size={20} strokeWidth={2.25} />,
                              onClick: () => setMembers(({ [id]: _, ...rest }) => rest),
                            },
                          ]
                    }
                  >
                    <Avatar name={m.name} color={m.color} photoURL={m.photoURL ?? photos[id]} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {m.name} {m.uid === user.uid && <span className="text-muted text-xs">(you)</span>}
                      </div>
                      <div className="text-muted truncate text-xs">{memberState(m)}</div>
                    </div>
                  </SwipeRow>
                ))}
            </ul>
            {others.length > 0 && <HintText hint={SWIPE_HINT} className="text-muted mt-1 text-xs" />}
            {others.length < maxOthers && (
              <div className={others.length ? 'mt-4 border-t border-slate-100 pt-4 dark:border-white/5' : ''}>
                <MemberPicker groups={groups} myUid={user.uid} members={members} onAdd={addPerson} />
              </div>
            )}
            {type === 'direct' && <FieldError id="group-name-error" text={errors.name} />}
          </div>
        )}
        {type !== 'personal' && type !== 'direct' && existing && (
          <Link to={`/groups/${existing.id}/members`} className="card flex min-h-14 items-center gap-3 px-4 py-3" data-testid="group-manage-members">
            <Users size={20} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Manage members</span>
              <span className="text-muted block truncate text-xs">
                {peopleCount} {peopleCount === 1 ? 'person' : 'people'}: add or remove
              </span>
            </span>
            <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
          </Link>
        )}

        {/* Private sits out here rather than under More options: it's the one choice that changes how the group opens. */}
        {shareable && !existing && privateShown && (
          <div className="card flex items-center justify-between gap-4 p-4">
            <div id="private-label">
              <div className="flex items-center gap-1.5 font-semibold">
                <Lock size={16} aria-hidden /> Private group
              </div>
              <HintText hint={PRIVATE_HINT} className="text-muted text-xs" as="div" />
            </div>
            <Switch checked={privateOn} onChange={(v) => void turnPrivate(v)} label="Private group" testId="group-private" />
          </div>
        )}
        {privateOn && privateShown && vaultStatus && (
          <div id="group-private-setup" className="-mt-2" data-testid="group-own-pattern">
            <LockSetup
              status={vaultStatus}
              scope="group"
              opensWith={opensWith}
              onOpensWith={(v) => {
                setOpensWith(v)
                setPrivateNote(null)
              }}
              own={{ set: !!ownPattern, ordered: ownPattern?.ordered }}
              demo={repo.mode === 'demo'}
              busy={vaultBusy}
              testId="group-private-setup"
              onAction={(row, action) => {
                setPrivateNote(null)
                if (row === 'own') return action === 'remove' ? setOwnPattern(null) : setSettingOwn(true)
                if (row === 'universal') return setSettingUniversal(true)
                if (row === 'passkey') {
                  setVaultBusy('passkey')
                  registerPasskey(repo)
                    .then(loadVault)
                    .then(() => toast('Passkey added'))
                    .catch((e) => !passkeyCancelled(e) && toast(errText(e), 'err'))
                    .finally(() => setVaultBusy(null))
                }
              }}
            />
          </div>
        )}
        <SetPatternSheet
          open={settingOwn}
          onClose={() => setSettingOwn(false)}
          kind="group"
          fresh
          save={async (pattern, ordered) => {
            if (pattern !== null) setOwnPattern({ pattern, ordered })
            setSettingOwn(false)
          }}
        />
        {/* The universal pattern, set right here (it's the account's, the same as Settings → Encrypted groups). */}
        <SetPatternSheet
          open={settingUniversal}
          onClose={() => setSettingUniversal(false)}
          kind="universal"
          hasCurrent={!!vaultStatus?.universal}
          ordered={vaultStatus?.ordered !== false}
          save={async (pattern, ordered, current) => {
            if (pattern === null) return
            const auth = await passkeyProof(repo)
            await repo.vault({ op: 'setUniversal', pattern, ordered, current, auth })
            setSettingUniversal(false)
            await loadVault()
            toast('Universal pattern set')
          }}
        />
        {privateNote && (
          <p className="-mt-2 px-1 text-sm" role="status" data-testid="group-private-note">
            {privateNote}
          </p>
        )}

        {/* New group keeps the extras folded so creating stays quick; Edit group shows them all. */}
        {existing ? (
          <div className="card p-4" data-testid="group-options">
            {options}
          </div>
        ) : (
          <Collapsible title="More options" summary={moreSummary} open={moreOpen} onOpenChange={setMoreOpen} className="!mt-0" testId="group-more">
            {options}
          </Collapsible>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="group-save">
          {existing ? 'Save changes' : type === 'direct' ? 'Create 1:1' : type === 'personal' ? 'Create wallet' : 'Create group'}
        </button>
        {extras && !existing && shared && (
          <Link to="/groups/import" className="text-muted flex min-h-11 items-center justify-center text-sm font-semibold">
            Switching from Splitwise? Import a group
          </Link>
        )}
        {existing && <DeleteGroupButton group={existing} />}
      </form>
    </div>
  )
}
