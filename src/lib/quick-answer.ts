/*
 * Lines Quick add can't act on ("Make me a sandwich", "what's the weather"): instead of opening an
 * empty expense form, a plain answer that says what it can do. Mostly spoken lines reach this
 * (holding + by accident, or asking it something). Pure, tested.
 */

/** What Quick add says to a line it can't act on. */
export const QUICK_ANSWER = 'Quick add can’t do that. It adds expenses, starts groups and notes who might have paid. Try “Dinner 1200 with Rahul, I paid”.'

/** Words that make a line about money or a group, even without an amount. */
const MONEY =
  /\b(paid|pay|payed|split|owe|owes|owed|spent|spend|bill|rent|cost|costs|expense|money|group|trip|rs|rupees?|inr|bucks|dollars?|euros?|lunch|dinner|breakfast|brunch|coffee|tea|snacks?|cab|taxi|uber|ola|auto|fuel|petrol|diesel|groceries|grocery|movie|tickets?|hotel|stay|flight|train|bus|food|drinks?|beer|party|gift|shopping|electricity|wifi|internet|maid|cook|swiggy|zomato|refund|settle)\b/i

/** A request or a question, not a note of something spent. */
const ASK =
  /^(please\s+|hey\s+|ok\s+|okay\s+)?(make|tell|what|what's|whats|who's|how|why|when|where|play|sing|call|open|show|turn|text|remind|set an? (alarm|timer|reminder)|hi|hello|can you|could you|will you|would you|do you|are you|is it|search|find|translate|write|order|book|navigate|take me)\b/i

/** A line that asks something of the app rather than noting a cost (no digits, no money or group words). */
export function offTopicLine(text: string): boolean {
  const t = text.trim()
  if (!t || /\d/.test(t) || MONEY.test(t)) return false
  return ASK.test(t)
}

/**
 * The answer for a line, or null when it should open the form as usual. With an amount it is always
 * an expense. AI that found nothing to do (its "unknown") is believed when the line has no amount;
 * without AI, only lines that read as a request or a question get the answer.
 */
export function quickAnswerFor(o: { text: string; amount: number | undefined; aiUnknown?: boolean }): string | null {
  if (o.amount !== undefined || !o.text.trim()) return null
  if (o.aiUnknown || offTopicLine(o.text)) return QUICK_ANSWER
  return null
}
