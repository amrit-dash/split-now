/*
 * Which Gemini API models can transcribe a spoken Quick add line, and how well and how fast.
 * Reads GEMINI_API_KEY from .env.voice.local (gitignored) or the environment; never prints it.
 *
 *   node scripts/voice-probe.mjs                 the built-in clips, spoken by macOS `say`
 *   node scripts/voice-probe.mjs -- --clips dir  your own recordings too (.wav .mp3 .m4a .ogg .webm)
 *
 * Lists the key's models, then sends every clip to each Gemma model and to Flash-Lite with the same
 * prompt, printing what came back, the time taken and the tokens used. Nothing is saved but the
 * synthetic clips (in tmp/voice-probe/).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'

function readKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim()
  if (!existsSync('.env.voice.local')) return ''
  const line = readFileSync('.env.voice.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('GEMINI_API_KEY='))
  return line ? line.slice('GEMINI_API_KEY='.length).trim() : ''
}

/** Lines people would say into Quick add, with what a good transcript must contain. */
const LINES = [
  { text: 'Dinner twelve hundred with Rahul and Priya, I paid', expect: ['1200', 'rahul', 'priya'] },
  { text: 'Cab to the airport four fifty rupees split with Ananya', expect: ['450', 'ananya'] },
  { text: 'Rohan paid eight thousand for the jeep safari in Goa', expect: ['8000', 'rohan', 'goa'] },
  { text: 'Groceries six forty in the flat group, split equally', expect: ['640', 'flat'] },
  { text: 'Make me a sandwich', expect: ['sandwich'] },
]

const MIME = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mp3',
  '.m4a': 'audio/aac',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
}

function synthClips() {
  const dir = 'tmp/voice-probe'
  mkdirSync(dir, { recursive: true })
  return LINES.map((l, i) => {
    const aiff = join(dir, `line-${i + 1}.aiff`)
    const wav = join(dir, `line-${i + 1}.wav`)
    if (!existsSync(wav)) {
      execFileSync('say', ['-o', aiff, l.text])
      execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', aiff, wav])
    }
    return { name: `say ${i + 1}`, file: wav, mime: 'audio/wav', expect: l.expect, said: l.text }
  })
}

function ownClips(dir) {
  return readdirSync(dir)
    .filter((f) => MIME[extname(f).toLowerCase()])
    .map((f) => ({ name: f, file: join(dir, f), mime: MIME[extname(f).toLowerCase()], expect: [], said: '(your recording)' }))
}

const PROMPT =
  'Transcribe this short voice note exactly, in English. Write amounts as digits (twelve hundred = 1200). Names of people in this group: Rahul, Priya, Ananya, Rohan. Groups: Goa Trip, Indiranagar Flat. Reply with the transcript only.'

async function call(key, model, clip) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: clip.mime, data: readFileSync(clip.file).toString('base64') } }] }],
    ...(model.startsWith('gemma') ? {} : { generationConfig: { temperature: 0 } }),
  }
  const t0 = Date.now()
  const res = await fetch(`${ENDPOINT}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  })
  const ms = Date.now() - t0
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, ms, error: `${res.status} ${json?.error?.message?.slice(0, 160) ?? ''}` }
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim()
  return {
    ok: true,
    ms,
    text,
    tokens: json.usageMetadata?.promptTokenCount,
    audioTokens: json.usageMetadata?.promptTokensDetails?.find((d) => d.modality === 'AUDIO')?.tokenCount,
  }
}

const key = readKey()
if (!key) {
  console.error('No key: put GEMINI_API_KEY=... in .env.voice.local (gitignored) and run again.')
  process.exit(1)
}

const list = await fetch(`${ENDPOINT}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } }).then((r) => r.json())
const names = (list.models ?? []).map((m) => m.name.replace('models/', ''))
const gemmas = names.filter((n) => n.startsWith('gemma'))
const lites = names.filter((n) => /^gemini-[\d.]+-flash-lite$/.test(n))
console.log(`Key sees ${names.length} models. Gemma: ${gemmas.join(', ') || 'none'}. Flash-Lite: ${lites.join(', ') || 'none'}.\n`)

const at = process.argv.indexOf('--clips')
const clips = [...synthClips(), ...(at > 0 ? ownClips(process.argv[at + 1]) : [])]

for (const model of [...gemmas, ...lites]) {
  console.log(`== ${model}`)
  let good = 0
  for (const clip of clips) {
    const r = await call(key, model, clip)
    if (!r.ok) {
      console.log(`  ${clip.name}: FAILED ${r.error}`)
      if (/not supported|modality|audio/i.test(r.error)) break
      continue
    }
    const low = r.text.toLowerCase().replace(/,/g, '')
    const hit = clip.expect.every((w) => low.includes(w))
    if (hit) good++
    console.log(`  ${clip.name} ${hit ? 'ok ' : '-- '} ${r.ms} ms, ${r.audioTokens ?? '?'} audio tokens: ${r.text.slice(0, 120)}`)
  }
  console.log(`  ${good}/${clips.filter((c) => c.expect.length).length} built-in lines right\n`)
}
