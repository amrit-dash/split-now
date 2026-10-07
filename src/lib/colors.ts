export const MEMBER_COLORS = [
  '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#0ea5e9', '#eab308',
  '#ef4444', '#14b8a6', '#6366f1', '#d946ef', '#84cc16', '#f43f5e',
]

export function colorFor(index: number) {
  return MEMBER_COLORS[index % MEMBER_COLORS.length]
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}
