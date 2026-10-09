export async function shareOrCopy(data: { title?: string; text: string; url?: string }): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share(data)
      return 'shared'
    }
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return 'failed'
  }
  return (await copy([data.text, data.url].filter(Boolean).join(' '))) ? 'copied' : 'failed'
}

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
