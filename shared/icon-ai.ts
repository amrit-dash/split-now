/*
 * "Suggest with AI" in the icon sheet: what the app sends (iconsAi callable, functions/src/lib/icon-ai.ts)
 * and what comes back. Pure, shared by the app and the functions.
 */

export const ICON_TITLE_MAX = 80
export const ICON_EMOJI = 3
export const ICON_SVGS = 3

export interface IconRequest {
  title: string
  /** what the icon is for, which shapes the prompt: an expense or a group */
  kind: 'expense' | 'group'
  /** an expense's category label ("Transport"), as a hint */
  category?: string
}

/** Emoji first (the dependable choice), then drawn icons, each cleaned (shared/svg-icon.ts). */
export interface IconSuggestions {
  emoji: string[]
  svgs: string[]
}

export type IconAiResponse = IconSuggestions | { unavailable: true; reason: string }
