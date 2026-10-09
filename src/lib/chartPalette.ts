import { useEffect, useState } from 'react'
import type { Category } from '@/types'

/**
 * Validated categorical palette (CVD-safe in adjacent order, light + dark steps).
 * Charts use these instead of the decorative category colors.
 */
const SLOTS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}
export const OTHER = { light: '#9a9893', dark: '#6b6a64' }

/** Fixed category → slot. Color follows the category, never its rank. Unlisted categories fold into "Other". */
const CATEGORY_SLOT: Partial<Record<Category, number>> = {
  food: 0, stay: 1, transport: 2, groceries: 3, entertainment: 4, rent: 5, travel: 6, utilities: 7,
}

export function categoryChartColor(c: Category | 'other-fold', dark: boolean) {
  const slot = c === 'other-fold' ? undefined : CATEGORY_SLOT[c]
  return slot === undefined ? OTHER[dark ? 'dark' : 'light'] : SLOTS[dark ? 'dark' : 'light'][slot]
}
export const chartFolds = (c: Category) => CATEGORY_SLOT[c] === undefined

export function seriesColor(i: number, dark: boolean) {
  return SLOTS[dark ? 'dark' : 'light'][i]
}

export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}
