/** The first emoji in free text ("🎸 band" → "🎸"), for the picker's "type any emoji" field. */
export function firstEmoji(text: string): string | null {
  const parts =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment)
      : [...text]
  return parts.find((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g)) ?? null
}
