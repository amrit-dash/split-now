import { describe, expect, it } from 'vitest'
import { fillMacroTemplate, macroFilename } from './sms-macro'

describe('fillMacroTemplate', () => {
  const tpl = '{"name":"Split Now SMS","actions":[{"url":"{{URL}}","body":"{\\"token\\":\\"{{TOKEN}}\\",\\"text\\":\\"[sms_message]\\"}"}]}'
  it('fills the key and the URL everywhere and keeps valid JSON', () => {
    const out = fillMacroTemplate(tpl, { token: 'abc123', url: 'https://x.app/api/capture' })!
    expect(out).toContain('abc123')
    expect(out).not.toContain('{{')
    const parsed = JSON.parse(out) as { actions: Array<{ url: string; body: string }> }
    expect(parsed.actions[0].url).toBe('https://x.app/api/capture')
    expect(JSON.parse(parsed.actions[0].body).token).toBe('abc123')
  })
  it('escapes values that would break the JSON', () => {
    const out = fillMacroTemplate('{"t":"PASTE_KEY"}', { token: 'a"b', url: '' })!
    expect(JSON.parse(out).t).toBe('a"b')
  })
  it('refuses a template without a token placeholder', () => {
    expect(fillMacroTemplate('{"token":"real-key-left-in"}', { token: 'x', url: 'y' })).toBeNull()
  })
})

describe('macroFilename', () => {
  it('is a plain .macro name', () => {
    expect(macroFilename('Split Now')).toBe('Split-Now-SMS.macro')
  })
})
