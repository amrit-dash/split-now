/*
 * Android: the owner exports a tested MacroDroid macro (.macro, JSON) with placeholders where the
 * capture key and the webhook URL go, hosts it (VITE_ANDROID_MACRO_URL), and the wizard fills
 * those in at download time so the user imports a file that already carries their key. We never
 * generate a macro from scratch: the schema is undocumented and a broken import is worse than
 * the manual steps.
 */

/** Placeholders the hosted template may contain (any of each pair). */
export const MACRO_TOKEN_PLACEHOLDERS = ['{{TOKEN}}', 'PASTE_KEY', 'SPLITNOW_TOKEN'] as const
export const MACRO_URL_PLACEHOLDERS = ['{{URL}}', 'PASTE_URL', 'SPLITNOW_URL'] as const

const escapeJson = (s: string) => JSON.stringify(s).slice(1, -1)

/**
 * Replace every placeholder in the template text. Values are JSON-escaped, since the template is
 * JSON and the key or URL could in theory contain a quote. Returns null when the template has no
 * token placeholder (the wrong file is hosted, or the owner forgot to blank the key).
 */
export function fillMacroTemplate(template: string, values: { token: string; url: string }): string | null {
  if (!MACRO_TOKEN_PLACEHOLDERS.some((p) => template.includes(p))) return null
  let out = template
  for (const p of MACRO_TOKEN_PLACEHOLDERS) out = out.split(p).join(escapeJson(values.token))
  for (const p of MACRO_URL_PLACEHOLDERS) out = out.split(p).join(escapeJson(values.url))
  return out
}

/** File name for the download; MacroDroid imports from any .macro file. */
export const macroFilename = (appName: string) => `${appName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}-SMS.macro`
