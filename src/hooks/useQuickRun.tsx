import { useNavigate } from 'react-router-dom'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { createGroup as saveGroup, memberOrder, myMemberId, useAiState } from '@/hooks/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useMerchantMemory } from '@/hooks/useMerchants'
import { useOnline } from '@/hooks/useOnline'
import type { Group } from '@/types'
import type { QuickAiResult } from '../../shared/quick-ai'
import { aiScanEnabled, aiScanPossible, isQuietReason, unavailableText } from '@/lib/ai'
import { errText } from '@/lib/errors'
import { guessGroup } from '@/lib/groupTypes'
import { todayISO, uid } from '@/lib/id'
import { suggestCategory } from '@/lib/merchants'
import type { NlContext, NlParse } from '@/lib/nl-expense'
import type { OpenItemInput } from '@/lib/open-items'
import { pending } from '@/lib/pending'
import { knownPeople } from '@/lib/people'
import { quickAnswerFor } from '@/lib/quick-answer'
import { buildQuickRequest, listNames, newGroupPrefill, noGroupsPrefill, planQuickAi, replanFor, settleUrl } from '@/lib/quick-ai'
import type { GroupInText } from '@/lib/quick-group'
import { quickAiAllowed, quickRoute, quickRouteNoGroups } from '@/lib/quick-route'
import { useChoose, useConfirm } from '@/components/ConfirmSheet'
import { Avatar } from '@/components/Avatar'
import { GroupIcon } from '@/components/GroupIcon'
import { useToast } from '@/components/Toast'

// The parser loads on first use, not with the screen (it is only needed once someone types or talks).
export const loadParser = () => import('@/lib/nl-expense')

/** A Quick add line and where it goes (src/lib/quick-group.ts lineFor). */
export interface QuickLine {
  /** the line as typed or heard */
  text: string
  /** the words left once the group named in it is taken out */
  line: string
  /** the group it goes into; none when there are no groups yet */
  target: Group | undefined
  /** the composer's group (the default) */
  picked: Group | undefined
  /** the line asks for a new group */
  fresh: { name: string; text: string } | null
  named: GroupInText
  /** The person is in `picked` (its page, or picked it): the line goes there unless it names another. */
  sure?: boolean
  /** The person stopped it while it worked (double tap on + after talking): nothing opens. */
  stopped?: () => boolean
}

/** What became of a line: a screen opened, it stayed (cancelled, or a toast said why), or a plain answer to show. */
export type QuickOutcome = { kind: 'left' } | { kind: 'stayed' } | { kind: 'answer'; text: string }

/**
 * Quick add's work, shared by the composer (src/components/QuickAdd.tsx) and holding + to talk
 * (src/components/PlusButton.tsx): read the line on the phone (the grammar in src/lib/nl-expense.ts),
 * or with Quick add with AI when the person turned it on and the line needs it, then open what it
 * asks for: the expense form prefilled, an open item, or New group. Nothing is saved here, except a
 * new group the person confirms. A line it can't act on gets a plain answer (src/lib/quick-answer.ts).
 */
