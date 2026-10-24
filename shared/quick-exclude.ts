/*
 * Quick add: people a line leaves out of a cost in plain words, not just "everyone except Rohan".
 * "Aradhana was not a part of that lunch", "Rohan didn't come", "leave Priya out", "without Dev",
 * "Meera skipped it": each names someone and says they weren't in it, in the same clause. Shared by
 * the phone's reader (src/lib/nl-expense.ts) and the check on AI's answer (functions/src/lib/quick-ai.ts),
 * so both read a line the same way. Pure; no Firebase, no DOM.
 */

export interface ExcludePerson {
  id: string
  name: string
}

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’`]/g, "'")
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const word = (w: string) => new RegExp(`(?:^|[^\\p{L}])${esc(w)}(?=$|[^\\p{L}])`, 'u')

/** The words that say someone wasn't in it (when the same clause names them). */
const NOT_IN =
  /\b(?:not|never|wasn't|weren't|isn't|didn't|did not|wasnt|didnt|skipped|skip|left out|leave\s+\S+(?:\s+\S+)?\s+out|leaving\s+\S+(?:\s+\S+)?\s+out|count\s+\S+(?:\s+\S+)?\s+out|excluded|excluding|exclude|except|without|minus|other than|apart from|stayed back|wasn't there|was out|dropped out|sat out|opted out)\b/
/** "Rahul didn't pay": about who paid, not who shared it. */
const ABOUT_PAYING = /\b(?:not|never|didn't|did not|didnt)\s+(?:\w+\s+)?(?:pay|paid|cover|covered)\b/

/**
 * The ids of `people` the line leaves out. Clauses split at punctuation and at "but" /
 * "so" / "where", so "split by all but I remember Aradhana was not a part of it" finds Aradhana in
 * its own clause. A first name counts when exactly one person has it; a full name always does.
 * Only people named in a clause that also says they weren't in it: "Rahul paid, not me" leaves
 * nobody out (the writer isn't in `people`), and "Rahul didn't pay" is about paying.
 */
export function excludedPeople(text: string, people: ExcludePerson[], meId?: string): string[] {
  const t = fold(text)
  const first = (n: string) => fold(n).split(/\s+/)[0]
  const clauses = t.split(/[.;,!?]|\bbut\b|\bso\b|\bwhere\b|\bthough\b|\balthough\b/)
  const out = new Set<string>()
  for (const clause of clauses) {
    if (!NOT_IN.test(clause) || ABOUT_PAYING.test(clause)) continue
    for (const p of people) {
      const full = fold(p.name)
      const f = first(p.name)
      const unique = people.filter((q) => first(q.name) === f).length === 1
      if (word(full).test(clause) || (unique && f.length > 1 && word(f).test(clause))) out.add(p.id)
    }
  }
  // The writer leaving themselves out: "I wasn't there", "I didn't eat", "not for me", "count me out".
  // Never "I didn't pay" (that's who paid), and never "not me" alone ("Rahul paid, not me").
  if (meId && WRITER_OUT.test(t) && !/\b(?:i|me)\s+(?:didn't|did not|didnt|never)\s+(?:\w+\s+)?(?:pay|paid|cover)/.test(t)) out.add(meId)
  return [...out]
}

export const WRITER_OUT =
  /\b(?:i|i'm|im)\s+(?:wasn't|was not|wasnt|am not|'m not|didn't|did not|didnt|never|skipped|stayed back|sat out)\b(?!\s+(?:\w+\s+)?(?:pay|paid|cover|covered|sure|know))|\bnot\s+for\s+me\b|\b(?:count|leave|keep)\s+me\s+out\b|\b(?:except|without|excluding|but not)\s+me\b|\bfor\s+(?:them|the others|everyone else)\s+only\b/
