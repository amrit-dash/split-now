/**
 * Smoke tests for the demo-mode app (see playwright.config.ts). They catch the "blank screen
 * after deploy" class of failure: sign-in, the seeded groups, the main create flows and the
 * lazy routes. Selectors prefer data-testids and roles over copy, which changes often.
 */
import { expect, test as base, type Page } from '@playwright/test'

/** Every test starts signed in to demo mode, and fails if the page threw an uncaught error. */
const test = base.extend<{ page: Page; fixedRates: boolean }>({
  // A fixed ECB rate (83.6 INR per USD) from the first request on, so no live rate gets cached first.
  fixedRates: [false, { option: true }],
  page: async ({ page, fixedRates }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    if (fixedRates)
      await page.route('**/api.frankfurter.dev/**', (route) => {
        const base = new URL(route.request().url()).searchParams.get('base')
        const rates = base === 'USD' ? { INR: 83.6 } : base === 'INR' ? { USD: 1 / 83.6 } : {}
        return route.fulfill({ json: { date: '2026-10-09', base, rates } })
      })
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
  // groups in its list and activity) is still on screen, so wait for the Groups heading and then
  // look for each group's own row link.
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

test('Quick add in the Create sheet: a group named in the line wins, and opens the form filled in', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('nav-create').click()
  const quick = page.getByRole('dialog').getByTestId('create-quick-add')
  // Not focused on open: the keyboard would cover the tiles.
  await expect(quick.getByRole('textbox', { name: 'Quick add' })).not.toBeFocused()
  await quick.getByRole('textbox', { name: 'Quick add' }).fill('Groceries 640 for flat')
  await expect(quick.getByTestId('create-quick-add-group-chip')).toContainText('Indiranagar Flat')
  await quick.getByTestId('create-quick-add-go').click()
  await expect(page).toHaveURL(/\/add\?group=g_flat&quick=1/)
  await expect(amountField(page)).toHaveValue(/640/)
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Groceries')
})

test('Quick add can start a new group, then lands on the form with the line', async ({ page }) => {
  await page.getByTestId('nav-create').click()
  const quick = page.getByRole('dialog').getByTestId('create-quick-add')
  await quick.getByRole('textbox', { name: 'Quick add' }).fill('Cab 300 in a new group Bali trip')
  await quick.getByTestId('create-quick-add-new-group').click()
  await expect(page).toHaveURL(/\/groups\/new\?/)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Bali trip')
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page).toHaveURL(/\/add\?group=[^&]+&quick=1/)
  await expect(amountField(page)).toHaveValue(/300/)
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Cab')
})

test('Quick add composer: outlined field, group chip, 44px mic and send; "New group" brings the named people along', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('nav-create').click()
  const quick = page.getByRole('dialog').getByTestId('create-quick-add')
  const field = quick.getByRole('textbox', { name: 'Quick add' })
  const go = quick.getByTestId('create-quick-add-go')
  const picker = quick.getByRole('combobox', { name: 'Group for the quick add' })
  await expect(picker).toContainText('Goa Trip')
  await expect(go).toBeDisabled()
  const box = await go.boundingBox()
  expect(box && box.width >= 44 && box.height >= 44).toBe(true)
  await field.fill('Dinner 900 with Kiran and Zoya')
  await expect(go).toBeEnabled()
  await picker.click()
  await page.getByRole('option', { name: /New group/ }).click()
  await expect(page).toHaveURL(/\/groups\/new\?/)
  await expect(page.getByText('Kiran', { exact: true })).toBeVisible()
  await expect(page.getByText('Zoya', { exact: true })).toBeVisible()
})

test('Quick add with AI (demo reader): "create a group … and add …" asks first, then opens the form in the new group', async ({ page }) => {
  await page.getByTestId('nav-create').click()
  const quick = page.getByRole('dialog').getByTestId('create-quick-add')
  await quick.getByRole('textbox', { name: 'Quick add' }).fill('create a group Manali trip with Kiran and Zoya and add dinner 2400 paid by me split equally')
  await quick.getByTestId('create-quick-add-go').click()
  const ask = page.getByRole('dialog').filter({ hasText: 'Create “Manali trip”?' })
  await expect(ask).toContainText('you, Kiran and Zoya')
  await ask.getByRole('button', { name: 'Create group' }).click()
  await expect(page).toHaveURL(/\/add\?group=[^&]+&quick=1/)
  await expect(amountField(page)).toHaveValue(/2400/)
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Dinner')
  await expect(page.getByText('Manali trip', { exact: true })).toBeVisible()
})

