/*
 * @mentions in the group chat. Typing "@" and a few letters offers the group's people; picking
 * one writes "@Priya" (their label in the group: first name, "Rahul S." on a clash, see names.ts)
 * into the message. When it's sent, the people whose "@label" is in the words are its `mentions`
 * (member ids): they get a push even if they muted the chat, and the words show them highlighted.
 * Reading the mentions from the text (not from what was picked) keeps them right after edits.
 * Pure: the app (src/features/chat) and the chat push (functions/src/chat.ts) share it.
 */

export const MAX_MENTIONS = 20

/** The "@query" being typed just before the caret, or null. "@" must start the text or follow a space. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null
  const query = before.slice(at + 1)
  // A query is a name being typed: no line breaks, at most two words, not too long.
  if (/\n/.test(query) || query.length > 30 || query.split(' ').length > 2) return null
  return { start: at, query }
}

/** The people to offer for a query, best first: labels that start with it, then ones that contain it. */
export function mentionCandidates(labels: Record<string, string>, query: string, exclude?: string, max = 6): Array<{ id: string; label: string }> {
  const q = query.trim().toLowerCase()
  const all = Object.entries(labels)
    .filter(([id]) => id !== exclude)
    .map(([id, label]) => ({ id, label }))
  const starts = all.filter((c) => c.label.toLowerCase().startsWith(q))
  const contains = q ? all.filter((c) => !c.label.toLowerCase().startsWith(q) && c.label.toLowerCase().includes(q)) : []
  return [...starts.sort((a, b) => a.label.localeCompare(b.label)), ...contains].slice(0, max)
}

/** The text with the "@query" at `start..caret` replaced by "@Label ", and where the caret goes. */
export function insertMention(text: string, start: number, caret: number, label: string): { text: string; caret: number } {
  const ins = `@${label} `
  const after = text.slice(caret).replace(/^ /, '')
  return { text: text.slice(0, start) + ins + after, caret: start + ins.length }
}

const boundary = (c: string | undefined) => c === undefined || !/[\p{L}\p{N}]/u.test(c)

/** Where each "@label" sits in the text (longest label wins where two start alike, as "Rahul" and "Rahul S."). */
function findMentions(text: string, labels: Record<string, string>): Array<{ at: number; end: number; id: string }> {
  const byLength = Object.entries(labels)
    .filter(([, l]) => l)
    .sort((a, b) => b[1].length - a[1].length)
  const out: Array<{ at: number; end: number; id: string }> = []
  for (let i = text.indexOf('@'); i >= 0; i = text.indexOf('@', i + 1)) {
    if (i > 0 && !/\s/.test(text[i - 1]!)) continue
    const rest = text.slice(i + 1)
    const hit = byLength.find(([, l]) => rest.toLowerCase().startsWith(l.toLowerCase()) && boundary(rest[l.length]))
    if (hit) {
      out.push({ at: i, end: i + 1 + hit[1].length, id: hit[0] })
      i += hit[1].length
    }
  }
  return out
}

/** The member ids mentioned in a message, once each, at most MAX_MENTIONS. */
export function mentionsIn(text: string, labels: Record<string, string>, exclude?: string): string[] {
  return [...new Set(findMentions(text, labels).map((m) => m.id))].filter((id) => id !== exclude).slice(0, MAX_MENTIONS)
}

/** The text split into plain parts and mentions of the given people (for highlighting). */
export function mentionParts(text: string, labels: Record<string, string>, only?: string[]): Array<{ text: string; mention?: string }> {
  const allowed = only ? Object.fromEntries(Object.entries(labels).filter(([id]) => only.includes(id))) : labels
  const out: Array<{ text: string; mention?: string }> = []
  let at = 0
  for (const m of findMentions(text, allowed)) {
    if (m.at > at) out.push({ text: text.slice(at, m.at) })
    out.push({ text: text.slice(m.at, m.end), mention: m.id })
    at = m.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out.length ? out : [{ text }]
}
