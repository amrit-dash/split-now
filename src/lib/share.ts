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

/** Hand the browser a text file to save (a filled-in MacroDroid macro, for instance). */
export function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
