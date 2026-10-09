/*
 * Quick add, which group: a line can name where it goes ("dinner 1200 in Goa trip", "cab 300
 * for flat", "@Goa") or ask for a group that doesn't exist yet ("in a new group Bali trip").
 * These read that part of the line, so the panel can switch its target (or offer to create the
 * group) and the expense parser (src/lib/nl-expense.ts) never sees those words. Pure and small:
 * the Create sheet loads it up front, unlike the parser, which waits for the first keystroke.
 */

export interface NamedGroup {
  id: string
  name: string
}

export type GroupInText =
  | { kind: 'none' }
  /** one group fits best; `text` is the line without the words that named it */
  | { kind: 'match'; id: string; text: string; phrase: string }
  /** two or more groups fit equally well: ask which */
  | { kind: 'ambiguous'; ids: string[]; text: string; phrase: string }
  /** "in a new group Bali trip": `name` may be '' when no name followed */
  | { kind: 'new'; name: string; text: string; phrase: string }

interface Token {
  word: string
  raw: string
  start: number
  end: number
  /** written as "@goa" */
  at: boolean
}

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

/** Words (letters and digits, with inner apostrophes and hyphens), each with where it sits in the line. */
function tokenize(text: string): Token[] {
  const out: Token[] = []
  for (const m of text.matchAll(/@?[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)) {
    const at = m[0].startsWith('@')
    const raw = at ? m[0].slice(1) : m[0]
    out.push({ word: fold(raw).replace(/['’]/g, ''), raw, start: m.index, end: m.index + m[0].length, at })
  }
  return out
}

/** The name words of a group, folded: emoji and punctuation drop out. */
const nameWords = (name: string) =>
  fold(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** Two neighbouring tokens belong to one phrase only when nothing but spaces sits between them. */
const joined = (text: string, a: Token, b: Token) => /^\s+$/.test(text.slice(a.end, b.start))

const STRONG = new Set(['in', 'into'])
const WEAK = new Set(['for'])
const FILLER = new Set(['the', 'our', 'my', 'group', 'grp'])
const NOT_A_GROUP = new Set(['me', 'myself', 'i', 'us', 'all', 'everyone', 'everybody', 'it', 'this', 'that', 'a', 'an', 'new'])
/** Words that end a new group's name ("in a new group Bali trip with Rahul, I paid"). */
const NAME_STOP = new Set([
  'with',
  'w',
  'paid',
  'payed',
  'pay',
  'i',
  'me',
  'for',
  'split',
  'only',
  'just',
  'yesterday',
  'today',
  'tomorrow',
  'and',
  'by',
  'including',
  'incl',
  'between',
  'among',
  'everyone',
  'on',
  'at',
  'kal',
  'aaj',
])
const MAX_NAME_WORDS = 4

const tidy = (s: string) =>
  s
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
const without = (text: string, start: number, end: number) => tidy(`${text.slice(0, start)} ${text.slice(end)}`)

/** A typed word against a word of a group's name: the whole word, or a prefix of 3+ letters. */
const fits = (typed: string, word: string) => typed === word || (typed.length >= 3 && word.startsWith(typed))

/**
 * How well the words from `from` on name `group`: the longest run of them that matches a run of
 * the name's words, scored so more words, exact words, a match from the first word and the
 * whole name all count. 0 = no match.
 */
function score(tokens: Token[], from: number, text: string, group: string[]): { score: number; used: number } {
  let best = { score: 0, used: 0 }
  for (let j = 0; j < group.length; j++) {
    let k = 0
    let exact = 0
    while (from + k < tokens.length && j + k < group.length && (k === 0 || joined(text, tokens[from + k - 1], tokens[from + k]))) {
      const w = tokens[from + k].word
      if (!fits(w, group[j + k])) break
      if (w === group[j + k]) exact++
      k++
    }
    if (!k) continue
    const s = k * 10 + exact * 2 + (j === 0 ? 1 : 0) + (j === 0 && k === group.length ? 4 : 0)
    if (s > best.score) best = { score: s, used: k }
  }
  return best
}

/** "new group Bali trip" / "in a new group called Bali": the marker's span and the name after it. */
function findNewGroup(text: string, tokens: Token[]): GroupInText | null {
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i].word !== 'new' || !/^(?:group|grp)$/.test(tokens[i + 1].word) || !joined(text, tokens[i], tokens[i + 1])) continue
    let first = i
    // "in a new group", "into the new group": the lead-in goes too.
    if (first > 0 && /^(?:a|the)$/.test(tokens[first - 1].word) && joined(text, tokens[first - 1], tokens[first])) first--
    if (first > 0 && /^(?:in|into|for|to)$/.test(tokens[first - 1].word) && joined(text, tokens[first - 1], tokens[first])) first--
    let n = i + 2
    if (n < tokens.length && /^(?:called|named)$/.test(tokens[n].word) && joined(text, tokens[n - 1], tokens[n])) n++
    const name: Token[] = []
    while (
      n < tokens.length &&
      name.length < MAX_NAME_WORDS &&
      joined(text, tokens[n - 1], tokens[n]) &&
      !NAME_STOP.has(tokens[n].word) &&
      !/\d/.test(tokens[n].word)
    ) {
      name.push(tokens[n])
      n++
    }
    const start = tokens[first].start
    const end = (name.at(-1) ?? tokens[Math.min(n, tokens.length) - 1]).end
    const typed = name.map((t) => t.raw).join(' ')
    return {
      kind: 'new',
      name: typed ? typed[0].toUpperCase() + typed.slice(1) : '',
      text: without(text, start, end),
      phrase: fold(text.slice(start, end)),
    }
  }
  return null
}

/**
 * Which of `groups` the line names, if any. A group is named after "in", "into" or "for" (with an
 * optional "the"/"our"/"my"/"group" in between), or as "@name": whole words, case-insensitive,
 * any word of the name, and a word may be cut short to 3+ letters ("in goa" → "Goa trip").
 * "for" also introduces people ("for Rahul"), so it never names a group when the word is one of
 * `people` (the picked group's members) or "me"/"everyone". Two groups that fit equally well
 * are ambiguous. An explicit "new group …" wins over any match.
 */
export function groupInText(text: string, groups: NamedGroup[], people: string[] = []): GroupInText {
  const tokens = tokenize(text)
  const fresh = findNewGroup(text, tokens)
  if (fresh) return fresh
  const named = groups.map((g) => ({ id: g.id, words: nameWords(g.name) })).filter((g) => g.words.length)
  const personWords = new Set(people.flatMap(nameWords))
  let best: { score: number; ids: string[]; start: number; end: number } | null = null
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    let from = i
    if (t.at) from = i
    else if (STRONG.has(t.word) || WEAK.has(t.word)) {
      from = i + 1
      while (from < tokens.length && FILLER.has(tokens[from].word) && joined(text, tokens[from - 1], tokens[from])) from++
      if (from >= tokens.length || !joined(text, tokens[from - 1], tokens[from])) continue
      if (WEAK.has(t.word) && [...personWords].some((p) => fits(tokens[from].word, p))) continue
    } else continue
    if (NOT_A_GROUP.has(tokens[from].word)) continue
    for (const g of named) {
      const s = score(tokens, from, text, g.words)
      if (!s.score) continue
      let last = from + s.used - 1
      // "in the Goa trip group": the trailing "group" goes too.
      if (last + 1 < tokens.length && /^(?:group|grp)$/.test(tokens[last + 1].word) && joined(text, tokens[last], tokens[last + 1])) last++
      const span = { start: t.start, end: tokens[last].end }
      if (!best || s.score > best.score) best = { score: s.score, ids: [g.id], ...span }
      else if (s.score === best.score && span.start === best.start && !best.ids.includes(g.id)) {
        best.ids.push(g.id)
        best.end = Math.max(best.end, span.end)
      }
    }
  }
  if (!best) return { kind: 'none' }
  const rest = without(text, best.start, best.end)
  const phrase = fold(text.slice(best.start, best.end))
  return best.ids.length > 1 ? { kind: 'ambiguous', ids: best.ids, text: rest, phrase } : { kind: 'match', id: best.ids[0], text: rest, phrase }
}
