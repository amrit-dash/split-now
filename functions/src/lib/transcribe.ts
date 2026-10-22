/*
 * Transcription with AI (callable transcribeAi, and the Test of Split Now's transcription key in
 * aiKey): the calls to Gemini. The rules (which key, what is accepted, the prompt) are shared with
 * the app in shared/transcribe.ts; this file only talks to Google.
 */
import { billingVerdict, type BillingVerdict } from '../../../shared/transcribe'
import { PICTURE_MODELS } from '../../../shared/icon-ai'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Half a second of silence as a 16 kHz mono 16-bit WAV, base64: what the Test sends, so it checks
 * that the model hears audio on this key without anyone recording anything.
 */
export function silentWavBase64(ms = 500): string {
  const rate = 16_000
  const samples = Math.round((rate * ms) / 1000)
  const data = samples * 2
  const b = Buffer.alloc(44 + data)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + data, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20) // PCM
  b.writeUInt16LE(1, 22) // mono
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(data, 40)
  return b.toString('base64')
}

/**
 * Is this key billed? Asks an image model (no free tier) for a couple of words of text, which
 * costs a fraction of a cent on a billed key and is refused with an allowance of 0 on a free one
 * (shared/transcribe.ts billingVerdict). Tries each picture model until one gives an answer that
 * says either way; 'unknown' when none does.
 */
export async function probeBilling(key: string, fetchImpl: typeof fetch = fetch, models: readonly string[] = PICTURE_MODELS): Promise<BillingVerdict> {
  for (const model of models) {
    try {
      const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK.' }] }],
          generationConfig: { responseModalities: ['TEXT'], maxOutputTokens: 8 },
        }),
        signal: AbortSignal.timeout(15_000),
      })
      const body = res.ok ? '' : (await res.text()).slice(0, 2000)
      const v = billingVerdict(res.status, body)
      if (v !== 'unknown') return v
    } catch {
      /* the next model */
    }
  }
  return 'unknown'
}
