import { useEffect, useMemo, useRef, useState } from 'react'
import { labelOf } from '@/lib/shortNames'
import { ChevronRight, Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId } from '@/hooks/data'
import type { Category, Group, MemberId, OpenItem } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { todayISO, uid } from '@/lib/id'
import { errText } from '@/lib/errors'
import { aiScanEnabled, aiScanPossible } from '@/lib/ai'
import { formatDate, formatDateTime } from '@/lib/locale'
import { addedLine } from '@/lib/added'
import { authorMember } from '@/lib/chat'
import { formatMoney } from '@/lib/money'
import {
  NOTES_MAX,
  TITLE_MAX,
  aiPickOf,
  autoIcon,
  categoryChosen,
  chosenIcon,
  editOpenItem,
  itemAltsOffered,
  itemInput,
  needsItemAutoPick,
  newOpenItem,
  openItemErrors,
  sheetCategory,
  sheetEmoji,
  withAutoPick,
  withCategory,
  withIcon,
  withIconImage,
  withIconSvg,
  withTitle,
  type OpenItemInput,
} from '@/lib/open-items'
import type { AiPick } from '@/lib/group-icon-follow'
import { expensePickRequest } from '@/lib/icon-pick'
import { categoryIcons } from '@/lib/icons'
import { useIconAi } from '@/hooks/useIconAi'
import { useAutoIconPick } from '@/hooks/useAutoIconPick'
import { IconFace } from '@/components/IconFace'
import { IconSheet } from '@/components/IconSheet'
import { SuggestionPill, SuggestionRow } from '@/components/IconPicker'
import { Avatar } from '@/components/Avatar'
import { DateField } from '@/components/DateField'
import { MoneyInput } from '@/components/MoneyInput'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { CategorySheet } from '@/features/expense-form/sheets'
import { HintText, InfoTip, type Hint } from '@/components/Hint'

const NEW_ITEM_HINT: Hint = {
  full: 'Something the group spent that nobody has added yet. Anyone can claim it later.',
  short: 'Anyone can claim it later.',
}
const SUSPECTS_HINT: Hint = { full: 'They’ll get a notification asking them to claim it.', short: 'They’ll get a notification.' }

/** What a typed line adds beyond what's already in the fields ("Found ₹290 · 2 Oct · Rahul"). */
type Found = OpenItemInput & { line: string }

/** Wait this long after the last keystroke before asking the AI reader, and at most this many times per sheet. */
const AI_PAUSE_MS = 1200
const AI_MAX_CALLS = 4

/**
 * Write down an open item, or edit one. The first field takes a whole line ("lunch 290 2nd Oct
 * Cafe Blue"): what it reads beyond the words is offered as one tap ("Use these"), never applied
 * behind the person's back. Nothing but the title is required.
 *
 * Two readings, both only offers: the phone's (the Quick add grammar, instant, always) and, when
 * the person reads bills with AI (Settings → AI; the admin's aiImages flag and their allowance,
 * checked on the server), the AI reader Quick add fills its gaps with, once typing pauses. The AI
 * row shows only when it adds something the phone didn't find.
 */
