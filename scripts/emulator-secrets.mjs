// The Functions emulator reads secrets from functions/.secret.local (gitignored). The vault
// callable needs VAULT_KEK to make and open keys, so npm run test:functions gives it a throwaway
// one, for the emulators only. A file someone already has is kept; only a missing line is added.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../functions/.secret.local', import.meta.url)
const now = existsSync(file) ? readFileSync(file, 'utf8') : ''
if (!/^VAULT_KEK=/m.test(now)) {
  const line = `VAULT_KEK=${randomBytes(32).toString('base64')}\n`
  writeFileSync(file, now && !now.endsWith('\n') ? `${now}\n${line}` : now + line)
}
