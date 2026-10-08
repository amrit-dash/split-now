/*
 * Group budgets: the thresholds the app's budget card and the Cloud Function's push alert
 * agree on, so "80% reached" means the same thing on the bar and in the notification.
 * Pure: no Firebase, no DOM. Amounts are minor units of the group's currency.
 */

export const BUDGET_THRESHOLDS = [80, 100] as const
export type BudgetThreshold = (typeof BUDGET_THRESHOLDS)[number]

/** Spend as a percentage of the budget (0 for no budget). */
export function budgetPercent(spent: number, budget: number): number {
  return budget > 0 && Number.isFinite(spent) ? (Math.max(0, spent) / budget) * 100 : 0
}

/** Thresholds the spend has reached that haven't been announced yet, lowest first. */
export function crossedThresholds(spent: number, budget: number, alerted: readonly number[] = []): BudgetThreshold[] {
  const pct = budgetPercent(spent, budget)
  return BUDGET_THRESHOLDS.filter((t) => pct >= t && !alerted.includes(t))
}

export interface BudgetStatus {
  /** rounded whole percent (may exceed 100) */
  pct: number
  tone: 'ok' | 'near' | 'over'
  /** the highest threshold reached, if any */
  threshold?: BudgetThreshold
  /** "₹1,200 left" / "₹300 over" / "80% of the budget used" */
  label: string
  short: string
}

/** One reading of a budget, for the bar and the Insights card. `fmt` formats minor units. */
export function budgetStatus(spent: number, budget: number, fmt: (minor: number) => string): BudgetStatus {
  const pct = Math.round(budgetPercent(spent, budget))
  const reached = [...BUDGET_THRESHOLDS].reverse().find((t) => budgetPercent(spent, budget) >= t)
  const over = spent > budget
  const label = over ? `${fmt(spent - budget)} over` : `${fmt(budget - spent)} left`
  const short = reached === 100 ? (over ? 'Over budget' : 'Budget reached') : reached === 80 ? `${pct}% of the budget used` : label
  return { pct, tone: over || reached === 100 ? 'over' : reached === 80 ? 'near' : 'ok', threshold: reached, label, short }
}