export function OpenItemSheet({
  open,
  onClose,
  group,
  item,
  onSaved,
  onDelete,
  initial,
}: {
  open: boolean
  onClose: () => void
  group: Group
  /** the item being edited; absent for a new one */
  item?: OpenItem
  /** after a save (a new item comes back with its id) */
  onSaved?: (item: OpenItem, isNew: boolean) => void
  /** edit mode: delete it (the caller shows the Undo toast) */
  onDelete?: (item: OpenItem) => void
  /** a new item's starting fields (Save as open item from the expense form) */
  initial?: OpenItemInput
}) {
  const { user } = useMe()
  const toast = useToast()
  const today = todayISO()
  const order = useMemo(() => memberOrder(group, item?.suspects), [group, item?.suspects])
  const me = myMemberId(group, user.uid)
  const blank: OpenItemInput = item ? itemInput(item) : (initial ?? { title: '', date: today })
  const [f, setF] = useState<OpenItemInput>(blank)
  const [catOpen, setCatOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  // The AI's answer for the title (its pick, then its other good fits, offered as pills: src/lib/open-items.ts itemAltsOffered).
  const [aiPick, setAiPick] = useState<AiPick | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [found, setFound] = useState<Found | null>(null)
  const [aiFound, setAiFound] = useState<Found | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  /** titles a "Use these" produced: not read again (they'd only echo themselves) */
  const applied = useRef(new Set<string>())
  const aiCalls = useRef(0)
  const aiCache = useRef(new Map<string, Found | null>())
  // biome-ignore lint/correctness/useExhaustiveDependencies: a fresh form each time the sheet opens (or opens on another item).
  useEffect(() => {
    if (!open) return
    setF(blank)
    setSubmitted(false)
    setFound(null)
    setAiFound(null)
    setAiPick(null)
    applied.current.clear()
    aiCalls.current = 0
  }, [open, item?.id])
  const ctx = useMemo(
    () => ({ members: order.map((id) => ({ id, name: group.members[id].name })), me: me ?? order[0], currency: group.currency, today }),
    [order, group, me, today],
  )
  const aiOn = !item && aiScanPossible() && aiScanEnabled()
  // The icon, as the expense form's (src/features/expense-form/ExpenseEditor.tsx): no AI, drawn icon or picture in a private group.
  const iconAi = useIconAi(!!group.vault)
  // Automatic: the app's own rules from the title first; when they find none, the AI picks (and the category, while it's still Other).
  const pickingIcon = useAutoIconPick({
    title: f.title,
    offered: open && iconAi.auto,
    need: needsItemAutoPick(f),
    request: (t) => expensePickRequest(t, { category: sheetCategory(f), catTouched: categoryChosen(f) }),
    onAnswer: (title, a) => {
      setF((p) => withAutoPick(p, { title, icon: a.emoji, category: a.category }))
      setAiPick(aiPickOf(title, a))
    },
  })

  // Read the line as it's typed (new items only): the parser is a lazy chunk.
  useEffect(() => {
    if (!open || item) return
    const line = f.title
    if (applied.current.has(line) || !/\d|\b(?:yesterday|today|tonight|kal|last|ago|paid|mon|tue|wed|thu|fri|sat|sun)/i.test(line)) {
      setFound(null)
      return
    }
    let live = true
    const t = setTimeout(() => {
      import('@/lib/open-item-line')
        .then(({ openItemFromLine }) => {
          if (!live) return
          const r = openItemFromLine(line, ctx)
          const adds = r.title !== line.trim() && (r.amount !== undefined || r.date !== undefined || !!r.suspects?.length)
          setFound(adds ? { ...r, line } : null)
        })
        .catch(() => {})
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [open, item, f.title, ctx])

  // The AI reader, once typing pauses on a line of a few words (never for a line a "Use these" wrote).
  useEffect(() => {
    if (!open || !aiOn) return
    const line = f.title.trim()
    if (applied.current.has(f.title) || line.length < 6 || !/\s/.test(line)) {
      setAiFound(null)
      return
    }
    if (aiCache.current.has(line)) {
      setAiFound(aiCache.current.get(line) ?? null)
      return
    }
    if (aiCalls.current >= AI_MAX_CALLS) return
    let live = true
    const t = setTimeout(async () => {
      aiCalls.current++
      setAiBusy(true)
      try {
        const [{ openItemFromLine, openItemFromAi }, r] = await Promise.all([
          import('@/lib/open-item-line'),
          repo.parseTextAi(line, { members: ctx.members.map((m) => m.name), currency: ctx.currency, today: ctx.today }),
        ])
        const got = r && !r.unavailable ? openItemFromAi(openItemFromLine(line, ctx), r.expense, ctx) : null
        const res = got ? { ...got, line } : null
        aiCache.current.set(line, res)
        if (live) setAiFound(res)
      } catch (e) {
        console.warn('Open item AI read failed', e)
      } finally {
        if (live) setAiBusy(false)
      }
    }, AI_PAUSE_MS)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [open, aiOn, f.title, ctx])

  const errors = submitted ? openItemErrors(f, today) : {}
  const set = (patch: Partial<OpenItemInput>) => setF((p) => ({ ...p, ...patch }))
  const apply = (x: Found | null, fromAi = false) => {
    if (!x) return
    applied.current.add(x.title)
    setF((p0) => {
      // a new title: the AI's icon pick for the old one goes (withTitle)
      const p = withTitle(p0, x.title)
      // the AI's category is a reading of the words; the phone's only a keyword guess, so a picked one stays
      const category = fromAi ? (x.category ?? p.category) : (p.category ?? x.category)
      const next: OpenItemInput = {
        ...p,
        amount: x.amount ?? p.amount,
        date: x.date ?? p.date,
        suspects: x.suspects?.length ? [...new Set([...(p.suspects ?? []), ...x.suspects])] : p.suspects,
      }
      return category && category !== p.category ? withCategory(next, category) : next
    })
    setFound(null)
    setAiFound(null)
  }
  const toggleSuspect = (id: MemberId) =>
    setF((p) => {
      const now = new Set(p.suspects ?? [])
      if (now.has(id)) now.delete(id)
      else now.add(id)
      return { ...p, suspects: [...now] }
    })

  const save = async () => {
    setSubmitted(true)
    if (Object.keys(openItemErrors(f, today)).length) return
    try {
      const now = Date.now()
      const vault = !!group.vault
      const next = item ? editOpenItem(item, f, now, { vault }) : newOpenItem(f, { id: uid('o_'), groupId: group.id, uid: user.uid, now, vault })
      await repo.saveOpenItem(next)
      toast(item ? 'Open item updated' : 'Added to open items')
      onSaved?.(next, !item)
      onClose()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }

  // The category follows the words until one is picked (newOpenItem guesses the same way on save).
  const category = sheetCategory(f)
  const emoji = sheetEmoji(f)
  const altsShown = itemAltsOffered(aiPick, f, pickingIcon)
  const bits = (x: Found | null) =>
    x
      ? [
          x.amount !== undefined ? formatMoney(x.amount, group.currency) : '',
          x.date ? formatDate(x.date, 'day') : '',
          ...(x.suspects ?? []).map((id) => (id === me ? 'you paid' : `${labelOf(group.members, id, '', me)} paid`)),
        ].filter(Boolean)
      : []
  const foundBits = bits(found)
  // Only an AI reading of what's in the box now, and not one that says the same as the phone's.
  const aiShown =
    aiFound && aiFound.line === f.title.trim() && !(found && JSON.stringify({ ...found, line: '' }) === JSON.stringify({ ...aiFound, line: '' }))
      ? aiFound
      : null

  return (
    <>
      <Sheet open={open} onClose={onClose} title={item ? 'Edit open item' : 'New open item'} testId="open-item-sheet">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            // React events bubble through the portal: opened from the expense form, this submit must not save the expense too.
            e.stopPropagation()
            void save()
          }}
        >
          {!item && <HintText hint={NEW_ITEM_HINT} className="text-muted -mt-1 mb-3 text-sm" />}
          <label htmlFor="open-item-title" className="label">
            What was it?
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIconOpen(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
              style={{ background: CATEGORIES[category].color + '22' }}
              aria-label={`Icon: ${f.iconSvg || f.iconImage ? 'a drawn one' : emoji}. Change`}
              aria-haspopup="dialog"
              data-testid="open-item-icon"
            >
              <span aria-hidden>
                <IconFace iconSvg={f.iconSvg} iconImage={f.iconImage} emoji={emoji} vault={!!group.vault} />
              </span>
            </button>
            <input
              id="open-item-title"
              className="input flex-1"
              placeholder="lunch 290 2nd Oct Cafe Blue"
              value={f.title}
              maxLength={TITLE_MAX + 40}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => {
                const title = e.target.value
                setF((p) => withTitle(p, title))
              }}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'open-item-title-err' : undefined}
              data-testid="open-item-title"
            />
          </div>
          {errors.title && (
            <p id="open-item-title-err" role="alert" className="neg mt-1 text-sm">
              {errors.title}
            </p>
          )}
          {pickingIcon && (
            <p className="text-muted mt-1 flex items-center gap-1.5 px-1 text-xs" role="status" data-testid="open-item-icon-picking">
              <Loader2 size={12} className="animate-spin" aria-hidden /> Picking an icon for “{f.title.trim()}”…
            </p>
          )}
          {altsShown.length > 0 && (
            <div className="mt-1">
              <SuggestionRow>
                {altsShown.map((alt) => (
                  <SuggestionPill
                    key={alt}
                    testId="open-item-icon-alt"
                    dismissLabel={`Dismiss the icon ${alt}`}
                    onDismiss={() => setAiPick((p) => (p ? { ...p, emojis: p.emojis.filter((e) => e !== alt) } : p))}
                    onApply={() => setF((p) => withIcon(p, alt))}
                  >
                    Or{' '}
                    <span aria-hidden className="mx-1">
                      {alt}
                    </span>
                    <span className="sr-only">the icon {alt}</span> · use it
                  </SuggestionPill>
                ))}
              </SuggestionRow>
            </div>
          )}
          {found && foundBits.length > 0 && (
            <button
              type="button"
              onClick={() => apply(found)}
              className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-left text-sm dark:bg-brand-500/10"
              data-testid="open-item-found"
            >
              <Sparkles size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">“{found.title}”</span> · {foundBits.join(' · ')}
              </span>
              <span className="shrink-0 font-semibold text-brand-700 dark:text-brand-300">Use these</span>
            </button>
          )}
          {aiShown && (
            <button
              type="button"
              onClick={() => apply(aiShown, true)}
              className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-left text-sm dark:bg-ink-800"
              data-testid="open-item-ai"
            >
              <Wand2 size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="text-muted mr-1 text-xs font-semibold uppercase tracking-wide">AI</span>
                <span className="font-semibold">“{aiShown.title}”</span>
                {bits(aiShown).length > 0 && <> · {bits(aiShown).join(' · ')}</>}
                {aiShown.category && <> · {CATEGORIES[aiShown.category].emoji}</>}
              </span>
              <span className="shrink-0 font-semibold text-brand-700 dark:text-brand-300">Use these</span>
            </button>
          )}
          {aiBusy && !aiShown && (
            <p className="text-muted mt-2 flex items-center gap-1.5 text-xs" role="status">
              <Wand2 size={13} className="animate-pulse" aria-hidden /> Reading with AI…
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label htmlFor="open-item-amount" className="label">
                Amount <span className="text-muted font-normal">(if known)</span>
              </label>
              <MoneyInput
                id="open-item-amount"
                currency={group.currency}
                value={f.amount}
                onChange={(amount) => set({ amount })}
                placeholder="Not sure"
                aria-invalid={!!errors.amount}
                data-testid="open-item-amount"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="open-item-date" className="label">
                When
              </label>
              <DateField
                id="open-item-date"
                aria-label="When"
                placeholder="Not sure"
                clearable
                value={f.date ?? ''}
                max={today}
                onChange={(date) => set({ date: date || undefined })}
              />
            </div>
          </div>
          {(errors.amount || errors.date) && (
            <p role="alert" className="neg mt-1 text-sm">
              {errors.amount ?? errors.date}
            </p>
          )}

          {/* The category is its own choice, as on an expense: the icon button above opens every icon. */}
          <span className="label mt-3" id="open-item-category-label">
            Category
          </span>
          <button
            type="button"
            onClick={() => setCatOpen(true)}
            className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-semibold ring-1 ring-slate-200 dark:ring-white/10"
            aria-labelledby="open-item-category-label open-item-category-value"
            aria-haspopup="dialog"
            data-testid="open-item-category"
          >
            <span aria-hidden className="text-lg">
              {CATEGORIES[category].emoji}
            </span>
            <span id="open-item-category-value" className="min-w-0 flex-1">
              {CATEGORIES[category].label}
            </span>
            <span className="text-muted text-xs font-normal">Change</span>
            <ChevronRight size={16} className="text-muted shrink-0" aria-hidden />
          </button>

          <fieldset className="mt-4">
            <legend className="label">
              Who might have paid?
              <InfoTip hint={SUSPECTS_HINT} label="About Who might have paid" />
            </legend>
            <HintText hint={SUSPECTS_HINT} className="text-muted -mt-1 mb-2 text-xs" />
            <div className="flex flex-wrap gap-2">
              {order.map((id) => {
                const m = group.members[id]
                const on = !!f.suspects?.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSuspect(id)}
                    className={`flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium ring-1 ${on ? 'bg-brand-50 font-semibold text-brand-800 ring-brand-500 dark:bg-brand-500/15 dark:text-brand-100' : 'ring-slate-200 dark:ring-white/10'}`}
                  >
                    <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={28} />
                    {id === me ? 'Me' : labelOf(group.members, id, m.name, me)}
                    {on && <span className="sr-only">(selected)</span>}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label htmlFor="open-item-notes" className="label mt-4">
            Notes
          </label>
          <textarea
            id="open-item-notes"
            className="input min-h-16"
            placeholder="Optional, like “the place by the beach”"
            maxLength={NOTES_MAX}
            value={f.notes ?? ''}
            onChange={(e) => set({ notes: e.target.value })}
          />

          {item && (
            <p className="text-muted mt-4 text-center text-xs" data-testid="open-item-added">
              {addedLine(item, item.createdBy === user.uid ? 'you' : labelOf(group.members, authorMember(group, item.createdBy) ?? '', '', me) || undefined, {
                dateTime: formatDateTime,
                date: (ms) => formatDate(ms),
              })}
            </p>
          )}
          <div className={`mt-5 grid gap-2 ${item && onDelete ? 'grid-cols-[auto_1fr]' : 'grid-cols-1'}`}>
            {item && onDelete && (
              <button
                type="button"
                className="btn-secondary text-rose-700 dark:text-rose-400"
                onClick={() => {
                  onClose()
                  onDelete(item)
                }}
                aria-label="Delete open item"
              >
                <Trash2 size={18} aria-hidden />
              </button>
            )}
            <button type="submit" className="btn-primary" data-testid="open-item-save">
              {item ? 'Save' : 'Add open item'}
            </button>
          </div>
        </form>
      </Sheet>
      <CategorySheet
        open={catOpen}
        onClose={() => setCatOpen(false)}
        value={category}
        onPick={(c: Category) => setF((p) => withCategory(p, c))}
        icon={emoji}
        onOpenIcon={() => {
          setCatOpen(false)
          setIconOpen(true)
        }}
      />
      <IconSheet
        open={iconOpen}
        onClose={() => setIconOpen(false)}
        title="Icon"
        value={chosenIcon(f)}
        auto={autoIcon(f)}
        first={categoryIcons(category)}
        onPick={(icon) => setF((p) => withIcon(p, icon))}
        ai={iconAi.suggest ? { kind: 'expense', category: CATEGORIES[category].label } : undefined}
        svgValue={f.iconSvg}
        onPickSvg={(svg) => setF((p) => withIconSvg(p, svg))}
        picture={iconAi.picture}
        pictureCost={iconAi.pictureCost}
        aiWhy={iconAi.why}
        pictureOff={iconAi.pictureWhy}
        imageValue={f.iconImage}
        onPickImage={(image) => setF((p) => withIconImage(p, image))}
        testId="open-item-icon-sheet"
      />
    </>
  )
}