test('settle up records a payment', async ({ page }) => {
  await page.goto('/groups/g_goa')
  // Two people owe you in the Goa trip: Settle up lists them; each payment's Settle prefills it.
  await page.getByTestId('group-settle').click()
  await page.getByTestId('debt-settle').first().click()
  await expect(page).toHaveURL(/\/groups\/g_goa\/settle\?from=/)
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

test('Animations: turning them all off stills the preview and the accent buttons, and is kept after a reload', async ({ page }) => {
  await page.goto('/settings')
  await page.getByTestId('settings-animations').click()
  await expect(page.getByTestId('motion-preview')).toBeVisible()
  await page.getByTestId('motion-size').getByRole('radio', { name: 'Big' }).click()
  await expect(page.getByTestId('motion-size').getByRole('radio', { name: 'Big' })).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('motion-on').click()
  await expect(page.getByTestId('motion-on')).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('motion-preview-firework')).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-flow', 'off')
  await page.reload()
  await expect(page.getByTestId('motion-on')).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-flow', 'off')
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

test('a table guest’s claim waits for the host: it shows in the Inbox and the host confirms it on the group', async ({ page }) => {
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
  // The Inbox lists it under "to sort", with Confirm and Dismiss.
  await page.goto('/inbox')
  await expect(page.getByTestId('inbox-claim').getByTestId('claim-confirm')).toBeVisible()
  await page.goto('/groups/g_goa')
  const claim = page.getByTestId('group-claim')
  await expect(claim).toBeVisible()
  await claim.getByTestId('claim-confirm').click()
  await expect(claim).toBeHidden()
  await expect(page.getByRole('link', { name: 'Pay me link' }).first()).toBeVisible()
})

test('someone you owe nudged you: a reminder card on Home leads to the prefilled Settle up, and can be dismissed', async ({ page }) => {
  // The demo seeds a nudge from Meera (Coldplay Night), where the demo user owes her.
  const card = page.getByTestId('nudge-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Meera reminded you')
  await card.getByTestId('nudge-settle').click()
  await expect(page).toHaveURL(/\/groups\/g_gig\/settle\?from=me&to=p_meera&amount=\d+/)
  await page.goto('/inbox')
  await expect(page.getByTestId('nudge-card')).toBeVisible()
  await page.getByTestId('nudge-dismiss').click()
  await expect(page.getByTestId('nudge-card')).toBeHidden()
  await page.goto('/')
  await expect(page.getByTestId('home-net')).toBeVisible()
  await expect(page.getByTestId('nudge-card')).toBeHidden()
})

test('Balances: Remind and Nudge on the rows where someone owes you; a nudge counts once a day', async ({ page }) => {
  await page.goto('/settle?view=group')
  // Ananya has joined the Goa trip in the demo, so her row has Nudge; placeholders only Remind.
  const ananya = page.getByTestId('settle-row').filter({ hasText: 'Ananya' })
  await expect(ananya.getByTestId('remind')).toBeVisible()
  await ananya.getByTestId('nudge').click()
  await expect(page.getByText(/^Nudged Ananya/)).toBeVisible()
  await expect(ananya.getByTestId('nudge')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('settle-row').filter({ hasText: 'Rohan' }).getByTestId('nudge')).toHaveCount(0)
  // By person: the same rows, and the cooldown holds there too.
  await page.getByTestId('settle-view').getByRole('radio', { name: 'By person' }).click()
  const card = page.getByTestId('person-card').filter({ hasText: 'Ananya' })
  await expect(card.getByTestId('nudge')).toHaveAttribute('aria-disabled', 'true')
})

test('Members: from the group menu, a settled person can be removed (swipe) and someone who owes cannot', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('group-menu').click()
  await page.getByTestId('group-members').click()
  await expect(page).toHaveURL(/\/groups\/g_goa\/members$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible()

  // Someone who owes offers Settle up, never a working Remove.
  const owing = page.getByTestId('member-row').filter({ hasText: 'Rohan' })
  await expect(owing).toContainText(/owes/)
  await expect(owing.getByTestId('member-remove')).toHaveCount(0)
  await expect(owing.getByTestId('member-settle')).toHaveCount(1)

  // A newly added person is settled: swipe their row left and remove them.
  await page.getByLabel('Name of a person to add').fill('Zoe Test')
  await page.getByTestId('member-add').click()
  const zoe = page.getByTestId('member-row').filter({ hasText: 'Zoe Test' })
  await expect(zoe).toBeVisible()
  const box = await zoe.boundingBox()
  if (!box) throw new Error('no row box')
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width - 30, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 80, y, { steps: 4 })
  await page.mouse.move(box.x + box.width - 160, y, { steps: 4 })
  await page.mouse.up()
  await expect(zoe).toHaveAttribute('data-swipe', 'open')
  await zoe.getByTestId('member-remove').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('member-row').filter({ hasText: 'Zoe Test' })).toHaveCount(0)
})

test('Row actions: icon buttons keep the name in view; right-click opens the same actions with their names', async ({ page }) => {
  await page.goto('/groups/g_goa')
  const row = page.getByTestId('expense-row').first()
  const title = (await row.locator('.font-medium').first().textContent())?.trim() ?? ''
  await row.click({ button: 'right' })
  const menu = page.getByTestId('row-menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByTestId('expense-edit-menu')).toContainText(`Edit ${title}`)
  await expect(menu.getByTestId('expense-delete-menu')).toBeVisible()
  await menu.getByTestId('expense-edit-menu').click()
  await expect(page).toHaveURL(/\/groups\/g_goa\/expenses\/[^/]+\/edit$/)
})

test('Group Settle up: with several people owing you it opens the group Balances, each payment with its own Settle', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('group-settle').click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  await expect(page.locator('#group-payments')).toBeVisible()
  await expect(page.locator('#group-payments').getByTestId('debt-settle')).not.toHaveCount(0)
})

test('Back goes where you came from: Edit group → Manage members → Back returns to Edit group, then the group', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('group-menu').click()
  await page.getByRole('button', { name: 'Edit group' }).click()
  await expect(page).toHaveURL(/\/groups\/g_goa\/edit$/)
  await page.getByTestId('group-manage-members').click()
  await expect(page).toHaveURL(/\/groups\/g_goa\/members$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/groups\/g_goa\/edit$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
})

test('Back on a screen opened cold goes to its parent', async ({ page }) => {
  await page.goto('/groups/g_goa/members')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
})

/** A dollar trip where Rohan owes you $12.50, beside the seeded rupee groups (use with fixedRates). */
async function usdTripWithRates(page: Page) {
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('splitit-demo-v1') ?? '{}')
    const goa = s.groups.g_goa
    // Home currency rupees (the demo follows the browser's region otherwise).
    s.profiles.me = { ...s.profiles.me, currency: 'INR' }
    s.groups.g_nyc = { ...goa, id: 'g_nyc', name: 'NYC trip', emoji: '🗽', currency: 'USD', budget: undefined, startDate: undefined, endDate: undefined }
    s.expenses.e_nyc = {
      id: 'e_nyc',
      groupId: 'g_nyc',
      description: 'Pizza',
      amount: 2500,
      category: 'food',
      date: '2026-10-09',
      paidBy: { me: 2500 },
      splits: { me: 1250, p_rohan: 1250 },
      splitType: 'equal',
      splitInput: { selected: ['me', 'p_rohan'] },
      createdBy: 'me',
      createdAt: 1,
      updatedAt: 1,
    }
    localStorage.setItem('splitit-demo-v1', JSON.stringify(s))
  })
  await page.reload()
}

