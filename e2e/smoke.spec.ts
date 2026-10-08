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
  await expect(page.getByText('Goa Trip')).toBeVisible()
  await expect(page.getByText('Indiranagar Flat')).toBeVisible()
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
