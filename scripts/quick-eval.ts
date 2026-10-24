/*
 * Quick add with AI against the real model: every line in src/lib/quick-cases.ts sent the way the
 * app sends it (buildQuickRequest, then the callable's own cleanQuickRequest, quickPrompt and
 * normaliseQuickAi), and what Quick add would then open (planQuickAi) checked against the case.
 * The phone's own reader is checked by quick-cases.test.ts on every CI run; this one costs a few
 * cents a run, so it isn't in CI. Run it after changing the prompt or the schema:
 *
 *   GEMINI_API_KEY=… JITI_ALIAS='{"@/":"./src/"}' npx jiti scripts/quick-eval.ts
 *   … -- --model gemini-3.5-flash-lite --only "they paid"               (one model, lines containing the words)
 *
 * The key comes from the environment and is never printed. Lines the phone asks the person about
 * (Which Rahul?, someone the group doesn't have) pass when the AI's guess is one of the answers.
 */
import { CASE_GROUPS, CASE_UID, QUICK_CASES, type QuickExpect } from '../src/lib/quick-cases'
import { buildQuickRequest, planQuickAi, type QuickAiPlan } from '../src/lib/quick-ai'
import { cleanQuickRequest, normaliseQuickAi, QUICK_SCHEMA, quickPrompt } from '../functions/src/lib/quick-ai'
import { generateJson } from '../functions/src/lib/gemini'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const model = arg('model') ?? 'gemini-3.5-flash-lite'
const only = arg('only')
const key = process.env.GEMINI_API_KEY?.trim()
if (!key) {
  console.error('Set GEMINI_API_KEY (it is never printed).')
  process.exit(2)
}

const TODAY = '2026-10-23'
const meIn = (gid: string) => Object.entries(CASE_GROUPS.find((g) => g.id === gid)?.members ?? {}).find(([, m]) => m.uid === CASE_UID)?.[0] ?? ''
const idIn = (gid: string, id: string) => (id === 'me' ? meIn(gid) : id)
const same = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join()

/** Why the plan doesn't match the case, or null when it does. */
function miss(plan: QuickAiPlan, want: QuickExpect): string | null {
  const got = plan.kind === 'expense' ? `expense in ${plan.groupId}` : plan.kind === 'payment' ? `payment in ${plan.groupId}` : plan.kind
  switch (want.kind) {
    case 'ai':
      return plan.kind === 'fallback' ? 'fell back to the phone' : null
    case 'askUnknown':
      return null
    case 'newGroup':
      return plan.kind === 'create' ? null : `wanted a new group, got ${got}`
    case 'openItem':
      return plan.kind === 'openItem' && plan.groupId === want.group ? null : `wanted an open item in ${want.group}, got ${got}`
    case 'askGroup': {
      if (plan.kind !== 'expense' && plan.kind !== 'payment' && plan.kind !== 'openItem') return `wanted Which group?, got ${got}`
      const fits = [plan.groupId, ...(plan.alsoFits ?? [])]
      return same(fits, want.groups) ? null : `wanted a choice of ${want.groups.join(', ')}, got ${fits.join(', ')}`
    }
    case 'payment': {
      if (plan.kind !== 'payment') return `wanted a payment, got ${got}`
      const g = want.group
      if (plan.groupId !== g) return `wanted ${g}, got ${plan.groupId}`
      if (plan.payment.from !== idIn(g, want.from) || plan.payment.to !== idIn(g, want.to)) return `wrong way: ${plan.payment.from} → ${plan.payment.to}`
      return want.amount !== undefined && plan.payment.amount !== want.amount ? `amount ${plan.payment.amount}` : null
    }
    case 'askWho':
      // The phone asks "Which Rahul?" first; any answer naming one of them is a fair guess.
      if (plan.kind === 'payment') return [plan.payment.from, plan.payment.to].some((id) => want.ids.includes(id)) ? null : 'paid neither of them'
      if (plan.kind !== 'expense') return `wanted an expense, got ${got}`
      return [plan.prefill.payer, ...(plan.prefill.participants ?? [])].some((id) => want.ids.includes(id)) ? null : 'named neither of them'
    case 'askPayer':
    case 'expense': {
      if (plan.kind !== 'expense') return `wanted an expense, got ${got}`
      const g = want.group
      if (plan.groupId !== g) return `wanted ${g}, got ${plan.groupId}`
      const p = plan.prefill
      if (want.kind === 'askPayer')
        return want.choices.map((c) => idIn(g, c)).includes(p.payer) ? null : `payer ${p.payer} isn't one of ${want.choices.join(', ')}`
      if (want.amount !== undefined && p.amount !== want.amount) return `amount ${p.amount}`
      if (want.payer !== undefined && p.payer !== idIn(g, want.payer)) return `payer ${p.payer}`
      // no list is the whole group
      const sharers = p.participants?.length ? p.participants : Object.keys(CASE_GROUPS.find((x) => x.id === g)?.members ?? {})
      if (
        Array.isArray(want.sharers) &&
        !same(
          sharers,
          want.sharers.map((s) => idIn(g, s)),
        )
      )
        return `sharers ${sharers.join(', ')}`
      if (want.exact) {
        const exact = Object.fromEntries(Object.entries(want.exact).map(([k, v]) => [idIn(g, k), v]))
        if (JSON.stringify(Object.entries(p.exact ?? {}).sort()) !== JSON.stringify(Object.entries(exact).sort()))
          return `parts ${JSON.stringify(p.exact ?? {})}`
      }
      return null
    }
  }
}

let pass = 0
let fail = 0
let tokens = 0
for (const c of QUICK_CASES.filter((x) => !only || x.line.includes(only))) {
  const home = c.from === 'home'
  const target = CASE_GROUPS.find((g) => g.id === (home ? 'g_goa' : c.from))
  const sent = buildQuickRequest({ text: c.line, groups: CASE_GROUPS, uid: CASE_UID, me: 'Asha', target, today: TODAY, openItems: true, sure: !home })
  const req = cleanQuickRequest(sent, TODAY, () => true)
  if (!req) {
    console.log(`✗ ${c.line}: the callable would refuse the request`)
    fail++
    continue
  }
  const t0 = Date.now()
  try {
    const g = await generateJson(key, [{ text: `<line>${req.text}</line>` }], QUICK_SCHEMA, {
      models: [model],
      maxOutputTokens: 1024,
      systemInstruction: quickPrompt(req),
    })
    tokens += (g.usage?.promptTokens ?? 0) + (g.usage?.outputTokens ?? 0) + (g.usage?.thoughtTokens ?? 0)
    const plan = planQuickAi(normaliseQuickAi(g.json, req), {
      line: c.line,
      groups: CASE_GROUPS,
      uid: CASE_UID,
      me: { name: 'Asha' },
      currency: 'INR',
      today: TODAY,
      known: [],
      makeId: () => 'p_new',
    })
    const why = miss(plan, c.expect)
    if (why) fail++
    else pass++
    console.log(`${why ? '✗' : '✓'} [${c.from}] ${c.line}${why ? `: ${why}` : ''} (${Date.now() - t0} ms)`)
  } catch (e) {
    fail++
    console.log(`✗ [${c.from}] ${c.line}: ${(e as Error).message.slice(0, 160)}`)
  }
}
console.log(`\n${model}: ${pass} of ${pass + fail} as expected, ${tokens} tokens`)