test.describe('Collect in my currency', () => {
  // The fixed ECB rate is served by page.route, which can't see requests the service worker makes.
  test.use({ serviceWorkers: 'block', fixedRates: true })

  test('Collect in my currency: Balances folds dollars into ≈ rupees; Settle up converts with the 4% rule', async ({ page }) => {
    await usdTripWithRates(page)
    await page.goto('/settings/preferences')
    await page.getByTestId('collect-home').click()
    await expect(page.getByTestId('collect-home')).toHaveAttribute('aria-checked', 'true')

    // Balances: Rohan's rupees (Goa) and dollars (NYC) are one ≈ ₹ balance across 2 groups.
    await page.goto('/settle')
    const rohan = page.getByTestId('person-card').filter({ hasText: 'Rohan' })
    await expect(rohan.getByTestId('row-amount').first()).toContainText('≈ ₹')
    await expect(rohan).toContainText('across 2 groups')

    // In the dollar group, Settle up starts out in rupees: ₹1,045 clears $12.50; ₹4.50 clears only a part.
    await page.goto('/groups/g_nyc/settle?from=p_rohan&to=me&amount=1250')
    await expect(page.getByTestId('pay-in-switch')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('pay-in-line')).toHaveText('Clears $12.50 in full')
    await page.getByTestId('pay-in-amount').fill('4.50')
    await expect(page.getByTestId('pay-in-line')).toContainText('stays owed')
    await page.getByTestId('pay-in-amount').fill('1060')
    await expect(page.getByTestId('pay-in-line')).toContainText('in full (within 4%')
    await page.getByTestId('settle-record').click()
    await expect(page).toHaveURL(/\/groups\/g_nyc$/)
    await expect(page.getByTestId('payment-row').first()).toContainText('paid ₹1,060.00')
  })

  test('Collect in my currency: one Pay me link in rupees clears the rupee and the dollar group', async ({ page }) => {
    await usdTripWithRates(page)
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('splitit-demo-v1') ?? '{}')
      s.profiles.me = { ...s.profiles.me, collectInHome: true }
      localStorage.setItem('splitit-demo-v1', JSON.stringify(s))
    })
    await page.goto('/settle')
    // Until today's rate arrives Rohan shows once per currency; then as one ≈ ₹ card.
    const rohan = page.getByTestId('person-card').filter({ hasText: 'Rohan' })
    await expect(rohan).toHaveCount(1)
    await expect(rohan).toContainText('≈ ₹')
    await rohan.getByTestId('remind').click()
    await page
      .getByRole('button', { name: /^Open as / })
      .first()
      .click()
    await expect(page).toHaveURL(/\/r\/[a-z0-9]{24}\?guest=demo$/)
    await expect(page.getByTestId('paylink-amount')).toContainText('₹')
    await page.getByTestId('mark-paid').click()
    await page.getByTestId('mark-paid-confirm').click()
    await expect(page.getByTestId('paylink-paid')).toBeVisible()
    // Each group recorded its own currency: the dollar one with what was paid in rupees.
    await page.goto('/groups/g_nyc')
    await expect(page.getByTestId('payment-row').first()).toContainText('$12.50')
    await expect(page.getByTestId('payment-row').first()).toContainText('paid ₹1,045.00')
    await page.goto('/groups/g_goa')
    await expect(page.getByTestId('payment-row').first()).toContainText('Rohan')
  })
})

