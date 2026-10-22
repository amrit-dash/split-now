/*
 * Quick add with AI (callable quickAddAi): the contract between the app and Cloud Functions.
 * Types only, plus the group types a new group may get. The server validates Gemini's answer
 * into this shape (functions/src/lib/quick-ai.ts); the app turns it into a prefilled expense
 * form, after a confirm sheet when it creates a group (src/lib/quick-ai.ts). Pure.
 */
import type { AiUnavailableReason } from './ai-config'

/** Group types the model may suggest for a new group (the shared kinds; never 1:1 or personal). */
export const QUICK_GROUP_TYPES = ['trip', 'outing', 'event', 'home', 'family', 'couple', 'office', 'sports', 'other'] as const
export type QuickGroupType = (typeof QUICK_GROUP_TYPES)[number]

/** One group the line could go into, as the app sends it: the caller is left out of `members`. */
export interface QuickAiGroupIn {
  id: string
  name: string
  type?: string
  members: Array<{ id: string; name: string }>
}

export interface QuickAiRequest {
  /** the line as typed or spoken (≤ 300 characters) */
  text: string
  /** the phone's local date, YYYY-MM-DD */
  today: string
  /** the picked group's currency: amounts without a currency are in it */
  currency: string
  /** the caller's display name, so "Asha paid" reads as "me" */
  me: string
  /** the group the line goes into unless it names another (the Quick add picker) */
  groupId?: string
  groups: QuickAiGroupIn[]
  /**
   * The app takes a new group with no expense (action 'group': "create a group for my Bali trip
   * with Rahul and Priya"). Apps from before 3.9 don't send it and never get that action.
   */
  groupOnly?: boolean
  /**
   * The app takes an open item (action 'open_item': "lunch at Cafe Blue on the 2nd, not sure who
   * paid"). Apps without open items don't send it and never get that action.
   */
  openItems?: boolean
}

/**
 * A person in the expense: 'me' (the caller), a member id of the existing group, or for a new
 * group one of `group.members` (a name).
 */
export type QuickAiPerson = string

export interface QuickAiExpense {
  description: string
  /** integer minor units of `currency`; missing when the line gave none */
  amount?: number
  currency: string
  date?: string
  paidBy: QuickAiPerson
  /** 'equal' over `participants` (everyone when missing), or exact minor units per person summing to `amount` */
  split: 'equal' | Record<QuickAiPerson, number>
  participants?: QuickAiPerson[]
}

export interface QuickAiNewGroup {
  name: string
  type?: QuickGroupType
  /** the other people, as the line names them; never the caller */
  members: string[]
}

/** Something spent that nobody is sure about yet (who paid, how much): written down to claim later. */
export interface QuickAiOpenItem {
  title: string
  /** integer minor units of `currency`, when the line gave one */
  amount?: number
  currency: string
  date?: string
  /** who might have paid: 'me' or member ids of the group */
  suspects?: QuickAiPerson[]
}

export type QuickAiResult =
  | { action: 'expense'; group: { existingId: string }; expense: QuickAiExpense }
  | { action: 'open_item'; group: { existingId: string }; item: QuickAiOpenItem }
  | { action: 'group_and_expense'; group: QuickAiNewGroup; expense: QuickAiExpense }
  | { action: 'group'; group: QuickAiNewGroup }
  | { action: 'unknown' }

/** What the callable answers; `unavailable` means no key could be used (see AiUnavailableReason). */
export type QuickAiResponse =
  | { result: QuickAiResult; via?: 'own' | 'app'; model?: string; unavailable?: undefined }
  | { unavailable: true; reason?: AiUnavailableReason }
