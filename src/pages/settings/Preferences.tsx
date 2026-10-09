import { useEffect, useState } from 'react'
import { Moon, Sun, SunMoon } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { CURRENCIES } from '@/lib/money'
import { errText } from '@/lib/errors'
import { getRate } from '@/lib/fx'
import { todayISO } from '@/lib/id'
import { type ApprovalDefault, approvalDefaultInCurrency, approvalDefaultOf, defaultEditAutoApprove } from '@/lib/approval'
import type { UserProfile } from '@/types'
import { appLocale } from '@/lib/locale'
import { applyTheme, getTheme, type Theme } from '@/lib/theme'
import { AccentPicker } from '@/components/AccentPicker'
import { Segmented } from '@/components/Misc'
import { RatesField } from '@/components/ProfileCards'
import { Select, currencyOptions } from '@/components/Select'
import { MoneyInput } from '@/components/MoneyInput'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { SectionTitle, SettingsPage, useSavedFlash } from './common'

/** /settings/preferences: default currency (with the rates refresh), big-expense approval and edit auto-approve, theme and accent. All autosave. */
export default function Preferences() {
  const { profile } = useMe()
  const toast = useToast()
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [currencySaved, flashCurrency] = useSavedFlash()
  const [approvalSaved, flashApproval] = useSavedFlash()
  const [lookSaved, flashLook] = useSavedFlash()
  const approval = approvalDefaultOf(profile.approvalDefault, profile.currency)
  const edits = approvalDefaultOf(profile.editAutoApproveDefault, profile.currency, defaultEditAutoApprove)

  const setCurrency = async (currency: string) => {
    if (currency === profile.currency) return
    try {
      // Stored approval amounts follow the currency (₹2,000 → about $20), rounded to a nice figure.
      const rateFrom = async (from: string | undefined) => (from && from !== currency ? ((await getRate(from, currency, todayISO()))?.rate ?? null) : null)
      const a = profile.approvalDefault
      const e = profile.editAutoApproveDefault
      const approvalDefault = a ? approvalDefaultInCurrency(a, currency, await rateFrom(a.currency)) : undefined
      const editAutoApproveDefault = e ? approvalDefaultInCurrency(e, currency, await rateFrom(e.currency), defaultEditAutoApprove) : undefined
      await repo.saveProfile({
        ...profile,
        currency,
        ...(approvalDefault ? { approvalDefault } : {}),
        ...(editAutoApproveDefault ? { editAutoApproveDefault } : {}),
      })
      flashCurrency()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }

  const save = async (patch: Pick<UserProfile, 'approvalDefault'> | Pick<UserProfile, 'editAutoApproveDefault'>) => {
    try {
      await repo.saveProfile({ ...profile, ...patch })
      flashApproval()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }

  return (
    <SettingsPage title="Preferences">
      <SectionTitle saved={currencySaved}>Money</SectionTitle>
      <div className="card p-4">
        <RatesField base={profile.currency}>
          <Select aria-label="Default currency" value={profile.currency} onChange={setCurrency} options={currencyOptions(CURRENCIES, appLocale())} />
        </RatesField>
        <p className="text-muted mt-2 text-xs">Used for new groups and for totals across groups. Each group keeps its own currency.</p>
      </div>

      <SectionTitle saved={approvalSaved}>Big expenses</SectionTitle>
      <div className="card p-4">
        <AmountSetting
          id="pref-approval"
          title="Ask for approval on big expenses"
          hint="In groups you create, a new expense above this amount waits until everyone in it taps Approve (Needs your OK). At or below it counts straight away. Each group keeps its own setting."
          label="Needs an OK above"
          setting={approval}
          onSave={(approvalDefault) => void save({ approvalDefault })}
        />
        {approval.on && (
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/5">
            <AmountSetting
              id="pref-edit-auto"
              title="Approve small edits automatically"
              hint="When someone edits an expense that needs an OK, a change of up to this amount keeps its approvals. A bigger change asks everyone again."
              label="Changes of up to"
              setting={edits}
              onSave={(editAutoApproveDefault) => void save({ editAutoApproveDefault })}
            />
          </div>
        )}
        <p className="text-muted mt-3 text-xs">Changing your default currency converts these amounts.</p>
      </div>

      <SectionTitle saved={lookSaved}>Appearance</SectionTitle>
      <div className="card space-y-4 p-4">
        <div>
          <div className="label" id="theme-label">
            Theme
          </div>
          <Segmented<Theme>
            label="Theme"
            testId="theme"
            value={theme}
            onChange={(t) => {
              setTheme(t)
              applyTheme(t)
              flashLook()
            }}
            options={[
              {
                value: 'system',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <SunMoon size={15} aria-hidden /> Auto
                  </span>
                ),
              },
              {
                value: 'light',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Sun size={15} aria-hidden /> Light
                  </span>
                ),
              },
              {
                value: 'dark',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Moon size={15} aria-hidden /> Dark
                  </span>
                ),
              },
            ]}
          />
        </div>
        <AccentPicker onChange={flashLook} />
        <p className="text-muted text-xs">Theme and accent are kept on this device.</p>
      </div>
    </SettingsPage>
  )
}

/** A switch with an amount under it (shown when on). The amount saves when the field loses focus. */
function AmountSetting({
  id,
  title,
  hint,
  label,
  setting,
  onSave,
}: {
  id: string
  title: string
  hint: string
  label: string
  setting: ApprovalDefault
  onSave: (next: ApprovalDefault) => void
}) {
  const [amount, setAmount] = useState<number | undefined>(setting.amount)
  const [error, setError] = useState('')
  useEffect(() => {
    setAmount(setting.amount)
    setError('')
  }, [setting.amount])
  const saveAmount = () => {
    if (amount === undefined || !(amount > 0)) return setError('Enter an amount above zero')
    if (amount !== setting.amount) onSave({ ...setting, amount })
  }
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-muted text-xs">{hint}</div>
        </div>
        <Switch checked={setting.on} onChange={(on) => onSave({ ...setting, on })} label={title} testId={id} />
      </div>
      {setting.on && (
        <div className="mt-3">
          <label className="label" htmlFor={`${id}-amount`}>
            {label}
          </label>
          <MoneyInput
            id={`${id}-amount`}
            value={amount}
            currency={setting.currency}
            onChange={(v) => {
              setAmount(v)
              setError('')
            }}
            onBlur={saveAmount}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-amount-error` : undefined}
            data-testid={`${id}-amount`}
          />
          {error && (
            <p id={`${id}-amount-error`} role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  )
}