export function useQuickRun({ groups, onLeave, onBusy }: { groups: Group[]; onLeave?: () => void; onBusy: (b: 'ai' | 'read' | null) => void }) {
  const aiFlag = useFlag('aiQuickAdd')
  const openItemsOn = useFlag('openItems')
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const choose = useChoose()
  const memory = useMerchantMemory()
  const online = useOnline()
  const firebase = repo.mode === 'firebase'
  const prefs = useCapturePrefs()
  const aiState = useAiState(firebase)
  const aiStatus = useAiStatus()

  const aiAllowed = quickAiAllowed({
    mode: firebase ? 'firebase' : 'demo',
    flag: aiFlag,
    online,
    prefs,
    status: aiStatus,
    hasOwnKey: !!aiState?.hint,
  })

  const leave = (to: string): QuickOutcome => {
    onLeave?.()
    // When it lives in a sheet, let the sheet close first (CreateSheet explains why).
    if (onLeave) requestAnimationFrame(() => requestAnimationFrame(() => nav(to)))
    else nav(to)
    return { kind: 'left' }
  }

  /** The open item sheet in the group's Open tab, filled in (nothing is saved until the person does). */
  const openOpenItem = (groupId: string, input: OpenItemInput): QuickOutcome => {
    pending.openItem = { groupId, input }
    return leave(`/groups/${encodeURIComponent(groupId)}?tab=open&add=1`)
  }

  /**
   * The line read on the phone (and, when unsure with AI reading on, gaps filled by Gemini's text
   * reader). `settled` is a reading the phone already finished with the person's answers (Which
   * Rahul?, Who paid?): it goes to the form as it is.
   */
  const go = async (q: QuickLine, target: Group, aiUnknown = false, settled?: NlParse): Promise<QuickOutcome> => {
    const t = q.text.trim()
    const order = memberOrder(target)
    const me = myMemberId(target, user.uid) ?? order[0]
    const ctx: NlContext = { members: order.map((id) => ({ id, name: target.members[id].name })), me, currency: target.currency, today: todayISO() }
    const { mergeAiParse, parseNlExpense, toQuickPrefill } = await loadParser()
    let parse = settled ?? parseNlExpense(q.line, ctx)
    let category = parse.description ? suggestCategory(parse.description, { memory }) : null
    // Unsure (no amount, or a name nobody matched): let Gemini have a go when the user allows AI reading.
    if (!settled && parse.confidence !== 'high' && aiScanPossible() && aiScanEnabled()) {
      onBusy('read')
      try {
        const r = await repo.parseTextAi(q.line, { members: ctx.members.map((m) => m.name), currency: target.currency, today: ctx.today! })
        if (r && !r.unavailable && r.expense) {
          const merged = mergeAiParse(parse, r.expense, ctx)
          parse = merged
          category = merged.category ?? (merged.description ? suggestCategory(merged.description, { memory }) : null)
        }
      } catch (e) {
        console.warn('Quick add AI read failed', e)
      } finally {
        onBusy(null)
      }
    }
    // "Make me a sandwich": nothing to add. Say what Quick add can do instead of opening an empty form.
    const answer = quickAnswerFor({ text: t, amount: parse.amount, aiUnknown })
    if (answer) return { kind: 'answer', text: answer }
    pending.quick = { groupId: target.id, prefill: toQuickPrefill(parse, t, category) }
    if (parse.amount === undefined) toast('Couldn’t find an amount in that. Add it in the form.')
    else if (parse.unmatched.length) toast(`Didn’t recognise ${parse.unmatched.join(', ')}. Check who’s in the split.`)
    return leave(`/add?group=${encodeURIComponent(target.id)}&quick=1`)
  }

  /**
   * A new group first: GroupForm opens with the name and the people the line names filled in
   * (matched to people you already know), and once it is made the expense form opens with the line
   * (amount, words and date now; the people read again against the new members by ExpenseForm).
   * Read locally only: the AI reader needs the group's names.
   */
  const createGroup = async (name: string, q: QuickLine): Promise<QuickOutcome> => {
    const t = q.text.trim()
    const qs = new URLSearchParams({ next: 'add' })
    let prefill: ReturnType<typeof newGroupPrefill> = { name, people: [] }
    if (t) {
      const rest = q.fresh ? q.fresh.text : q.line
      const { parseNlExpense, toQuickPrefill } = await loadParser()
      const parse = parseNlExpense(rest, {
        members: [{ id: user.uid, name: profile.displayName }],
        me: user.uid,
        currency: profile.currency,
        today: todayISO(),
      })
      const category = parse.description ? suggestCategory(parse.description, { memory }) : null
      pending.quick = { prefill: toQuickPrefill(parse, t, category), line: rest }
      qs.set('quick', '1')
      const known = knownPeople(groups, user.uid)
      // The first group: named from the line, a 1:1 for one person, else after the people or the cost.
      prefill =
        q.picked || name
          ? newGroupPrefill({ text: t, freshName: name, unmatched: parse.unmatched, known })
          : noGroupsPrefill({ text: t, description: parse.description, unmatched: parse.unmatched, known })
    }
    if (prefill.name) qs.set('name', prefill.name)
    // A 1:1 has no name of its own (it takes the friend's), so the type goes on regardless.
    const type = prefill.type ?? (prefill.name ? guessGroup(prefill.name)?.type : undefined)
    if (type) qs.set('type', type)
    if (prefill.people.length) qs.set('people', prefill.people.join(','))
    return leave(`/groups/new?${qs}`)
  }

  /**
   * Quick add with AI. The outcome when it took the line (opened the form, or the person cancelled
   * the new group and stays); 'unknown' when it found nothing to do; null sends the line down the
   * phone's own path.
   */
  const askAi = async (q: QuickLine): Promise<QuickOutcome | 'unknown' | null> => {
    onBusy('ai')
    try {
      const today = todayISO()
      const r = await repo.quickAddAi(
        buildQuickRequest({
          text: q.text,
          groups,
          uid: user.uid,
          me: profile.displayName,
          target: q.target,
          currency: profile.currency,
          today,
          openItems: openItemsOn,
          sure: q.sure ?? true,
        }),
      )
      // Stopped while AI worked: nothing opens and nothing is said.
      if (q.stopped?.()) return null
      if (!r) {
        toast('Couldn’t work that out right now, so it was read on this phone. Check the form.')
        return null
      }
      if (r.unavailable) {
        if (!isQuietReason(r.reason)) toast(unavailableText(r.reason))
        return null
      }
      if (r.result.action === 'unknown') return 'unknown'
      let result: QuickAiResult = r.result
      const planOf = (res: QuickAiResult) =>
        planQuickAi(res, {
          line: q.text.trim(),
          groups,
          uid: user.uid,
          me: { name: profile.displayName, email: user.email ?? undefined },
          currency: profile.currency,
          today,
          known: knownPeople(groups, user.uid),
          makeId: () => uid('p_'),
        })
      let plan = planOf(result)
      if (plan.kind === 'fallback') return null
      // Not inside a group and the line fits several: the person picks (the best fit first).
      if ((plan.kind === 'expense' || plan.kind === 'payment' || plan.kind === 'openItem') && plan.alsoFits?.length) {
        const first = plan.groupId
        const ids = [first, ...plan.alsoFits]
        const picked = await choose({
          title: 'Which group?',
          message: 'This fits more than one of your groups.',
          options: ids
            .map((id) => groups.find((g) => g.id === id))
            .filter((g): g is Group => !!g)
            .map((g) => ({ value: g.id, label: g.name, sub: groupPeopleLine(g, user.uid), icon: <GroupIcon emoji={g.emoji} group={g} size={28} /> })),
        })
        if (!picked) return { kind: 'stayed' }
        const from = groups.find((g) => g.id === first)
        const to = groups.find((g) => g.id === picked)
        if (to && from && to.id !== from.id) {
          result = replanFor(result, to, from, user.uid)
          plan = planOf(result)
          if (plan.kind === 'fallback') return null
        }
      }
      if (plan.kind === 'payment') return leave(settleUrl(plan.groupId, plan.payment))
      if (plan.kind === 'expense') {
        pending.quick = { groupId: plan.groupId, prefill: plan.prefill }
        return leave(`/add?group=${encodeURIComponent(plan.groupId)}&quick=1`)
      }
      if (plan.kind === 'openItem') return openOpenItem(plan.groupId, plan.input)
      const ok = await confirm({
        title: `Create “${plan.group.name}”?`,
        message: `A new group with ${listNames(['you', ...plan.people])}. Then ${plan.prefill ? 'the expense opens for you to check' : 'Add expense opens in it'}.`,
        confirmLabel: 'Create group',
      })
      if (!ok) return { kind: 'stayed' }
      const id = await saveGroup(plan.group)
      toast('Group created')
      if (plan.prefill) {
        pending.quick = { groupId: id, prefill: plan.prefill }
        return leave(`/add?group=${encodeURIComponent(id)}&quick=1`)
      }
      return leave(`/add?group=${encodeURIComponent(id)}`)
    } catch (e) {
      toast(errText(e), 'err')
      return { kind: 'stayed' }
    } finally {
      onBusy(null)
    }
  }

  const send = async (q: QuickLine): Promise<QuickOutcome> => {
    const out = await work(q)
    return q.stopped?.() && out.kind !== 'left' ? { kind: 'stayed' } : out
  }

  const work = async (q: QuickLine): Promise<QuickOutcome> => {
    const { target, fresh } = q
    // Checked after every wait, so a stop while AI reads the line opens nothing.
    const stop = () => !!q.stopped?.()
    // No groups yet: the line starts one (with AI when it asks for more than a plain line can say).
    if (!target) {
      if (aiAllowed && quickRouteNoGroups(q.text).route === 'ai') {
        const r = await askAi(q)
        if (stop()) return { kind: 'stayed' }
        if (r === 'unknown') {
          const answer = quickAnswerFor({ text: q.text, amount: undefined, aiUnknown: true })
          if (answer) return { kind: 'answer', text: answer }
        } else if (r) return r
      }
      if (stop()) return { kind: 'stayed' }
      return createGroup(fresh?.name ?? '', q)
    }
    // "lunch Oct 2 Cafe Blue, who paid?": nobody's sure yet, so it's an open item, read on the phone
    // (free and instant); subtler wording still reaches Quick add with AI below, which can answer open_item.
    if (openItemsOn && !fresh && target.type !== 'personal') {
      const { isOpenItemLine, openItemFromQuickLine } = await import('@/lib/open-item-line')
      if (stop()) return { kind: 'stayed' }
      if (isOpenItemLine(q.line)) {
        const order = memberOrder(target)
        const me = myMemberId(target, user.uid) ?? order[0]
        return openOpenItem(
          target.id,
          openItemFromQuickLine(q.line, {
            members: order.map((id) => ({ id, name: target.members[id].name })),
            me,
            currency: target.currency,
            today: todayISO(),
          }),
        )
      }
    }
    if (fresh) {
      // "… in a new group Bali trip": AI when the line asks for more than the group and a plain cost.
      if (aiAllowed) {
        const { parseNlExpense } = await loadParser()
        if (stop()) return { kind: 'stayed' }
        const parse = parseNlExpense(fresh.text, { members: [{ id: user.uid, name: profile.displayName }], me: user.uid, currency: profile.currency })
        if (quickRoute(q.text, parse, q.named, true).route === 'ai') {
          const r = await askAi(q)
          if (stop()) return { kind: 'stayed' }
          if (r && r !== 'unknown') return r
        }
      }
      if (stop()) return { kind: 'stayed' }
      return createGroup(fresh.name, q)
    }
    return decide(q, target)
  }

  /**
   * The phone decides first (src/lib/quick-local.ts): the group, a cost or a payment back, who paid.
   * Whatever it can't be sure of it asks (Which group?, Which Rahul?, Who paid?, someone the group
   * doesn't have), and only what it can't read at all goes to Quick add with AI when that's allowed.
   */
  const decide = async (q: QuickLine, target: Group): Promise<QuickOutcome> => {
    const stayed: QuickOutcome = { kind: 'stayed' }
    const { quickLocal, quickNext, swapPerson, leaveOut, withPayer, canAddPeople, newMembersFor } = await import('@/lib/quick-local')
    if (q.stopped?.()) return stayed
    const today = todayISO()
    let all = groups
    const local = (groupId: string, sure: boolean) => quickLocal({ line: q.line, groups: all, uid: user.uid, groupId, sure, today })
    // A line that names a group ("… in Goa trip") is as sure as being on its page.
    let step = local(target.id, (q.sure ?? true) || q.named.kind !== 'none')
    const groupOf = (id: string) => all.find((g) => g.id === id)
    const personOption = (g: Group, id: string) => {
      const m = g.members[id]
      return { value: id, label: m?.name ?? id, icon: m ? <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={28} /> : undefined }
    }
    // Each answer can raise the next question (Which Rahul? then Who paid?); a handful at most.
    for (let round = 0; round < 6; round++) {
      if (q.stopped?.()) return stayed
      switch (step.kind) {
        case 'askGroup': {
          const picked = await choose({
            title: 'Which group?',
            message: 'This fits more than one of your groups.',
            options: step.groupIds
              .map(groupOf)
              .filter((g): g is Group => !!g)
              .map((g) => ({ value: g.id, label: g.name, sub: groupPeopleLine(g, user.uid), icon: <GroupIcon emoji={g.emoji} group={g} size={28} /> })),
          })
          if (!picked) return stayed
          step = local(picked, true)
          continue
        }
        case 'newGroup':
          // Nobody in your groups has them: AI can name the group and set up the cost; else New group opens with them.
          if (aiAllowed) {
            const r = await askAi(q)
            if (q.stopped?.()) return stayed
            if (r && r !== 'unknown') return r
          }
          return createGroup('', q)
        case 'askWho': {
          const g = groupOf(step.groupId)
          if (!g) return stayed
          const picked = await choose({
            title: `Which ${step.token}?`,
            message: `${g.name} has more than one.`,
            options: step.ids.map((id) => personOption(g, id)),
          })
          if (!picked) return stayed
          step = quickNext(q.line, step.groupId, swapPerson(step.parse, step.ids[0], picked))
          continue
        }
        case 'askPayer': {
          const g = groupOf(step.groupId)
          if (!g) return stayed
          const picked = await choose({ title: 'Who paid?', options: step.choices.map((id) => personOption(g, id)) })
          if (!picked) return stayed
          step = quickNext(q.line, step.groupId, withPayer(step.parse, picked))
          continue
        }
        case 'askUnknown': {
          const g = groupOf(step.groupId)
          if (!g) return stayed
          const who = listNames(step.names)
          const canAdd = canAddPeople(g, user.uid)
          const picked = await choose({
            title: `${who} ${step.names.length > 1 ? 'aren’t' : 'isn’t'} in ${g.name}`,
            options: [
              ...(canAdd ? [{ value: 'add', label: `Add ${who} to ${g.name}` }] : []),
              { value: 'out', label: `Leave ${who} out`, sub: 'Split it with the others named' },
            ],
          })
          if (!picked) return stayed
          if (picked === 'out') {
            step = quickNext(q.line, step.groupId, leaveOut(step.parse))
            continue
          }
          const added = newMembersFor(g, step.names, () => uid('p_'))
          try {
            for (const [id, m] of Object.entries(added)) await repo.addMember(g, id, m)
          } catch (e) {
            toast(errText(e), 'err')
            return stayed
          }
          toast(`${who} added to ${g.name}`)
          // Read again with them in (the live list catches up a moment later).
          all = all.map((x) => (x.id === g.id ? { ...x, members: { ...x.members, ...added } } : x))
          step = local(g.id, true)
          continue
        }
        case 'ai': {
          const g = groupOf(step.groupId) ?? target
          if (aiAllowed) {
            const r = await askAi({ ...q, target: g, picked: g, sure: true })
            if (q.stopped?.()) return stayed
            if (r && r !== 'unknown') return r
            if (r === 'unknown') return go(q, g, true)
          } else if (step.why === 'who_paid') {
            // "they paid" with nobody named and no AI: the person says who.
            const picked = await choose({ title: 'Who paid?', options: memberOrder(g).map((id) => personOption(g, id)) })
            if (!picked) return stayed
            step = quickNext(q.line, g.id, withPayer(step.parse, picked))
            continue
          }
          return go(q, g)
        }
        case 'payment':
          return leave(settleUrl(step.groupId, { from: step.from, to: step.to, ...(step.amount !== undefined ? { amount: step.amount } : {}) }))
        case 'openItem':
          return go(q, groupOf(step.groupId) ?? target)
        case 'expense': {
          const g = groupOf(step.groupId) ?? target
          return go({ ...q, picked: g }, g, false, step.parse)
        }
      }
    }
    return go(q, target)
  }

  return { send, createGroup, aiAllowed }
}

/** Under a group in "Which group?": who else is in it ("Rahul, Priya and 2 more"), so two alike tell apart. */
function groupPeopleLine(g: Group, uid: string): string {
  const names = Object.values(g.members)
    .filter((m) => m.uid !== uid && typeof m.removedAt !== 'number')
    .map((m) => m.name.split(' ')[0])
  if (!names.length) return 'Just you'
  return names.length <= 3 ? listNames(names) : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}
