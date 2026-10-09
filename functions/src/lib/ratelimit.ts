/** rateLimits/{tokenKey}: fixed hourly and daily windows. Server-only (rules deny clients). */
export interface RateState {
  hourStart: number
  hourCount: number
  dayStart: number
  dayCount: number
}

const HOUR = 3_600_000
const DAY = 86_400_000

export function applyRateLimit(prev: Partial<RateState> | undefined, now: number, limits: { perHour: number; perDay: number }): { allowed: boolean; next: RateState } {
  const hourFresh = typeof prev?.hourStart !== 'number' || now - prev.hourStart >= HOUR
  const dayFresh = typeof prev?.dayStart !== 'number' || now - prev.dayStart >= DAY
  const hourCount = hourFresh ? 0 : prev?.hourCount ?? 0
  const dayCount = dayFresh ? 0 : prev?.dayCount ?? 0
  const base = { hourStart: hourFresh ? now : prev!.hourStart!, dayStart: dayFresh ? now : prev!.dayStart! }
  if (hourCount >= limits.perHour || dayCount >= limits.perDay) {
    return { allowed: false, next: { ...base, hourCount, dayCount } }
  }
  return { allowed: true, next: { ...base, hourCount: hourCount + 1, dayCount: dayCount + 1 } }
}
