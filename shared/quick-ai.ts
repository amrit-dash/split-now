/*
 * Quick add with AI (callable quickAddAi): the contract between the app and Cloud Functions.
 * Types only, plus the group types a new group may get. The server validates Gemini's answer
 * into this shape (functions/src/lib/quick-ai.ts); the app turns it into a prefilled expense
 * form, after a confirm sheet when it creates a group (src/lib/quick-ai.ts). Pure.
 */
import type { AiUnavailableReason } from './ai-config'

/** Group types the model may suggest for a new group (the shared kinds; never 1:1 or personal). */
export const QUICK_GROUP_TYPES = ['trip', 'outing', 'event', 'home', 'couple', 'office', 'other'] as const
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

export type QuickAiResult =
  | { action: 'expense'; group: { existingId: string }; expense: QuickAiExpense }
  | { action: 'group_and_expense'; group: { name: string; type?: QuickGroupType; members: string[] }; expense: QuickAiExpense }
  | { action: 'unknown' }

/** What the callable answers; `unavailable` means no key could be used (see AiUnavailableReason). */
export type QuickAiResponse =
  | { result: QuickAiResult; via?: 'own' | 'app'; model?: string; unavailable?: undefined }
  | { unavailable: true; reason?: AiUnavailableReason }
