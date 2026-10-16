import { useState } from 'react'
import { useAppConfig } from '@/hooks/useAppConfig'
import { refreshAutoLock } from '@/lib/vault-keys'
import { LOCK_CHOICES, type LockPrefs, lockOnLeave, minutesWords, NEVER, readLockPrefs, withGroupMinutes, writeLockPrefs } from '@/lib/vault-lock-prefs'
import { Select } from '@/components/Select'
import { Switch } from '@/components/Switch'

const store = () => (typeof localStorage === 'undefined' ? undefined : localStorage)

/** This device's lock choices, saved and applied to the groups open now. */
function useLockPrefs(): [LockPrefs, (p: LockPrefs) => void] {
  const [prefs, setPrefs] = useState(() => readLockPrefs(store()))
  const save = (p: LockPrefs) => {
    writeLockPrefs(store(), p)
    setPrefs(p)
    refreshAutoLock()
  }
  return [prefs, save]
}

// "After 5 min" … "Only when the app closes": what the setting does, read from the menu alone.
const choices = LOCK_CHOICES.map((m) => ({ value: String(m), label: m === NEVER ? minutesWords(m) : `After ${minutesWords(m)}` }))

/**
 * Settings → Encrypted groups: how long every private group may sit idle before it locks, and
 * whether leaving the app locks them at once. On this device only (src/lib/vault-lock-prefs.ts).
 */
export function AllGroupsLockTime() {
  const admin = useAppConfig().tuning.vaultLockMinutes
  const [prefs, save] = useLockPrefs()
  const value = prefs.minutes === undefined ? '' : String(prefs.minutes)
  return (
    <div className="card space-y-4 p-4" data-testid="vault-lock-time">
      <div className="space-y-2">
        <div>
          <div className="text-sm font-semibold" id="vault-lock-after">
            Auto-lock
          </div>
          <div className="text-muted text-xs">
            {prefs.minutes === NEVER
              ? 'Idle time doesn’t lock them. Closing or restarting the app always does.'
              : 'After this long without a tap, click or scroll.'}{' '}
            On this device.
          </div>
        </div>
        <Select
          aria-label="Auto-lock"
          size="sm"
          value={value}
          onChange={(v) => {
            const { minutes: _m, ...rest } = prefs
            save(v === '' ? rest : { ...rest, minutes: Number(v) })
          }}
          options={[{ value: '', label: `Default (after ${minutesWords(admin)})` }, ...choices]}
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Lock when I leave the app</div>
          <div className="text-muted text-xs">
            {lockOnLeave(prefs)
              ? 'Switching apps or tabs locks them at once.'
              : 'Switching apps or windows keeps them open. Closing or reloading the app always locks them.'}
          </div>
        </div>
        <Switch
          checked={lockOnLeave(prefs)}
          onChange={(on) => {
            const { onLeave: _o, ...rest } = prefs
            save(on ? rest : { ...rest, onLeave: false })
          }}
          label="Lock when I leave the app"
          testId="vault-lock-on-leave"
        />
      </div>
    </div>
  )
}

/** A private group's own idle time on this device (its Private group sheet), or the same as all groups. */
export function GroupLockTime({ groupId }: { groupId: string }) {
  const admin = useAppConfig().tuning.vaultLockMinutes
  const [prefs, save] = useLockPrefs()
  const own = prefs.groups?.[groupId]
  const all = prefs.minutes ?? admin
  return (
    <div className="flex items-center justify-between gap-3" data-testid="vault-group-lock-time">
      <div className="min-w-0">
        <div className="text-sm font-semibold">Auto-lock</div>
        <div className="text-muted text-xs">This group, on this device.</div>
      </div>
      <Select
        aria-label="Lock this group after"
        size="sm"
        value={own === undefined ? '' : String(own)}
        onChange={(v) => save(withGroupMinutes(prefs, groupId, v === '' ? undefined : Number(v)))}
        options={[{ value: '', label: all === NEVER ? 'Same as all (when the app closes)' : `Same as all (after ${minutesWords(all)})` }, ...choices]}
      />
    </div>
  )
}
