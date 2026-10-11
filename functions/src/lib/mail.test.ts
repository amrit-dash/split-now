import { describe, expect, it } from 'vitest'
import { codeEmail, mailRequest, parseMailConfig } from './mail'

const msg = { to: 'priya@x.com', subject: 'S', html: '<p>h</p>', text: 't' }

describe('mail', () => {
  it('Resend: bearer key, "Name <address>" sender', () => {
    const r = mailRequest({ provider: 'resend', fromEmail: 'codes@split.example', fromName: 'Split Now' }, 'key1', msg)
    expect(r.url).toBe('https://api.resend.com/emails')
    expect(r.headers.authorization).toBe('Bearer key1')
    expect(JSON.parse(r.body)).toEqual({ from: 'Split Now <codes@split.example>', to: ['priya@x.com'], subject: 'S', html: '<p>h</p>', text: 't' })
  })
  it('Brevo: api-key header, sender object', () => {
    const r = mailRequest({ provider: 'brevo', fromEmail: 'me@gmail.com', fromName: 'Split Now' }, 'key2', msg)
    expect(r.url).toBe('https://api.brevo.com/v3/smtp/email')
    expect(r.headers['api-key']).toBe('key2')
    expect(JSON.parse(r.body)).toEqual({
      sender: { name: 'Split Now', email: 'me@gmail.com' },
      to: [{ email: 'priya@x.com' }],
      subject: 'S',
      htmlContent: '<p>h</p>',
      textContent: 't',
    })
  })
  it('a config needs a known service and a sender address; the name defaults', () => {
    expect(parseMailConfig({ provider: 'brevo', fromEmail: ' me@gmail.com ' })).toEqual({ provider: 'brevo', fromEmail: 'me@gmail.com', fromName: 'Split Now' })
    expect(parseMailConfig({ provider: 'other', fromEmail: 'me@gmail.com' })).toBeUndefined()
    expect(parseMailConfig({ provider: 'resend', fromEmail: 'nope' })).toBeUndefined()
    expect(parseMailConfig(undefined)).toBeUndefined()
  })
  it('the code email shows the code spaced, greets by first name and escapes it', () => {
    const e = codeEmail({ code: '042137', purpose: 'verify', email: 'priya@x.com', name: 'Priya <b>Shah</b>', appUrl: 'https://split-now.web.app' })
    expect(e.subject).toBe('042137 is your Split Now code')
    expect(e.text).toContain('Your code: 042 137')
    expect(e.text.startsWith('Hi Priya,')).toBe(true)
    expect(e.html).toContain('042 137')
    expect(e.html).not.toContain('<b>Shah')
    expect(e.html).toContain('https://split-now.web.app/pwa-192.png')
  })
  it('adding an email says which address and why', () => {
    const e = codeEmail({ code: '000111', purpose: 'add', email: 'priya@work.com', appUrl: 'https://split-now.web.app' })
    expect(e.subject).toBe('000111 adds this email to Split Now')
    expect(e.text).toContain('add priya@work.com to your account')
    expect(e.text.startsWith('Hi,')).toBe(true)
  })
})
