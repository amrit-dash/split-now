import { useEffect, useState } from 'react'
import { Moon, Sun, SunMoon } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { CURRENCIES } from '@/lib/money'
import { errText } from '@/lib/errors'
import { getRate } from '@/lib/fx'
import { todayISO } from '@/lib/id'
import { type ApprovalDefault, approvalDefaultInCurrency, approvalDefaultOf } from '@/lib/approval'
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

/** /settings/preferences: default currency (with the rates refresh), big-expense approval, theme and accent. All autosave. */
export default function Preferences() {
  const { profile } = useMe()
  const toast = useToast()
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [currencySaved, flashCurrency] = useSavedFlash()
  const [approvalSaved, flashApproval] = useSavedFlash()
  const [lookSaved, flashLook] = useSavedFlash()
  const approval = approvalDefaultOf(profile.approvalDefault, profile.currency)
  // The "Above" field's own value while typing; saved when it loses focus.
  const [amount, setAmount] = useState<number | undefined>(approval.amount)
  const [amountError, setAmountError] = useState('')
  useEffect(() => {
    setAmount(approval.amount)
    setAmountError('')
  }, [approval.amount])

  const setCurrency = async (currency: string) => {
    if (currency === profile.currency) return
    try {
      // A stored approval amount follows the currency (₹2,000 → about $20), rounded to a nice figure.
      const stored = profile.approvalDefault
      const rate = stored && stored.currency !== currency ? await getRate(stored.currency, currency, todayISO()) : null
      const approvalDefault = stored ? approvalDefaultInCurrency(stored, currency, rate?.rate) : undefined
      await repo.saveProfile({ ...profile, currency, ...(approvalDefault ? { approvalDefault } : {}) })
      flashCurrency()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }

  const saveApproval = async (next: ApprovalDefault) => {
    try {
      await repo.saveProfile({ ...profile, approvalDefault: next })
      flashApproval()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }
  const saveAmount = () => {
    if (amount === undefined || !(amount > 0)) return setAmountError('Enter an amount above zero')
    if (amount !== approval.amount) void saveApproval({ ...approval, amount })
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Ask for approval on big expenses</div>
            <div className="text-muted text-xs">New groups you create start with Needs your OK turned on. Each group keeps its own setting.</div>
          </div>
          <Switch
            checked={approval.on}
            onChange={(on) => void saveApproval({ ...approval, on })}
            label="Ask for approval on big expenses"
            testId="pref-approval"
          />
        </div>
        {approval.on && (
          <div className="mt-3">
            <label className="label" htmlFor="pref-approval-amount">
              Above
            </label>
            <MoneyInput
              id="pref-approval-amount"
              value={amount}
              currency={approval.currency}
              onChange={(v) => {
                setAmount(v)
                setAmountError('')
              }}
              onBlur={saveAmount}
              aria-invalid={!!amountError}
              aria-describedby={amountError ? 'pref-approval-amount-error' : undefined}
              data-testid="pref-approval-amount"
            />
            {amountError && (
              <p id="pref-approval-amount-error" role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-400">
                {amountError}
              </p>
            )}
            <p className="text-muted mt-2 text-xs">Changing your default currency converts this amount.</p>
          </div>
        )}
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
