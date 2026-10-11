/*
 * Sending email: the code emails (email-code.ts). Split Now sends through a transactional email
 * service an admin connects in Admin → Email: Resend (needs a domain you own) or Brevo (a single
 * verified sender address is enough). The API key is sealed at rest like the Gemini keys
 * (private/mail). Pure: request shapes and the email itself; the fetch is in email-codes.ts.
 */
import type { CodePurpose } from './email-code'

export type MailProvider = 'resend' | 'brevo'
export const MAIL_PROVIDERS: readonly MailProvider[] = ['resend', 'brevo']

export interface MailConfig {
  provider: MailProvider
  /** the sender address, e.g. codes@yourdomain.com (Resend) or the address verified in Brevo */
  fromEmail: string
  /** shown as the sender's name */
  fromName: string
}

export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface MailRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/** The HTTP request each service expects for one email. */
export function mailRequest(cfg: MailConfig, apiKey: string, m: MailMessage): MailRequest {
  if (cfg.provider === 'brevo')
    return {
      url: 'https://api.brevo.com/v3/smtp/email',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: cfg.fromName, email: cfg.fromEmail },
        to: [{ email: m.to }],
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
      }),
    }
  return {
    url: 'https://api.resend.com/emails',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: `${cfg.fromName} <${cfg.fromEmail}>`, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
  }
}

/** A stored config, or undefined when it's missing or incomplete. */
export function parseMailConfig(d: Record<string, unknown> | undefined): MailConfig | undefined {
  const provider = d?.provider
  const fromEmail = typeof d?.fromEmail === 'string' ? d.fromEmail.trim() : ''
  const fromName = typeof d?.fromName === 'string' && d.fromName.trim() ? d.fromName.trim().slice(0, 60) : 'Split Now'
  if (!MAIL_PROVIDERS.includes(provider as MailProvider) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromEmail)) return undefined
  return { provider: provider as MailProvider, fromEmail, fromName }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * The code email, in the app's look: the brand gradient band, the code large and spaced out (and
 * easy to copy), plain words. Tables and inline styles, so mail apps that strip <style> still
 * show it right; a plain-text part for the rest.
 */
export function codeEmail(o: { code: string; purpose: CodePurpose; email: string; name?: string; appUrl: string }): Omit<MailMessage, 'to'> {
  const first = o.name?.trim().split(/\s+/)[0]
  const hello = first ? `Hi ${first},` : 'Hi,'
  const why =
    o.purpose === 'verify'
      ? 'Enter this code in Split Now to confirm your email and finish setting up your account.'
      : `Enter this code in Split Now to add ${o.email} to your account. Groups that add you by this email will then show up for you.`
  const subject = o.purpose === 'verify' ? `${o.code} is your Split Now code` : `${o.code} adds this email to Split Now`
  const spaced = `${o.code.slice(0, 3)} ${o.code.slice(3)}`
  const text = [
    hello,
    '',
    why,
    '',
    `Your code: ${spaced}`,
    '',
    'It works for 10 minutes. If you didn’t ask for it, ignore this email; nothing changes without the code.',
    '',
    `Split Now · ${o.appUrl}`,
  ].join('\n')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f2fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e1b2e;">
<div style="display:none;max-height:0;overflow:hidden;">Your code is ${spaced}. It works for 10 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2fb;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(76,29,149,0.12);">
<tr><td style="background:#7c3aed;background-image:linear-gradient(135deg,#7c3aed,#c026d3);padding:28px 28px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><img src="${esc(o.appUrl)}/pwa-192.png" width="44" height="44" alt="" style="display:block;border-radius:14px;border:0;"></td>
<td style="vertical-align:middle;padding-left:12px;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">Split Now</td>
</tr></table>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
<p style="margin:0 0 12px;font-size:16px;font-weight:600;">${esc(hello)}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#4b4763;">${esc(why)}</p>
<div style="background:#f5f3ff;border:1px solid #e4dcfd;border-radius:18px;padding:20px 12px;text-align:center;">
<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#6d28d9;margin-bottom:8px;">Your code</div>
<div style="font-family:'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:#1e1b2e;">${spaced}</div>
</div>
<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6b6782;">It works for 10 minutes. If you didn’t ask for it, ignore this email; nothing changes without the code.</p>
</td></tr>
<tr><td style="padding:24px 28px 28px;font-size:12px;color:#8e8aa3;">Split bills, not friendships. · <a href="${esc(o.appUrl)}" style="color:#6d28d9;text-decoration:none;">${esc(o.appUrl.replace(/^https?:\/\//, ''))}</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`
  return { subject, html, text }
}
