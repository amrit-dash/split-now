/*
 * AI suggestions in the group chat (optional, off by default per device, behind the admin flag
 * `chatAi`): when the phone's own word rules (src/lib/chat-tools.ts suggestTool) find no tool in a
 * line, the app may ask the AI which tool it reads like. The server answers in names (never ids);
 * the app maps them back to members. Pure: shared by the app and functions/src/ai.ts.
 */

export const CHAT_AI_TOOLS = ['settle', 'pay', 'expense', 'open', 'balances', 'none'] as const
export type ChatAiTool = (typeof CHAT_AI_TOOLS)[number]

/** What the AI read: a tool, the amount in hundredths of the group currency, and the names it asks. */
export interface ChatAiIntent {
  tool: ChatAiTool
  /** hundredths (paise, cents) of the group currency, when the line names one */
  amount?: number
  /** names from the list the app sent (people the line asks); absent = everyone */
  to?: string[]
}

export const CHAT_AI_MAX_TEXT = 300
export const CHAT_AI_MAX_NAMES = 60

/**
 * The model's raw JSON → a safe intent: a known tool (one the app offered), a positive whole
 * amount under 1e11, names only from the list sent (matched without case), at most 20.
 */
export function normaliseChatIntent(raw: unknown, names: string[], tools: readonly string[]): ChatAiIntent {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const tool =
    typeof r.tool === 'string' && (CHAT_AI_TOOLS as readonly string[]).includes(r.tool) && (r.tool === 'none' || tools.includes(r.tool))
      ? (r.tool as ChatAiTool)
      : 'none'
  if (tool === 'none') return { tool }
  const out: ChatAiIntent = { tool }
  const amount = typeof r.amount === 'number' && Number.isFinite(r.amount) ? Math.round(r.amount * 100) : 0
  if ((tool === 'pay' || tool === 'expense') && amount > 0 && amount <= 100_000_000_000) out.amount = amount
  if ((tool === 'pay' || tool === 'settle') && Array.isArray(r.to)) {
    const byLower = new Map(names.map((n) => [n.toLowerCase(), n]))
    const to = [...new Set(r.to.filter((x): x is string => typeof x === 'string').map((x) => byLower.get(x.trim().toLowerCase())))].filter(
      (x): x is string => !!x,
    )
    if (to.length) out.to = to.slice(0, 20)
  }
  return out
}