test('Payments need the recipient’s OK: a payment waits for it; the recipient confirms from the Inbox', async ({ page }) => {
  // Any member turns it on for the group (Goa: Ananya has an account, so her OK can be asked for).
  await page.goto('/groups/g_goa/edit')
  await page.getByTestId('group-payment-approval').click()
  await expect(page.getByTestId('group-payment-approval')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('group-save').click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)

  // My payment to Ananya waits for her OK; the screenshot goes with it.
  await page.goto('/groups/g_goa/settle?from=me&to=p_ananya&amount=50000')
  await expect(page.getByTestId('settle-needs-ok')).toContainText('Needs Ananya’s OK')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await page.getByTestId('settle-proof-input').setInputFiles({ name: 'paid.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByTestId('settle-proof')).toBeVisible()
  await page.getByTestId('settle-record').click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  const mine = page.getByTestId('payment-row').filter({ hasText: 'Ananya' }).first()
  await expect(mine.getByTestId('payment-pill-needs-ok')).toBeVisible()
  await mine.getByTestId('payment-proof').click()
  await expect(page.getByTestId('payment-proof-sheet').getByRole('img')).toBeVisible()
  await page.keyboard.press('Escape')

  // Ananya says she paid me ₹300: it waits for my OK in the Inbox, and counts once I confirm it.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('splitit-demo-v1') ?? '{}')
    s.settlements.s_from_ananya = {
      id: 's_from_ananya',
      groupId: 'g_goa',
      from: 'p_ananya',
      to: 'me',
      amount: 30000,
      method: 'UPI',
      date: new Date().toISOString().slice(0, 10),
      createdBy: 'seed_ananya',
      createdAt: Date.now(),
      needsOk: true,
    }
    localStorage.setItem('splitit-demo-v1', JSON.stringify(s))
  })
  await page.goto('/inbox')
  const card = page.getByTestId('inbox-payment')
  await expect(card).toContainText('Ananya paid you ₹300.00')
  await card.getByTestId('inbox-payment-confirm').click()
  await expect(card).toHaveCount(0)
  await page.goto('/groups/g_goa')
  await expect(page.getByTestId('payment-row').filter({ hasText: 'Ananya' }).filter({ hasText: '₹300.00' }).getByTestId('payment-pill-needs-ok')).toHaveCount(0)
})
