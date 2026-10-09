/**
 * Smoke tests for the demo-mode app (see playwright.config.ts). They catch the "blank screen
 * after deploy" class of failure: sign-in, the seeded groups, the main create flows and the
 * lazy routes. Selectors prefer data-testids and roles over copy, which changes often.
 */
import { expect, test as base, type Page } from '@playwright/test'

/** Every test starts signed in to demo mode, and fails if the page threw an uncaught error. */
const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await signInDemo(page)
    await use(page)
    expect(errors, 'no uncaught page errors').toEqual([])
  },
})

async function signInDemo(page: Page, name = 'Asha') {
  await page.goto('/')
  await page.getByTestId('demo-name').or(page.getByPlaceholder('Your name')).first().fill(name)
  await page
    .getByTestId('demo-start')
    .or(page.getByRole('button', { name: /start exploring|continue/i }))
    .first()
    .click()
  await expect(page.getByTestId('home-greeting')).toBeVisible()
}

/** The expense amount: by label once the form labels it, else the big "0.00" field at the top of the amount card. */
const amountField = (page: Page) => page.getByLabel('Amount', { exact: true }).or(page.getByPlaceholder('0.00')).first()

test('demo sign-in shows Home with a net balance and the seeded groups', async ({ page }) => {
  await expect(page.getByTestId('home-net')).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Groups' }).click()
  await expect(page).toHaveURL(/\/groups$/)
  // The lazy Groups screen can arrive after the URL changes; until then Home (which also names the
  // groups in its quick add and activity) is still on screen, so wait for the Groups heading and
  // then look for each group's own row link.
  await expect(page.getByRole('heading', { level: 1, name: 'Groups' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Goa Trip/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Indiranagar Flat/ })).toBeVisible()
})

test('every tab renders a page heading', async ({ page }) => {
  const nav = page.getByRole('navigation')
  for (const tab of ['Groups', 'Insights', 'Profile', 'Home']) {
    await nav.getByRole('link', { name: tab }).click()
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  }
})

test('create a group through the kind selector', async ({ page }) => {
  await page.goto('/groups/new')
  const kinds = page.getByRole('radiogroup', { name: 'What are you creating?' })
  await kinds.getByRole('radio', { name: /^Group/ }).click()
  await expect(kinds.getByRole('radio', { name: /^Group/ })).toHaveAttribute('aria-checked', 'true')
  await page.getByLabel('Name', { exact: true }).fill('Manali 2026')
  const member = page.getByPlaceholder('Name', { exact: true })
  await member.fill('Dev')
  await member.press('Enter')
  await expect(page.getByText('Dev', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page).toHaveURL(/\/groups\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 1, name: /Manali 2026/ })).toBeVisible()
})

test('the + button opens the Create sheet; Add expense saves an equal split', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('nav-create').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByTestId('create-expense').click()
  await expect(page).toHaveURL(/\/add\?group=g_goa/)
  await expect(page.getByText('Goa Trip', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Dinner at Thalassa')
  await amountField(page).fill('1200')
  await page
    .getByRole('button', { name: /^(Save|Add expense)$/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  // The list re-renders from the shared store once the demo repo commits; give a loaded CI box time.
  await expect(page.getByText('Dinner at Thalassa')).toBeVisible({ timeout: 15_000 })
})

test('settle up records a payment', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByRole('link', { name: 'Settle up' }).click()
  await expect(page).toHaveURL(/\/groups\/g_goa\/settle/)
  // Demo seeds a debt in the Goa trip, so the people and amount are prefilled.
  const record = page.getByRole('button', { name: /^Record/ })
  await expect(record).toBeEnabled()
  await record.click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
})

test('scan page loads', async ({ page }) => {
  await page.goto('/scan')
  await expect(page.getByRole('heading', { level: 1, name: /scan/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /camera/i })).toBeVisible()
})

test('settings page loads', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1, name: /settings/i })).toBeVisible()
})

test('a Pay me link opens like it would for a friend, and “I’ve paid” records the payment', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByRole('radio', { name: 'Balances' }).click()
  await page.getByTestId('remind').first().click()
  // Demo mode has one browser: the toast offers to open the link as the friend would see it.
  await page
    .getByRole('button', { name: /^Open as / })
    .first()
    .click()
  await expect(page).toHaveURL(/\/r\/[a-z0-9]{24}\?guest=demo$/)
  await expect(page.getByTestId('paylink-amount')).toBeVisible()
  await page.getByTestId('mark-paid').click()
  await page.getByTestId('mark-paid-confirm').click()
  await expect(page.getByTestId('paylink-paid')).toBeVisible()
  // The payment is in the group now, linked to the Pay me link.
  await page.goto('/groups/g_goa')
  await expect(page.getByRole('link', { name: 'Pay me link' }).first()).toBeVisible({ timeout: 15_000 })
})

test('a table guest’s claim waits for the host, who confirms it on the group', async ({ page }) => {
  // A live table link not locked to one guest (someone the host added by hand), put straight
  // into the demo data: finishing a whole table here would only repeat the table flow.
  const code = 'tableclaimtableclaim2345'
  await page.evaluate((c) => {
    const state = JSON.parse(localStorage.getItem('splitit-demo-v1') ?? '{}')
    const now = Date.now()
    state.payLinks = {
      ...state.payLinks,
      [c]: {
        groupId: 'g_goa',
        groupName: 'Goa Trip',
        tableCode: 'TBL23456',
        from: 'p_rohan',
        to: 'me',
        amount: 25000,
        currency: 'INR',
        payeeName: 'Asha',
        payerName: 'Rohan',
        payment: { upi: 'you@okaxis' },
        createdBy: 'me',
        createdAt: now,
        expiresAt: now + 86_400_000,
        status: 'open',
      },
    }
    localStorage.setItem('splitit-demo-v1', JSON.stringify(state))
  }, code)
  await page.goto(`/r/${code}?guest=demo`)
  await page.getByTestId('mark-paid').click()
  await page.getByTestId('mark-paid-confirm').click()
  await expect(page.getByTestId('paylink-claimed')).toBeVisible()
  await page.goto('/groups/g_goa')
  const claim = page.getByTestId('group-claim')
  await expect(claim).toBeVisible()
  await claim.getByTestId('claim-confirm').click()
  await expect(claim).toBeHidden()
  await expect(page.getByRole('link', { name: 'Pay me link' }).first()).toBeVisible()
})
