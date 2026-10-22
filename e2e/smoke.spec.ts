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

/** Private groups start off: Settings → Encrypted groups → Turn on private groups, leaving the setup card on screen. */
async function turnOnPrivateGroups(page: Page) {
  await page.goto('/settings/vault')
  await page.getByTestId('vault-turn-on').click()
  await expect(page.getByTestId('vault-setup-status')).toBeVisible()
}

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
  for (const tab of ['Groups', 'Profile', 'Home']) {
    await nav.getByRole('link', { name: tab }).click()
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  }
  // Insights moved to Profile; Live table has its slot in the bar
  await nav.getByRole('link', { name: 'Profile' }).click()
  await page.getByTestId('profile-insights').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await nav.getByRole('link', { name: 'Live table' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Live table' })).toBeVisible()
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

test('Private group: universal pattern, words stored encrypted, patterns go in on the lock button itself', async ({ page }) => {
  // T T L T L L: on the Settings pad through its step buttons; on a lock button as presses (a long one is held 600 ms).
  const enter = async (p = 'TTLTLL') => {
    for (const s of p) await page.getByTestId(s === 'T' ? 'pattern-add-tap' : 'pattern-add-long').click()
  }
  const press = async (testId: string, p = 'TTLTLL') => {
    const lock = page.getByTestId(testId)
    for (const s of p) await lock.click(s === 'L' ? { delay: 600 } : undefined)
  }
  // Settings → Encrypted groups: turned on, then the universal pattern, twice
  await turnOnPrivateGroups(page)
  await page.getByTestId('vault-universal-open').click()
  await enter()
  // the pad that sets it shows each tap as a dot and each long press as a dash
  await expect(page.getByTestId('pattern-count')).toContainText('··–·––')
  await page.getByTestId('vault-set-next').click()
  await enter()
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-line-pattern')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByTestId('vault-line-pattern')).toContainText('Set · in order')
  // changing it starts with the current one; a wrong one goes nowhere
  await page.getByTestId('vault-universal-open').click()
  await expect(page.getByTestId('vault-set-prompt')).toHaveText('Enter your current pattern')
  await enter('LLTTLT')
  await page.getByTestId('vault-set-next').click()
  await enter('TLTLTL')
  await page.getByTestId('vault-set-next').click()
  await enter('TLTLTL')
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-set-note')).toContainText('That’s not it')
  await expect(page.getByTestId('vault-set-prompt')).toHaveText('Enter your current pattern')
  // the right one goes on (and clears the wrong try): kept the same here, so the rest of the test uses it
  await enter()
  await page.getByTestId('vault-set-next').click()
  await enter()
  await page.getByTestId('vault-set-next').click()
  await enter()
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-set-pattern')).toBeHidden()

  await page.goto('/groups/new')
  const kinds = page.getByRole('radiogroup', { name: 'What are you creating?' })
  await kinds.getByRole('radio', { name: /^Group/ }).click()
  await page.getByLabel('Name', { exact: true }).fill('Vault trip')
  const member = page.getByPlaceholder('Name', { exact: true })
  await member.fill('Dev')
  await member.press('Enter')
  await page.getByTestId('group-private').click()
  await page.getByRole('button', { name: 'Create group' }).click()
  // The phone that made it has its key: it opens straight away.
  await expect(page.getByRole('heading', { level: 1, name: /Vault trip/ })).toBeVisible()
  await expect(page.getByTestId('vault-lock')).toBeHidden()
  // In the app from here on (a reload forgets the keys, which locks every private group: that's the point).
  // inside the group, + adds an expense to it straight away
  await page.getByTestId('nav-create').click()
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Secret dinner')
  await amountField(page).fill('900')
  await page.getByTestId('expense-save').click()
  await expect(page.getByText('Secret dinner')).toBeVisible({ timeout: 15_000 })
  // On the device, as on the server, the words are a token.
  const stored = await page.evaluate(() => localStorage.getItem('splitit-demo-v1') ?? '')
  expect(stored).not.toContain('Secret dinner')
  expect(stored).toMatch(/"description":"v1:[A-Za-z0-9_-]+"/)

  // Inside the group: a wrong pattern counts, the right one opens it (sent after a pause, nothing shown).
  await page.getByTestId('vault-lock-now').click()
  await expect(page.getByTestId('vault-lock')).toBeVisible()
  // A stray tap goes nowhere, and a wrong pattern shows nothing at all: the screen stays as it is.
  await press('vault-unlock-open', 'T')
  await press('vault-unlock-open', 'TTLTLT')
  await page.waitForTimeout(2000)
  await expect(page.getByTestId('vault-lock')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // the wrong one was counted (by the "server", never on screen); the stray tap never reached it
  const tries = await page.evaluate(() => JSON.parse(localStorage.getItem('sn-demo-vault') ?? '{}').tries)
  expect(tries).toEqual({ wrong: 1 })
  // each press shows it was felt, the same for every press
  const box = await page.getByTestId('vault-unlock-open').boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await expect(page.getByTestId('vault-unlock-open')).toHaveAttribute('data-press', 'down')
  await page.mouse.up()
  await expect(page.getByTestId('vault-unlock-open')).toHaveAttribute('data-press', 'idle')
  // that stray press goes nowhere after the pause; the right pattern then opens it, on the same screen
  await page.waitForTimeout(1700)
  await press('vault-unlock-open')
  await expect(page.getByText('Secret dinner')).toBeVisible()

  // The Groups screen's lock: all private groups at once.
  await page.getByRole('navigation').getByRole('link', { name: 'Groups' }).click()
  const lock = page.getByTestId('groups-vault')
  await expect(lock).toHaveAccessibleName('Lock private groups')
  await lock.click()
  // Locked, the button is just "Private groups": nothing says a pattern goes in.
  await expect(lock).toHaveAccessibleName('Private groups')
  // Locked, its row is a lock, letters, animals and symbols: nothing of its name.
  await expect(page.getByTestId('group-row-locked')).toBeVisible()
  await expect(page.getByText('Vault trip')).toHaveCount(0)
  // Home never shows private groups, open or locked, and says so.
  await page.getByRole('navigation').getByRole('link', { name: 'Home' }).click()
  await expect(page.getByTestId('home-private-note')).toBeVisible()
  await expect(page.getByText('Secret dinner')).toHaveCount(0)
  await page.getByRole('navigation').getByRole('link', { name: 'Groups' }).click()
  await press('groups-vault')
  await expect(lock).toHaveAccessibleName('Lock private groups')
  await expect(page.getByText('Vault trip')).toBeVisible()
  // An open private group's row has its own open lock: a tap locks just that one, without opening it.
  await page.getByTestId('group-row-lock').click()
  await expect(page).toHaveURL(/\/groups$/)
  await expect(page.getByTestId('group-row-locked')).toBeVisible()
  await expect(page.getByText('Vault trip')).toHaveCount(0)
})

test('Private group: its creator makes an existing group private, everything in it sealed, and turns it off again', async ({ page }) => {
  const enter = async (p = 'TTLTLL') => {
    for (const s of p) await page.getByTestId(s === 'T' ? 'pattern-add-tap' : 'pattern-add-long').click()
  }
  await turnOnPrivateGroups(page)
  await page.getByTestId('vault-universal-open').click()
  await enter()
  await page.getByTestId('vault-set-next').click()
  await enter()
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-line-pattern')).toHaveAttribute('data-state', 'ready')

  await page.goto('/groups/g_goa')
  await expect(page.getByRole('heading', { level: 1, name: /Goa Trip/ })).toBeVisible()
  await page.getByTestId('group-menu').click()
  await page.getByTestId('vault-group-open').click()
  // Ananya and the others in it have no universal pattern: it starts on its own pattern, and Universal warns
  const opensWith = page.getByTestId('vault-opens-with')
  await expect(opensWith.getByRole('radio', { name: 'Its own pattern' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('vault-convert-locked-out')).toHaveCount(0)
  await opensWith.getByRole('radio', { name: 'Universal pattern' }).click()
  await expect(page.getByTestId('vault-convert-locked-out')).toContainText('no universal pattern, so they couldn’t open it')
  await page.getByTestId('vault-convert-on').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Make private' }).click()
  // Open on this phone straight away; stored sealed: its name, its people, its expenses.
  await expect(page.getByRole('heading', { level: 1, name: /Goa Trip/ })).toBeVisible()
  const sealed = await page.evaluate(() => JSON.parse(localStorage.getItem('splitit-demo-v1') ?? '{}'))
  expect(sealed.groups.g_goa.vault).toBe(true)
  expect(sealed.groups.g_goa.name).toMatch(/^v1:/)
  expect(sealed.groups.g_goa.members.p_priya.name).toMatch(/^v1:/)
  expect(JSON.stringify(sealed.groups.g_goa)).not.toContain('Priya')
  const goaExpenses = Object.values(sealed.expenses as Record<string, { groupId: string; description: string }>).filter((e) => e.groupId === 'g_goa')
  expect(goaExpenses.length).toBeGreaterThan(0)
  for (const e of goaExpenses) expect(e.description).toMatch(/^v1:/)
  // The group says who can't open it, and gives it its own pattern from there; then the card is gone
  const waiting = page.getByTestId('group-vault-waiting')
  await expect(waiting).toContainText('can’t open it yet')
  await waiting.getByTestId('group-vault-waiting-set').click()
  await enter()
  await page.getByTestId('vault-set-next').click()
  await enter('TLT')
  await page.getByTestId('vault-set-next').click()
  await enter('TLT')
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-line-own')).toHaveAttribute('data-state', 'ready')
  await page.keyboard.press('Escape')
  await expect(waiting).toHaveCount(0)

  // Locked: nothing of its name shows; its own lock opens it again.
  await page.getByTestId('vault-lock-now').click()
  await expect(page.getByTestId('vault-lock')).toBeVisible()
  await expect(page.getByText('Goa Trip')).toHaveCount(0)
  const lock = page.getByTestId('vault-unlock-open')
  for (const s of 'TTLTLL') await lock.click(s === 'L' ? { delay: 600 } : undefined)
  await expect(page.getByRole('heading', { level: 1, name: /Goa Trip/ })).toBeVisible()

  // Turned off: stored readable again.
  await page.getByTestId('group-menu').click()
  await page.getByTestId('vault-group-open').click()
  await page.getByTestId('vault-convert-off').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Turn off', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Goa Trip/ })).toBeVisible()
  const plain = await page.evaluate(() => JSON.parse(localStorage.getItem('splitit-demo-v1') ?? '{}'))
  expect(plain.groups.g_goa.vault).toBeUndefined()
  expect(plain.groups.g_goa.name).toBe('Goa Trip')
  expect(JSON.stringify(plain.groups.g_goa)).not.toContain('v1:')
})

test('the + button opens the Create sheet; Add expense saves an equal split', async ({ page }) => {
  await page.getByTestId('nav-create').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  // Quick add first, then Add expense, New group and Scan; no Settle up or Live table tiles
  await expect(sheet.getByTestId('create-split')).toHaveCount(0)
  await expect(sheet.getByTestId('create-settle')).toHaveCount(0)
  await expect(sheet.getByTestId('create-group')).toBeVisible()
  await expect(sheet.getByTestId('create-scan')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  // inside a group, a tap on + goes straight to Add expense for it, no sheet
  await page.goto('/groups/g_goa')
  await page.getByTestId('nav-create').click()
  await expect(page).toHaveURL(/\/add\?group=g_goa/)
  await expect(page.getByText('Goa Trip', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Dinner at Bob’s Bar')
  await amountField(page).fill('1200')
  await page
    .getByRole('button', { name: /^(Save|Add expense)$/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  // The list re-renders from the shared store once the demo repo commits; give a loaded CI box time.
  await expect(page.getByText('Dinner at Bob’s Bar')).toBeVisible({ timeout: 15_000 })
})

test('Money received: shared like an expense, shown as received, and the receiver passes it on', async ({ page }) => {
  await page.goto('/add?group=g_goa')
  await page.getByTestId('expense-kind').getByRole('radio', { name: 'Money received' }).click()
  await expect(page.getByRole('heading', { name: 'Add money received' })).toBeVisible()
  await expect(page.getByText('Received by', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Hotel refund')
  await amountField(page).fill('1000')
  await page.getByTestId('expense-save').click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  const row = page.getByRole('link').filter({ hasText: 'Hotel refund' })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row).toContainText('received')
  await expect(row).toContainText('you pass on')
  await row.click()
  await expect(page.getByText('Received by', { exact: true })).toBeVisible()
  // The breakdown: reached from Balances, with each person's real cost and balance before and after.
  await page.goto('/groups/g_goa')
  await page.getByRole('radio', { name: 'Balances' }).click()
  await page.getByTestId('balances-received-note').click()
  await expect(page.getByTestId('group-money')).toBeVisible()
  await expect(page.getByTestId('money-person').first()).toContainText('Without money received')
  await expect(page.getByText('Hotel refund')).toBeVisible()
})

test('Quick add in the Create sheet: a group named in the line wins, and opens the form filled in', async ({ page }) => {
  await page.goto('/groups/g_goa')
  // inside a group a tap adds an expense; press and hold (here a right click) opens the sheet
  await page.getByTestId('nav-create').click({ button: 'right' })
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
  // inside a group a tap adds an expense; press and hold (here a right click) opens the sheet
  await page.getByTestId('nav-create').click({ button: 'right' })
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

test('Preferences → Icons: Filled turns the tab bar icons solid, Outline brings the lines back, and it is kept after a reload', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  const groupsIcon = nav.getByRole('link', { name: 'Groups' }).locator('svg')
  // Outline by default; the current tab (Home) is solid in either style.
  await expect(nav).toHaveAttribute('data-icon-style', 'outline')
  await expect(groupsIcon).toHaveAttribute('data-variant', 'line')
  await expect(nav.getByRole('link', { name: 'Home' }).locator('svg')).toHaveAttribute('data-variant', 'solid')
  await page.goto('/settings/preferences')
  const icons = page.getByTestId('icon-style')
  await icons.getByRole('radio', { name: 'Filled' }).click()
  await expect(icons.getByRole('radio', { name: 'Filled' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-icon-style', 'filled')
  await page.goto('/')
  await expect(nav).toHaveAttribute('data-icon-style', 'filled')
  await expect(groupsIcon).toHaveAttribute('data-variant', 'solid')
  await page.reload()
  await expect(groupsIcon).toHaveAttribute('data-variant', 'solid')
  await page.goto('/settings/preferences')
  // Help's pictures follow the style too (Solar bold duotone in Filled).
  await page.goto('/help')
  await expect(page.getByTestId('help-core-card').first().locator('svg[data-variant="solid"] path').first()).toBeAttached()
  await page.goto('/settings/preferences')
  await page.getByTestId('icon-style').getByRole('radio', { name: 'Outline' }).click()
  await page.goto('/')
  await expect(groupsIcon).toHaveAttribute('data-variant', 'line')
  await page.goto('/help')
  await expect(page.getByTestId('help-core-card').first().locator('svg[data-variant="line"] path').first()).toBeAttached()
})

test('Animations: turning them all off stills the preview and the accent buttons, and is kept after a reload', async ({ page }) => {
  await page.goto('/settings')
  await page.getByTestId('settings-animations').click()
  await expect(page.getByTestId('motion-preview')).toBeVisible()
  // The eye in the header hides the preview (and brings it back).
  await page.getByTestId('motion-preview-toggle').click()
  await expect(page.getByTestId('motion-preview')).toHaveCount(0)
  await expect(page.getByTestId('motion-preview-toggle')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('motion-preview-toggle').click()
  await expect(page.getByTestId('motion-preview')).toBeVisible()
  await page.getByTestId('motion-size').getByRole('radio', { name: 'Big' }).click()
  await expect(page.getByTestId('motion-size').getByRole('radio', { name: 'Big' })).toHaveAttribute('aria-checked', 'true')
  // Glitter shape and Twinkle are their own settings.
  await page.getByTestId('motion-glitter-shape').getByRole('radio', { name: 'Stars' }).click()
  await expect(page.getByTestId('motion-glitter-shape').getByRole('radio', { name: 'Stars' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('motion-twinkle')).toHaveAttribute('aria-checked', 'false')
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

test('Inbox → Recently handled: Clear all empties it, and Undo brings every payment back', async ({ page }) => {
  await page.goto('/inbox')
  // The demo's captured payment, marked not shared, moves to Recently handled.
  await page
    .getByRole('button', { name: /^Mark .+ as not shared$/ })
    .first()
    .click()
  await expect(page.getByTestId('inbox-handled')).toContainText('Recently handled · 1')
  // Clear all shows only once the list is open.
  await expect(page.getByTestId('inbox-handled-clear')).toHaveCount(0)
  await page.getByTestId('inbox-handled').click()
  await page.getByTestId('inbox-handled-clear').click()
  await expect(page.getByTestId('inbox-handled')).toHaveCount(0)
  // Marking it not shared left its own Undo toast; Clear all's is the newest.
  await page.getByRole('button', { name: 'Undo' }).last().click()
  await expect(page.getByTestId('inbox-handled')).toContainText('Recently handled · 1')
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

test('Members: someone added twice is merged into one person; their money moves with them', async ({ page }) => {
  await page.goto('/groups/g_goa/members')
  await page.getByLabel('Name of a person to add').fill('Rohan Again')
  await page.getByTestId('member-add').click()
  const twin = page.getByTestId('member-row').filter({ hasText: 'Rohan Again' })
  await expect(twin).toBeVisible()
  await twin.click({ button: 'right' })
  await page.getByTestId('row-menu').getByTestId('member-merge-menu').click()
  const sheet = page.getByTestId('merge-sheet')
  await sheet.getByTestId('merge-pick').filter({ hasText: 'Rohan' }).filter({ hasNotText: 'Again' }).click()
  await sheet.getByTestId('merge-confirm').click()
  await expect(page.getByTestId('member-row').filter({ hasText: 'Rohan Again' })).toHaveCount(0)
  // Rohan still owes what he owed: nothing moved away from him.
  await expect(page.getByTestId('member-row').filter({ hasText: 'Rohan' })).toContainText(/owes/)
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

test('Editing an expense records who did it: the expense says “edited by you”', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('expense-row').first().click({ button: 'right' })
  await page.getByTestId('row-menu').getByTestId('expense-edit-menu').click()
  await expect(page).toHaveURL(/\/groups\/g_goa\/expenses\/[^/]+\/edit$/)
  const id = /expenses\/([^/]+)\/edit$/.exec(page.url())?.[1]
  await page.locator('#expense-description').fill('Edited by me (e2e)')
  await page.getByTestId('expense-save').click()
  await page.goto(`/groups/g_goa/expenses/${id}`)
  await expect(page.getByTestId('expense-added')).toContainText('edited by you')
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

/** Help's front page, reached from Profile as a person would (so there is history behind it). */
async function openHelpFromProfile(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Profile' }).click()
  await page.getByTestId('profile-help').click()
  await expect(page).toHaveURL(/\/help$/)
  await expect(page.getByTestId('help-core-card').first()).toBeVisible()
}

test('help: a related section, then Back, returns to the section it was opened from, then the guide; the system back agrees', async ({ page }) => {
  await openHelpFromProfile(page)
  await page.locator('a[href="/help/approvals"]').click()
  await expect(page).toHaveURL(/\/help\/approvals$/)
  await page.getByTestId('help-section').locator('a[href="/help/edit-group"]').click()
  await expect(page).toHaveURL(/\/help\/edit-group$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/help\/approvals$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/help$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  // The same trip with the browser's (Android's) back.
  await page.getByTestId('profile-help').click()
  await page.locator('a[href="/help/approvals"]').click()
  await page.getByTestId('help-section').locator('a[href="/help/edit-group"]').click()
  await expect(page).toHaveURL(/\/help\/edit-group$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/help\/approvals$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/help$/)
})

test('help: a section opened from a link goes back to the guide, and a search result back to the results', async ({ page }) => {
  await page.goto('/help/approvals')
  await page.getByTestId('help-section').locator('a[href="/help/edit-group"]').click()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/help\/approvals$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/help$/)
  await page.getByTestId('help-search').fill('refund')
  await page.getByTestId('help-results').getByTestId('help-row').first().click()
  await expect(page.getByTestId('help-section')).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByTestId('help-search')).toHaveValue('refund')
  await expect(page.getByTestId('help-results')).toBeVisible()
})

test('help: a section opened from low on the guide starts at the top, and back puts the guide and its row where they were', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHelpFromProfile(page)
  const row = page.getByTestId('help-stories')
  await row.evaluate((el) => {
    el.scrollLeft = 260
  })
  const left = await row.evaluate((el) => el.scrollLeft)
  expect(left).toBeGreaterThan(100)
  const link = page.locator('a[href="/help/confirm-payment"]')
  await link.scrollIntoViewIfNeeded()
  const y = await page.evaluate(() => window.scrollY)
  expect(y).toBeGreaterThan(500)
  await link.click()
  await expect(page.getByTestId('help-scene')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5)
  // A related section opened from the bottom of this one starts at the top too.
  const related = page.getByTestId('help-section').getByTestId('help-row').first()
  await related.scrollIntoViewIfNeeded()
  await related.click()
  await expect(page).not.toHaveURL(/confirm-payment$/)
  // The address changes a moment before the new section renders and the page goes to the top,
  // so wait for that rather than reading the scroll in between (a slow runner lands there).
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5)
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/help$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 20)
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(y + 20)
  await expect.poll(() => page.getByTestId('help-stories').evaluate((el) => el.scrollLeft)).toBeGreaterThan(left - 40)
  expect(await page.getByTestId('help-stories').evaluate((el) => el.scrollLeft)).toBeLessThan(left + 40)
})

test('Back in Settings: a settings screen returns to Settings, then to Profile', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Profile' }).click()
  await page.getByTestId('profile-settings').click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.getByTestId('settings-notifications').click()
  await expect(page).toHaveURL(/\/settings\/notifications$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/profile$/)
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
  // Every approval setting sits in the Approvals section; closed, it says what is on.
  await expect(page.getByTestId('group-approvals')).toContainText('Off')
  await page
    .getByTestId('group-approvals')
    .getByRole('button', { name: /Approvals/ })
    .click()
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

test('with Simplify debts off, the graph opens on the payments as they are, like the list above it', async ({ page }) => {
  // The seeded flat group has Simplify debts off.
  await page.goto('/groups/g_flat')
  await page.getByRole('radio', { name: 'Balances' }).click()
  const graph = page.getByTestId('group-graph')
  await graph.getByRole('button').first().click()
  const views = graph.getByRole('radiogroup', { name: 'Graph view' })
  await expect(views.getByRole('radio', { name: /^Original/ })).toHaveAttribute('aria-checked', 'true')
  await expect(views.getByRole('radio', { name: /^Simplified/ })).toHaveAttribute('aria-checked', 'false')
})

test("Settle up in a group where nobody owes anything opens the group's celebration", async ({ page }) => {
  await page.goto('/groups/new')
  const kinds = page.getByRole('radiogroup', { name: 'What are you creating?' })
  await kinds.getByRole('radio', { name: /^Group/ }).click()
  await page.getByLabel('Name', { exact: true }).fill('Square Trip')
  const member = page.getByPlaceholder('Name', { exact: true })
  await member.fill('Dev')
  await member.press('Enter')
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page).toHaveURL(/\/groups\/[^/?]+$/)
  await page.getByTestId('group-settle').click()
  const settled = page.getByTestId('group-settled')
  await expect(settled).toBeVisible()
  await expect(settled.getByRole('heading', { name: /Everyone’s square in Square Trip/ })).toBeVisible()
  // A payment made outside the app can still be recorded from here.
  await expect(page.getByTestId('group-settled-record')).toHaveAttribute('href', /\/groups\/[^/]+\/settle$/)
})

test('archiving is only for you and needs you square: blocked while you are owed, then archived and restored', async ({ page }) => {
  // In the seeded Goa trip you are owed money, so Archive waits until you settle up.
  await page.goto('/groups/g_goa')
  await page.getByTestId('group-menu').click()
  await expect(page.getByTestId('group-archive')).toBeDisabled()
  await expect(page.getByTestId('group-archive')).toContainText('Settle up first')
  await page.keyboard.press('Escape')

  // A new group has nothing to settle: archive it, and it moves under Archived on Groups.
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Done Trip')
  const member = page.getByPlaceholder('Name', { exact: true })
  await member.fill('Dev')
  await member.press('Enter')
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page).toHaveURL(/\/groups\/[^/?]+$/)
  await page.getByTestId('group-menu').click()
  await expect(page.getByTestId('group-archive')).toBeEnabled()
  await expect(page.getByTestId('group-archive')).toContainText('Only for you')
  await page.getByTestId('group-archive').click()
  await page.goto('/groups')
  const archived = page.getByTestId('archived-groups')
  await expect(archived).toBeVisible()
  await archived.getByRole('button').first().click()
  await archived.getByText('Done Trip').click()
  await page.getByTestId('group-menu').click()
  await expect(page.getByTestId('group-archive')).toContainText('Unarchive')
  await page.getByTestId('group-archive').click()
  await page.goto('/groups')
  await expect(page.getByTestId('archived-groups')).toHaveCount(0)
})

test('deleting a group moves it to Recently deleted, where anyone in it can restore it', async ({ page }) => {
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Oops Trip')
  const member = page.getByPlaceholder('Name', { exact: true })
  await member.fill('Dev')
  await member.press('Enter')
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page).toHaveURL(/\/groups\/[^/?]+$/)
  const url = page.url()

  // You created it, so you can delete it; the confirmation says it can be restored.
  await page.getByTestId('group-menu').click()
  await page.getByTestId('group-delete').click()
  await expect(page.getByRole('dialog')).toContainText('restore it within 30 days')
  await page.getByRole('button', { name: 'Delete group' }).click()
  await expect(page).toHaveURL(/\/groups$/)

  // Gone from the list, waiting in Recently deleted.
  const deleted = page.getByTestId('deleted-groups')
  await expect(deleted).toBeVisible()
  await deleted.getByRole('button').first().click()
  await deleted.getByText('Oops Trip').click()
  await expect(page).toHaveURL(url)
  await expect(page.getByTestId('group-deleted')).toContainText('Deleted by you')

  // Nothing can be added while it's deleted: Settle up and Add expense show the same card.
  await page.goto(`${url}/settle`)
  await expect(page.getByTestId('group-deleted')).toBeVisible()
  await page.goto(`/add?group=${url.split('/').pop()}`)
  await expect(page.getByTestId('group-deleted')).toBeVisible()
  await page.goto(url)

  // Restore brings it back as it was.
  await page.getByTestId('group-restore').click()
  await expect(page.getByTestId('group-deleted')).toHaveCount(0)
  await expect(page.getByTestId('group-menu')).toBeVisible()
  await page.goto('/groups')
  await expect(page.getByTestId('deleted-groups')).toHaveCount(0)
})

test('only the creator may delete a group while they are in it', async ({ page }) => {
  // Meera created the seeded gig group and is still in it: no Delete in the menu for you.
  await page.goto('/groups/g_gig')
  await page.getByTestId('group-menu').click()
  await expect(page.getByTestId('group-delete')).toHaveCount(0)
})

/** Demo data with every group gone: the first-run screens. */
async function noGroups(page: Page) {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('splitit-demo-v1') ?? '{}')
    Object.assign(state, { groups: {}, expenses: {}, settlements: {}, activity: {} })
    localStorage.setItem('splitit-demo-v1', JSON.stringify(state))
  })
  await page.goto('/')
  await expect(page.getByTestId('first-run')).toBeVisible()
}

test('Inbox: Mark all read clears the Updates badge and hides itself', async ({ page }) => {
  await page.goto('/inbox')
  const updates = page.getByTestId('inbox-tabs').getByRole('radio', { name: /Updates/ })
  await expect(updates).toContainText(/unread/)
  // Mark all read belongs to Updates: not on To sort.
  await page
    .getByTestId('inbox-tabs')
    .getByRole('radio', { name: /To sort/ })
    .click()
  await expect(page.getByTestId('inbox-mark-read')).toHaveCount(0)
  await updates.click()
  await page.getByTestId('inbox-mark-read').click()
  await expect(page.getByTestId('inbox-mark-read')).toHaveCount(0)
  await expect(updates).not.toContainText(/unread/)
})

test('Inbox → Updates: sort, ✕ one row, Clear all with Undo', async ({ page }) => {
  await page.goto('/inbox')
  await page
    .getByTestId('inbox-tabs')
    .getByRole('radio', { name: /Updates/ })
    .click()
  const rows = page.getByTestId('update-clear')
  await expect(rows.first()).toBeVisible()
  const before = await rows.count()
  await rows.first().click()
  await expect(rows).toHaveCount(before - 1)
  await page.getByTestId('updates-sort').selectOption('group')
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  await page.getByTestId('updates-clear-all').click()
  await expect(rows).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rows).toHaveCount(before - 1)
  // The sort is remembered on this device.
  await page.reload()
  await page
    .getByTestId('inbox-tabs')
    .getByRole('radio', { name: /Updates/ })
    .click()
  await expect(page.getByTestId('updates-sort')).toHaveValue('group')
})

test('no groups yet: Quick add on Home sets up a 1:1 from one name, checked in the group form first', async ({ page }) => {
  await noGroups(page)
  const quick = page.getByTestId('home-quick-add')
  await quick.getByRole('textbox', { name: 'Quick add' }).fill('dinner 1200 with Rahul')
  await quick.getByTestId('home-quick-add-go').click()
  await expect(page).toHaveURL(/\/groups\/new\?.*type=direct/)
  await expect(page).toHaveURL(/people=Rahul/)
  await expect(page).toHaveURL(/next=add/)
})

test('a 1:1 is the friend: no name to type, their face as the icon, no members row', async ({ page }) => {
  await page.goto('/groups/new?type=direct')
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0)
  await page.getByLabel('Name of a person to add').fill('Meera Iyer')
  await page.getByTestId('member-add').click()
  await page.getByRole('button', { name: 'Create 1:1' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Meera Iyer' })).toBeVisible()
  await expect(page.getByTestId('group-people')).toHaveCount(0)
  await page.getByTestId('group-menu').click()
  await expect(page.getByTestId('group-members')).toHaveCount(0)
})

test('no groups yet: the + sheet has Quick add, and a group named in the line is filled in', async ({ page }) => {
  await noGroups(page)
  await page.getByTestId('nav-create').click()
  const quick = page.getByRole('dialog').getByTestId('create-quick-add')
  await quick.getByRole('textbox', { name: 'Quick add' }).fill('Goa trip with Rahul and Priya')
  await quick.getByTestId('create-quick-add-go').click()
  await expect(page).toHaveURL(/\/groups\/new\?/)
  await expect(page.getByLabel(/name/i).first()).toHaveValue('Goa trip')
})

test('no groups yet, Quick add with AI (demo reader): "create a group for my Bali trip with …" makes it after a yes, then Add expense', async ({ page }) => {
  await noGroups(page)
  const quick = page.getByTestId('home-quick-add')
  await quick.getByRole('textbox', { name: 'Quick add' }).fill('Create a group for my Bali trip with Rahul, Priya and Subramaniam')
  await quick.getByTestId('home-quick-add-go').click()
  const ask = page.getByRole('dialog').filter({ hasText: 'Create “Bali Trip”?' })
  await expect(ask).toContainText('you, Rahul, Priya and Subramaniam')
  await ask.getByRole('button', { name: 'Create group' }).click()
  await expect(page).toHaveURL(/\/add\?group=[^&]+$/)
  await expect(page.getByText('Bali Trip', { exact: true })).toBeVisible()
})

test('no groups yet: Add expense explains why, and ✕ goes back', async ({ page }) => {
  await noGroups(page)
  await page.getByTestId('nav-create').click()
  await page.getByTestId('create-expense').click()
  await page.getByTestId('nogroups-close').click()
  await expect(page.getByTestId('first-run')).toBeVisible()
})

test('open items: write one down from a line, then claim it into a prefilled expense', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('tab-open').click()
  await expect(page.getByTestId('open-item-row').first()).toBeVisible()
  await page.getByTestId('open-item-add').click()
  await page.getByTestId('open-item-title').fill('taxi 450 3rd Oct airport')
  await page.getByTestId('open-item-found').click()
  await expect(page.getByTestId('open-item-amount')).toHaveValue(/450/)
  await page.getByTestId('open-item-save').click()
  const row = page.getByTestId('open-item-row').filter({ hasText: /Taxi/i })
  await expect(row).toBeVisible()
  await row.getByTestId('open-item-claim').click()
  await expect(page).toHaveURL(/\/add\?.*open=/)
  await expect(page.getByTestId('claiming-open-item')).toBeVisible()
  await expect(amountField(page)).toHaveValue(/450/)
  await page.getByTestId('expense-save').click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  await page.getByTestId('tab-open').click()
  await expect(page.getByTestId('open-item-row').filter({ hasText: /Taxi/i })).toHaveCount(0)
  await expect(page.getByTestId('open-items-claimed')).toBeVisible()
})

test('group chat: "@" offers the group’s people and the mention is picked out in the message', async ({ page }) => {
  await page.goto('/groups/g_goa/chat')
  await page.getByTestId('chat-input').pressSequentially('thanks @Ro')
  await page.getByTestId('mention-offer').filter({ hasText: '@Rohan' }).click()
  await expect(page.getByTestId('chat-input')).toHaveValue('thanks @Rohan ')
  await page.getByTestId('chat-input').pressSequentially('for the cab')
  await page.getByTestId('chat-send').click()
  const sent = page.getByTestId('chat-message').filter({ hasText: 'thanks @Rohan for the cab' })
  await expect(sent.locator('span.font-semibold', { hasText: '@Rohan' })).toBeVisible()
})

test('group chat: opens from the group, sends a message, posts a Pay me card', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('group-chat').click()
  await expect(page).toHaveURL(/\/groups\/g_goa\/chat$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Goa Trip' })).toBeVisible()
  await expect(page.getByTestId('chat-claim').first()).toBeVisible()
  await page.getByTestId('chat-input').fill('Who paid for the ferry?')
  await page.getByTestId('chat-send').click()
  await expect(page.getByTestId('chat-message').filter({ hasText: 'Who paid for the ferry?' })).toBeVisible()
  await page.getByTestId('chat-tools').click()
  await page.getByTestId('chat-tool-pay').click()
  await page.getByTestId('chat-pay-amount').fill('500')
  await page.getByTestId('chat-pay-send').click()
  await expect(
    page
      .getByTestId('chat-message')
      .filter({ hasText: /Pay me/i })
      .last(),
  ).toBeVisible()
})

test('group chat: / lists the tools, @ tags someone, Settle up asks, reply and edit', async ({ page }) => {
  await page.goto('/groups/g_goa/chat')
  const input = page.getByTestId('chat-input')
  // Slash commands narrow as you type; picking one opens its tool.
  await input.fill('/se')
  await expect(page.getByTestId('chat-commands')).toBeVisible()
  await page.getByTestId('chat-command-settle').click()
  const settle = page.getByTestId('chat-settle-sheet')
  await expect(settle).toBeVisible()
  await settle.getByRole('button', { name: /^Priya/ }).click()
  await settle.getByTestId('chat-settle-send').click()
  await expect(page.getByTestId('chat-card-settle').last()).toContainText('Asked Priya')
  // @ tags: pick from the list.
  await input.fill('thanks @pri')
  await page.getByTestId('chat-mentions').getByRole('option', { name: /Priya/ }).click()
  await expect(input).toHaveValue('thanks @Priya ')
  await page.getByTestId('chat-send').click()
  const tagged = page.getByTestId('chat-message').filter({ hasText: 'thanks @Priya' })
  await expect(tagged).toBeVisible()
  // A line that reads like a tool offers it.
  await input.fill('can everyone settle up by friday')
  await expect(page.getByTestId('chat-suggestion')).toContainText('Ask everyone to settle up')
  await input.fill('')
  // Reply (from the menu), then edit your own message.
  await tagged.getByRole('article').click({ button: 'right' })
  await page.getByTestId('chat-reply').click()
  await expect(page.getByTestId('chat-reply-bar')).toBeVisible()
  await input.fill('see above')
  await page.getByTestId('chat-send').click()
  await expect(
    page
      .getByTestId('chat-message')
      .filter({ hasText: 'see above' })
      .getByRole('button', { name: /Reply to You/ }),
  ).toBeVisible()
  await page.getByTestId('chat-message').filter({ hasText: 'see above' }).getByRole('article').click({ button: 'right' })
  await page.getByTestId('chat-edit').click()
  await input.fill('see the message above')
  await page.getByTestId('chat-send').click()
  await expect(page.getByTestId('chat-message').filter({ hasText: 'see the message above' })).toContainText('edited')
  // The intro only shows on an empty chat; mute is one tap in the header.
  await expect(page.getByTestId('chat-intro')).toHaveCount(0)
  await page.getByTestId('chat-mute').click()
  await expect(page.getByTestId('chat-mute')).toHaveAttribute('aria-pressed', 'true')
  // AI for suggestions: listed under ⓘ (the admin flag is on by default), off, and not in the demo.
  await page.getByTestId('chat-info').click()
  await expect(page.getByTestId('chat-ai-row')).toContainText('not in the demo')
  await expect(page.getByTestId('chat-ai-switch')).toBeDisabled()
})

test('group list: sort by amount or date added, filter expenses only', async ({ page }) => {
  await page.goto('/groups/g_goa')
  // no pills until something is on
  await expect(page.getByTestId('list-pills')).toHaveCount(0)
  await page.getByTestId('list-options-open').click()
  // Sort by starts folded, its choice in the header
  await expect(page.getByTestId('list-sort-summary')).toHaveText('Date spent, newest first')
  await page
    .getByTestId('list-sort')
    .getByRole('button', { name: /Sort by/ })
    .click()
  await page.getByTestId('sort-amount-desc').click()
  await expect(page.getByTestId('list-sort-summary')).toHaveText('Amount, biggest first')
  await page.getByTestId('list-done').click()
  await expect(page.getByRole('heading', { level: 2, name: 'Biggest first' })).toBeVisible()
  await expect(page.getByTestId('list-options-open')).toHaveAccessibleName(/1 on/)
  await expect(page.getByTestId('list-pill')).toHaveText(['Biggest first'])
  await page.getByTestId('list-options-open').click()
  await page
    .getByTestId('list-sort')
    .getByRole('button', { name: /Sort by/ })
    .click()
  await page.getByTestId('sort-added-desc').click()
  await page.getByTestId('list-kind').getByRole('radio', { name: 'Expenses' }).click()
  // Quick filters: one sideways row of chips
  await page.getByTestId('quick-me').click()
  await expect(page.getByTestId('quick-me')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('list-done').click()
  await expect(page.getByTestId('payment-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 2, name: /^Added in/ }).first()).toBeVisible()
  await expect(page.getByTestId('row-added').first()).toContainText('Added')
  await expect(page.getByTestId('list-pill')).toHaveText(['Newest added first', 'Involving me', 'Expenses only'])
  await expect(page.getByTestId('list-options-open')).toHaveAccessibleName(/3 on/)
  // a pill's tap turns just that off
  await page.getByTestId('list-pill').filter({ hasText: 'Expenses only' }).click()
  await expect(page.getByTestId('list-pill')).toHaveText(['Newest added first', 'Involving me'])
  await page.getByTestId('list-options-open').click()
  await page.getByTestId('list-reset').click()
  await page.getByTestId('list-done').click()
  await expect(page.getByTestId('list-pills')).toHaveCount(0)
  await expect(page.getByTestId('expense-row').first()).toBeVisible()
})

test('open items: an icon as an expense’s, with the AI’s pick and its others offered, kept when claimed', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('tab-open').click()
  await page.getByTestId('open-item-add').click()
  const sheet = page.getByTestId('open-item-sheet')
  // the app's own rules don't know it; the demo's stand-in for the AI picks 🇱🇰 and offers 🐝
  await sheet.getByTestId('open-item-title').fill('Sri Lanka bees')
  await expect(sheet.getByTestId('open-item-icon')).toContainText('🇱🇰', { timeout: 6_000 })
  const alt = sheet.getByTestId('open-item-icon-alt')
  await expect(alt).toContainText('🐝')
  await alt.getByRole('button', { name: /use it/ }).click()
  await expect(sheet.getByTestId('open-item-icon')).toContainText('🐝')
  // the AI's first pick stays on offer
  await expect(alt).toContainText('🇱🇰')
  // every icon, a tap away; the category is its own row
  await sheet.getByTestId('open-item-icon').click()
  const icons = page.getByTestId('open-item-icon-sheet')
  await icons.getByTestId('icon-search').fill('kayak')
  await icons.getByRole('radio', { name: 'Icon 🛶' }).click()
  await expect(sheet.getByTestId('open-item-icon')).toContainText('🛶')
  await expect(sheet.getByTestId('open-item-category')).toBeVisible()
  await sheet.getByTestId('open-item-save').click()
  const row = page.getByTestId('open-item-row').filter({ hasText: 'Sri Lanka bees' })
  await expect(row).toContainText('🛶')
  // claimed, the expense starts from its icon
  await row.getByTestId('open-item-claim').click()
  await expect(page.getByTestId('claiming-open-item')).toContainText('🛶')
  await expect(page.getByTestId('expense-icon')).toContainText('🛶')
})

test('chat: the Open item tool has the icon button and every icon', async ({ page }) => {
  await page.goto('/groups/g_goa/chat')
  await page.getByTestId('chat-tools').click()
  await page.getByTestId('chat-tool-open').click()
  const sheet = page.getByTestId('open-item-sheet')
  await sheet.getByTestId('open-item-title').fill('Ferry to Havelock')
  await expect(sheet.getByTestId('open-item-icon')).toContainText('⛴️')
  await sheet.getByTestId('open-item-icon').click()
  await expect(page.getByTestId('open-item-icon-sheet').getByTestId('icon-search')).toBeVisible()
})

test('Quick add: "who paid?" opens the open item sheet in the group, filled in; Rahul-style guesses become “might have paid”', async ({ page }) => {
  await page.goto('/groups/g_goa')
  // inside a group a tap adds an expense; press and hold (here a right click) opens the sheet
  await page.getByTestId('nav-create').click({ button: 'right' })
  const quick = page.getByRole('dialog').getByTestId('create-quick-add')
  await quick.getByRole('textbox', { name: 'Quick add' }).fill('lunch Oct 2 Cafe Blue, maybe Priya paid')
  await quick.getByTestId('create-quick-add-go').click()
  await expect(page).toHaveURL(/\/groups\/g_goa\?tab=open&add=1/)
  const sheet = page.getByTestId('open-item-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId('open-item-title')).toHaveValue('Lunch Cafe Blue')
  await expect(sheet.getByRole('button', { name: /Priya/, pressed: true })).toBeVisible()
  await sheet.getByTestId('open-item-save').click()
  await expect(page.getByTestId('open-item-row').filter({ hasText: 'Lunch Cafe Blue' })).toBeVisible()
})

test('Profile → Emails: add another email, then remove it', async ({ page }) => {
  await page.goto('/profile')
  await page.getByTestId('account-toggle').click()
  await page.getByTestId('add-email').click()
  await page.getByTestId('add-email-input').fill('asha@work.com')
  // Demo mode sends no link: the email is on the account at once.
  await page.getByTestId('add-email-send').click()
  const list = page.getByTestId('account-emails')
  await expect(list).toContainText('asha@work.com')
  await list.getByRole('button', { name: 'Remove asha@work.com' }).click()
  await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Remove' }).click()
  await expect(list).not.toContainText('asha@work.com')
})

test('Profile offers Install Split Now in a browser, with the steps for this browser', async ({ page }) => {
  await page.goto('/profile')
  const row = page.getByTestId('profile-install')
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByRole('dialog')).toContainText(/Install Split Now|Add to/)
})

test('going offline shows the sync note under the header, and it goes once back online', async ({ page, context }) => {
  await context.setOffline(true)
  await expect(page.getByTestId('offline-pill')).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByTestId('offline-pill')).toBeHidden()
})

test('Private group: it can’t be made without a pattern to open it, chosen right in the form', async ({ page }) => {
  const enter = async (p: string) => {
    for (const c of p) await page.getByTestId(c === 'T' ? 'pattern-add-tap' : 'pattern-add-long').click()
  }
  // turned on, with nothing set up yet
  await turnOnPrivateGroups(page)
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Secret plans')
  await page.getByTestId('group-private').click()
  // no universal pattern yet: it starts on its own pattern, which isn't set, so saving is refused
  await expect(page.getByTestId('vault-opens-with').getByRole('radio', { name: 'Its own pattern' })).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('group-save').click()
  await expect(page.getByTestId('group-private-note')).toContainText('Set its own pattern first')
  await expect(page).toHaveURL(/\/groups\/new/)
  // the universal pattern can be set right here instead
  await page.getByTestId('vault-opens-with').getByRole('radio', { name: 'Universal pattern' }).click()
  await expect(page.getByTestId('vault-line-pattern')).toHaveAttribute('data-state', 'missing')
  await page.getByTestId('vault-universal-open').click()
  await enter('TTLTLL')
  await page.getByTestId('vault-set-next').click()
  await enter('TTLTLL')
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-line-pattern')).toHaveAttribute('data-state', 'ready')
  await page.getByTestId('group-save').click()
  await expect(page).toHaveURL(/\/groups\/(?!new)[^/]+$/)
})

test('Private group: someone let in with no way to open it gets its creator a prompt to give it its own pattern', async ({ page }) => {
  const enter = async (p: string) => {
    for (const c of p) await page.getByTestId(c === 'T' ? 'pattern-add-tap' : 'pattern-add-long').click()
  }
  await turnOnPrivateGroups(page)
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Quiet plans')
  await page.getByTestId('group-private').click()
  // opens with the universal pattern, set right here
  await page.getByTestId('vault-opens-with').getByRole('radio', { name: 'Universal pattern' }).click()
  await page.getByTestId('vault-universal-open').click()
  await enter('TTLTLL')
  await page.getByTestId('vault-set-next').click()
  await enter('TTLTLL')
  await page.getByTestId('vault-set-next').click()
  await page.getByTestId('group-save').click()
  await expect(page).toHaveURL(/\/groups\/(?!new)[^/]+$/)
  // Ananya, from another group, comes in at once; she has no universal pattern and it has no own one
  await page.getByTestId('group-menu').click()
  await page.getByTestId('group-members').click()
  await page.getByLabel('Search people').fill('Anan')
  await page.getByRole('button', { name: 'Add Ananya' }).click()
  const prompt = page.getByTestId('confirm-sheet')
  await expect(prompt).toContainText('Ananya can’t open it yet')
  await prompt.getByTestId('confirm-ok').click()
  // straight to its own pattern: the universal one that opens it first, then the new one twice
  await expect(page.getByTestId('vault-set-pattern')).toBeVisible()
  await enter('TTLTLL')
  await page.getByTestId('vault-set-next').click()
  await enter('TLT')
  await page.getByTestId('vault-set-next').click()
  await enter('TLT')
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-set-pattern')).toBeHidden()
  await expect(page.getByTestId('vault-group-sheet')).toBeVisible()
  await expect(page.getByTestId('vault-line-own')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByTestId('vault-waiting')).toHaveCount(0)
})

test('Private groups start off: New group has no Private switch until Settings → Encrypted groups → Turn on', async ({ page }) => {
  const newGroup = async () => {
    await page.goto('/groups/new')
    await page
      .getByRole('radiogroup', { name: 'What are you creating?' })
      .getByRole('radio', { name: /^Group/ })
      .click()
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible()
  }
  await newGroup()
  await expect(page.getByTestId('group-private')).toHaveCount(0)
  // nor Make private in a group's menu
  await page.goto('/groups/g_goa')
  await expect(page.getByRole('heading', { level: 1, name: /Goa Trip/ })).toBeVisible()
  await page.getByTestId('group-menu').click()
  await expect(page.getByTestId('vault-group-open')).toHaveCount(0)
  await page.keyboard.press('Escape')
  // Settings says Off, and Encrypted groups says why, with the way to turn them on
  await page.goto('/settings')
  await expect(page.getByTestId('settings-vault')).toContainText('Off')
  await page.getByTestId('settings-vault').click()
  await expect(page.getByTestId('vault-off')).toBeVisible()
  await expect(page.getByTestId('vault-off')).toContainText('Private groups are off')
  await expect(page.getByTestId('vault-setup-status')).toHaveCount(0)
  await page.getByTestId('vault-turn-on').click()
  // on: the setup card, with nothing set up yet, and the way to stop
  await expect(page.getByTestId('vault-setup-status')).toBeVisible()
  await expect(page.getByTestId('vault-line-pattern')).toHaveAttribute('data-state', 'missing')
  await expect(page.getByTestId('vault-stop')).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByTestId('settings-vault')).toContainText('On')
  await newGroup()
  await expect(page.getByTestId('group-private')).toBeVisible()
})

test('Private groups: stopping hides them, and turning them on again brings them back', async ({ page }) => {
  const enter = async (p = 'TTLTLL') => {
    for (const s of p) await page.getByTestId(s === 'T' ? 'pattern-add-tap' : 'pattern-add-long').click()
  }
  await turnOnPrivateGroups(page)
  await page.getByTestId('vault-universal-open').click()
  await enter()
  await page.getByTestId('vault-set-next').click()
  await enter()
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-line-pattern')).toHaveAttribute('data-state', 'ready')
  // a new private group can take its own pattern as it's made
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await page.getByTestId('group-private').click()
  // with a universal pattern set, it opens with that unless it's given its own
  await expect(page.getByTestId('vault-opens-with').getByRole('radio', { name: 'Universal pattern' })).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('vault-opens-with').getByRole('radio', { name: 'Its own pattern' }).click()
  await expect(page.getByTestId('vault-line-own')).toHaveAttribute('data-state', 'missing')
  await page.getByTestId('vault-own-set').click()
  await enter('TL')
  await page.getByTestId('vault-set-next').click()
  await enter('TL')
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-line-own')).toContainText('Set · in order')
  // stopping: confirm, then the current pattern
  await page.goto('/settings/vault')
  await page.getByTestId('vault-stop').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('vault-set-prompt')).toHaveText('Enter your current pattern')
  await enter()
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-stopped')).toBeVisible()
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible()
  await expect(page.getByTestId('group-private')).toHaveCount(0)
  // starting again: turned on, then a new universal pattern
  await turnOnPrivateGroups(page)
  await expect(page.getByTestId('vault-line-pattern')).toHaveAttribute('data-state', 'missing')
  await page.getByTestId('vault-universal-open').click()
  await enter('LLTTLT')
  await page.getByTestId('vault-set-next').click()
  await enter('LLTTLT')
  await page.getByTestId('vault-set-next').click()
  await expect(page.getByTestId('vault-line-pattern')).toHaveAttribute('data-state', 'ready')
})

test('receipt photos: several attached beside the scanned one, opened full screen, added and removed later', async ({ page }) => {
  // A tiny real PNG (the demo downscales it like any photo).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64')
  // Each a different picture (bytes after the PNG's end are ignored), so the same-picture check lets them in.
  const photo = (n: string) => ({ name: `${n}.png`, mimeType: 'image/png', buffer: Buffer.concat([png, Buffer.from(n)]) })
  await page.goto('/add?group=g_goa')
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Ferry tickets')
  await amountField(page).fill('640')
  // Attach keeps what was typed: nothing is read from the photos
  await page.getByTestId('receipt-attach-file').setInputFiles([photo('a'), photo('b')])
  await expect(page.getByTestId('attached-new')).toHaveCount(2)
  await expect(page.getByTestId('attached-line')).toHaveText('2 of 4 attached')
  await expect(amountField(page)).toHaveValue(/640/)
  // the same picture again isn't added twice
  await page.getByTestId('receipt-attach-file').setInputFiles([photo('a')])
  await expect(page.getByText('That photo is already attached.')).toBeVisible()
  await expect(page.getByTestId('attached-new')).toHaveCount(2)
  // a thumbnail opens full screen
  await page.getByTestId('photo-thumb').first().click()
  await expect(page.getByTestId('photo-viewer')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('photo-viewer')).toHaveCount(0)
  // one picked here can be dropped; three more fill it, and the fifth doesn't fit
  await page.getByTestId('attached-remove').first().click()
  await expect(page.getByTestId('attached-new')).toHaveCount(1)
  await page.getByTestId('receipt-attach-file').setInputFiles([photo('c'), photo('d'), photo('e'), photo('f')])
  await expect(page.getByTestId('attached-new')).toHaveCount(4)
  await expect(page.getByTestId('receipt-attach')).toBeDisabled()
  await page
    .getByRole('button', { name: /^(Save|Add expense)$/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  await page.getByText('Ferry tickets').first().click()
  // folded until tapped; the attached photos are listed apart from a scanned receipt
  await expect(page.getByTestId('receipt-summary')).toHaveText('4 attached photos', { timeout: 15_000 })
  await page.getByTestId('receipt-toggle').click()
  await expect(page.getByTestId('receipt-open-attached')).toHaveCount(4)
  await expect(page.getByTestId('receipt-add-more')).toHaveCount(0)
  // full screen, moving between them; one removed from there
  await page.getByTestId('receipt-open-attached').first().click()
  const viewer = page.getByTestId('photo-viewer')
  await expect(viewer.getByTestId('photo-viewer-label')).toHaveText('Attached photo 1 · 1 of 4')
  await viewer.getByTestId('photo-viewer-next').click()
  await expect(viewer.getByTestId('photo-viewer-label')).toHaveText('Attached photo 2 · 2 of 4')
  await page.keyboard.press('ArrowRight')
  await expect(viewer.getByTestId('photo-viewer-label')).toHaveText('Attached photo 3 · 3 of 4')
  await viewer.getByTestId('photo-viewer-zoom').click()
  await expect(viewer.getByTestId('photo-viewer-zoom')).toHaveAttribute('aria-pressed', 'true')
  await viewer.getByTestId('photo-viewer-remove').click()
  await expect(viewer).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByTestId('receipt-summary')).toHaveText('3 attached photos')
  // room again: one more from the expense's own screen
  await page.getByTestId('receipt-add-more').click()
  await page.getByTestId('receipt-file').setInputFiles(photo('g'))
  await expect(page.getByTestId('receipt-summary')).toHaveText('4 attached photos', { timeout: 15_000 })
})

test('receipt photos: an expense without any takes one from its own screen', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64')
  await page.goto('/add?group=g_goa')
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Scooter rent')
  await amountField(page).fill('900')
  await page
    .getByRole('button', { name: /^(Save|Add expense)$/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  await page.getByText('Scooter rent').first().click()
  await expect(page.getByTestId('receipt-add')).toBeVisible()
  await page.getByTestId('receipt-add').click()
  await page.getByTestId('receipt-file').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByTestId('receipt-summary')).toHaveText('1 attached photo', { timeout: 15_000 })
})

test('icons: an expense picks its own from what it is for, and press and hold opens every icon', async ({ page }) => {
  await page.goto('/add?group=g_goa')
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Ferry to Havelock')
  await amountField(page).fill('640')
  // the automatic icon follows the words, not only the category
  await expect(page.getByTestId('expense-icon')).toContainText('⛴️')
  // a right click is the hold for a mouse (a finger holds, a keyboard has the menu key)
  await page.getByTestId('expense-icon').click({ button: 'right' })
  const sheet = page.getByTestId('icon-sheet')
  await expect(sheet).toBeVisible()
  await sheet.getByTestId('icon-search').fill('kayak')
  await sheet.getByRole('radio', { name: 'Icon 🛶' }).click()
  await expect(page.getByTestId('expense-icon')).toContainText('🛶')
  // a tap is still the category
  await page.getByTestId('expense-icon').click()
  await expect(page.getByTestId('category-icon')).toBeVisible()
  await page.keyboard.press('Escape')
  await page
    .getByRole('button', { name: /^(Save|Add expense)$/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  await page.getByText('Ferry to Havelock').first().click()
  await expect(page.getByTestId('expense-detail-icon')).toContainText('🛶')
  // back to the automatic one, from the expense's own screen
  await page.getByTestId('expense-detail-icon').click()
  await page.getByTestId('icon-auto').click()
  await expect(page.getByTestId('expense-detail-icon')).toContainText('⛴️')
})

test('icons: a group name suggests a telling icon, and every icon is a search away', async ({ page }) => {
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  // the name settles the type (trip) and a telling word the icon
  await page.getByLabel('Name', { exact: true }).fill('Ski trip')
  await expect(page.getByTestId('group-icon')).toContainText('🎿')
  // a tap opens every icon
  await page.getByTestId('group-icon').click()
  const sheet = page.getByTestId('group-icon-sheet')
  await sheet.getByTestId('icon-search').fill('camp')
  await sheet.getByRole('radio', { name: 'Icon 🏕️' }).click()
  await expect(page.getByTestId('group-icon')).toContainText('🏕️')
})

test('icons: Suggest with AI offers emoji and drawn icons, and a drawn one shows as the icon', async ({ page }) => {
  await page.goto('/add?group=g_goa')
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Ferry to Havelock')
  await amountField(page).fill('640')
  await page.getByTestId('expense-icon').click({ button: 'right' })
  const sheet = page.getByTestId('icon-sheet')
  // AI waits for search words: none before typing
  await expect(sheet.getByTestId('icon-search')).toBeVisible()
  await expect(sheet.getByTestId('icon-ai')).toHaveCount(0)
  // words with icons: AI comes after a pause without a pick
  await sheet.getByTestId('icon-search').fill('kayak')
  await expect(sheet.getByTestId('icon-ai-suggest')).toContainText('“kayak”', { timeout: 6_000 })
  // words with no icon: straight away, for those words
  await sheet.getByTestId('icon-search').fill('anchor')
  await expect(sheet.getByTestId('icon-none')).toBeVisible()
  await expect(sheet.getByTestId('icon-ai-suggest')).toContainText('“anchor”', { timeout: 1_500 })
  await sheet.getByTestId('icon-ai-suggest').click()
  await expect(sheet.getByTestId('icon-ai-emoji')).toHaveCount(3)
  await expect(sheet.getByTestId('icon-ai-svg').first()).toBeVisible()
  await sheet.getByTestId('icon-ai-svg').first().click()
  await expect(page.getByTestId('expense-icon').locator('img')).toBeVisible()
  await page
    .getByRole('button', { name: /^(Save|Add expense)$/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  await page.getByText('Ferry to Havelock').first().click()
  await expect(page.getByTestId('expense-detail-icon').locator('img')).toBeVisible()
  // an emoji pick drops the drawing
  await page.getByTestId('expense-detail-icon').click()
  await page.getByTestId('icon-sheet').getByTestId('icon-search').fill('anchor')
  await page.getByTestId('icon-auto').click()
  await expect(page.getByTestId('expense-detail-icon').locator('img')).toHaveCount(0)
})

test('icons: when the app can’t tell, Automatic asks AI for one of its own icons', async ({ page }) => {
  await page.goto('/add?group=g_goa')
  // "Parasail" matches no rule; the demo's stand-in for the AI finds 🪂 (and a category, still Other)
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Parasail')
  await amountField(page).fill('1500')
  await expect(page.getByTestId('expense-icon')).toContainText('🪂', { timeout: 6_000 })
  await page.getByTestId('expense-icon').click({ button: 'right' })
  // still Automatic, now showing the pick
  await expect(page.getByTestId('icon-auto')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('icon-auto')).toContainText('🪂')
  await page.keyboard.press('Escape')
  await page
    .getByRole('button', { name: /^(Save|Add expense)$/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  await page.getByText('Parasail').first().click()
  await expect(page.getByTestId('expense-detail-icon')).toContainText('🪂')
  await page.getByTestId('expense-detail-icon').click()
  await expect(page.getByTestId('icon-auto')).toHaveAttribute('aria-pressed', 'true')
})

test('icons: a group name the app can’t tell gets its icon from AI', async ({ page }) => {
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Parasail')
  await expect(page.getByTestId('group-icon')).toContainText('🪂', { timeout: 6_000 })
})

test('icons: a group takes a drawn icon', async ({ page }) => {
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Goa trip')
  await page.getByTestId('group-icon').click()
  const sheet = page.getByTestId('group-icon-sheet')
  await sheet.getByTestId('icon-search').fill('anchor')
  await sheet.getByTestId('icon-ai-suggest').click()
  await sheet.getByTestId('icon-ai-svg').first().click()
  await expect(page.getByTestId('group-icon').locator('img')).toBeVisible()
  const member = page.getByPlaceholder('Name', { exact: true })
  await member.fill('Dev')
  await member.press('Enter')
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page).toHaveURL(/\/groups\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 1, name: /Goa trip/ })).toBeVisible()
  await expect(page.locator('main img[src^="data:image/svg+xml"]').first()).toBeVisible()
})

test.describe('Draw a picture prices', () => {
  // A fixed dollar rate, so the price shows in rupees first (page.route can't see service-worker requests).
  // In India, so the demo's currency is rupees wherever the suite runs (CI is in UTC, en-US: dollars).
  test.use({ serviceWorkers: 'block', fixedRates: true, timezoneId: 'Asia/Kolkata' })

  test('icons: Draw a picture says who pays, and the picture becomes the icon', async ({ page }) => {
    await page.goto('/add?group=g_goa')
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Sunset cruise')
    await amountField(page).fill('900')
    await page.getByTestId('expense-icon').click({ button: 'right' })
    const sheet = page.getByTestId('icon-sheet')
    await sheet.getByTestId('icon-search').fill('anchor')
    await expect(sheet.getByTestId('icon-picture-draw')).toContainText('“anchor”')
    await expect(sheet.getByTestId('icon-picture-note')).toContainText('Split Now')
    await sheet.getByTestId('icon-picture-draw').click()
    // the picture says which model drew it, and what that cost
    await expect(sheet.getByTestId('icon-picture-by')).toContainText('Nano Banana 2 Lite')
    // the price in the person's money first (rupees in the demo), Google's dollars after
    await expect(sheet.getByTestId('icon-picture-by')).toContainText(/₹[\d.]+ \(US\$0\.03\)/)
    await sheet.getByTestId('icon-picture-use').click()
    await expect(page.getByTestId('expense-icon').locator('img')).toHaveAttribute('src', /^data:image\/(webp|png);base64,/)
    // the magenta backdrop is keyed out and the object cropped to fill the icon
    const src = await page.getByTestId('expense-icon').locator('img').getAttribute('src')
    const alpha = await page.evaluate(async (url) => {
      const img = new Image()
      img.src = url ?? ''
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d') as CanvasRenderingContext2D
      ctx.drawImage(img, 0, 0)
      const at = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data
      const mid = Math.floor(img.width / 2)
      return { corner: at(1, 1)[3], middle: at(mid, mid)[3] }
    }, src)
    expect(alpha.corner).toBe(0)
    expect(alpha.middle).toBeGreaterThan(200)
    await page
      .getByRole('button', { name: /^(Save|Add expense)$/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/groups\/g_goa$/)
    await page.getByText('Sunset cruise').first().click()
    await expect(page.getByTestId('expense-detail-icon').locator('img')).toHaveAttribute('src', /^data:image\/(webp|png|jpeg)/)
  })
})

test('help: Profile → Help finds a feature, plays its steps and goes there', async ({ page }) => {
  await page.getByRole('navigation').getByRole('link', { name: 'Profile' }).click()
  await page.getByTestId('profile-help').click()
  await expect(page).toHaveURL(/\/help$/)
  await expect(page.getByTestId('help-core-card')).toHaveCount(10)
  // search by a word that's only in a section's keywords
  await page.getByTestId('help-search').fill('refund')
  await page.getByTestId('help-results').getByTestId('help-row').first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Money received' })).toBeVisible()
  // a main feature: the scene and its steps; a tap on a step goes there
  await page.goto('/help/add-expense')
  await expect(page.getByTestId('help-scene')).toBeVisible()
  const steps = page.getByTestId('help-step')
  await expect(steps).toHaveCount(7)
  await steps.nth(3).click()
  await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('help-play')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('help-next').click()
  await expect(steps.nth(4)).toHaveAttribute('aria-current', 'step')
  // steps already shown are ticked off
  await expect(steps.nth(0)).toContainText('done')
  // the real screen, as a picture: opened on request, the current step lit, nothing in it to tap
  await page.getByTestId('help-shot-panel').getByRole('button').first().click()
  await expect(page.getByTestId('help-shot').locator('img')).toBeVisible()
  await expect(page.getByTestId('help-shot').getByRole('button')).toHaveCount(0)
  await expect(page.getByTestId('help-shot').locator('[data-on]')).toHaveCount(1)
  await page.getByTestId('help-try').click()
  await expect(page).toHaveURL(/\/add/)
})

test('help: a section that isn’t a main feature plays its own steps too', async ({ page }) => {
  await page.goto('/help/private-groups-setup')
  await expect(page.getByTestId('help-scene')).toBeVisible()
  await expect(page.getByTestId('help-step')).toHaveCount(5)
  await page.getByTestId('help-next').click()
  await expect(page.getByTestId('help-step').nth(1)).toHaveAttribute('aria-current', 'step')
})

test('help: How it works opens an explainer whose picture follows the caption', async ({ page }) => {
  await page.goto('/help')
  await expect(page.getByTestId('help-story-card')).toHaveCount(6)
  await page.getByTestId('help-story-card').first().click()
  await expect(page).toHaveURL(/\/help\/how-it-works$/)
  await expect(page.getByTestId('help-story')).toBeVisible()
  const beats = page.getByTestId('help-beat')
  await expect(beats).toHaveCount(4)
  await beats.nth(2).click()
  await expect(beats.nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('help-story')).toHaveAttribute('data-beat', '2')
  await expect(page.getByTestId('help-play')).toHaveAttribute('aria-pressed', 'false')
})

test('help: What’s new lists this version first and links each line to the guide', async ({ page }) => {
  await page.goto('/help?tab=new')
  const releases = page.getByTestId('release')
  await expect(releases.first()).toBeVisible()
  // the newest release says so
  await expect(releases.first().getByTestId('release-latest')).toHaveText('Latest')
  await expect(page.getByTestId('release-latest')).toHaveCount(1)
  expect(await releases.count()).toBeGreaterThan(5)
  await releases.first().getByTestId('release-item').first().click()
  await expect(page).toHaveURL(/\/help\/[a-z-]+$/)
  await expect(page.getByTestId('help-section')).toBeVisible()
})

test('help: after an update, Home says so once, and What’s new opens it', async ({ page }) => {
  // this phone last saw an older version
  await page.evaluate(() => {
    localStorage.setItem('splitnow:whats-new-banner', '8.0.0')
    localStorage.setItem('splitnow:whats-new-seen', '8.0.0')
  })
  await page.reload()
  await expect(page.getByTestId('whats-new-banner')).toBeVisible()
  await page.getByTestId('whats-new-open').click()
  await expect(page).toHaveURL(/\/help\?tab=new$/)
  await expect(page.getByTestId('release').first()).toContainText('New')
  await page.goto('/')
  await expect(page.getByTestId('home-greeting')).toBeVisible()
  await expect(page.getByTestId('whats-new-banner')).toHaveCount(0)
})

test('What’s new rises above the tab bar a moment after Home loads, and a sideways swipe closes it for good', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('splitnow:whats-new-banner', '8.0.0')
    localStorage.setItem('splitnow:whats-new-seen', '8.0.0')
  })
  await page.reload()
  await expect(page.getByTestId('home-greeting')).toBeVisible()
  // not straight away: the page shows itself first
  await expect(page.getByTestId('whats-new-banner')).toHaveCount(0)
  const banner = page.getByTestId('whats-new-banner')
  await expect(banner).toBeVisible()
  // measured once it has finished rising: mid-animation the drag would start below it
  await banner.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  // in the floating lane above the tab bar, not at the top of the page
  const box = await banner.boundingBox()
  const vh = page.viewportSize()?.height ?? 0
  expect(box && box.y > vh / 2).toBe(true)
  // a short drag springs back; a long one closes it
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2
  const x = (box?.x ?? 0) + 40
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 30, y, { steps: 5 })
  await page.mouse.up()
  await expect(banner).toBeVisible()
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 260, y, { steps: 10 })
  await page.mouse.up()
  await expect(banner).toHaveCount(0)
  // nothing was tapped on the way (What's new stayed shut), and it stays closed
  await expect(page).toHaveURL(/\/$/)
  await page.reload()
  await expect(page.getByTestId('home-greeting')).toBeVisible()
  await page.waitForTimeout(1500)
  await expect(banner).toHaveCount(0)
})

test('a toast can be swiped away sideways', async ({ page }) => {
  await page.goto('/groups/g_goa')
  await page.getByTestId('tab-open').click()
  await page.getByTestId('open-item-add').click()
  await page.getByTestId('open-item-title').fill('Taxi to the fort')
  await page.getByTestId('open-item-save').click()
  const toast = page.getByTestId('toasts').getByText('Added to open items')
  await expect(toast).toBeVisible()
  const box = await toast.boundingBox()
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2
  const x = box?.x ?? 0
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 220, y, { steps: 10 })
  await page.mouse.up()
  // gone well before it would have faded on its own
  await expect(toast).toHaveCount(0, { timeout: 1500 })
})

test('Home: the header stays at the top and says the balance once the card scrolls away', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await expect(page.getByTestId('home-header-balance')).toHaveCount(0)
  await page.getByRole('button', { name: /Recent (activity|expenses)/ }).click()
  // scrolled to the end once Recent activity has opened (it grows while it opens)
  await expect(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(page.getByTestId('home-header-balance')).toContainText(/You’re owed|You owe|All settled up|Nothing owed/, { timeout: 500 })
  }).toPass()
  const box = await page.getByTestId('home-greeting').boundingBox()
  expect(box && box.y <= 1).toBe(true)
  await page.getByTestId('home-header-balance').click()
  await expect(page).toHaveURL(/\/settle$/)
})

test('Home: Recent activity starts folded, opens smoothly, and says how many are new', async ({ page }) => {
  await page.goto('/')
  const section = page.getByTestId('home-recent')
  await expect(section).toBeVisible()
  const header = section.getByRole('button', { name: /Recent/ })
  await expect(header).toHaveAttribute('aria-expanded', 'false')
  // something new since the last look: an older "seen" time makes the demo's entries new
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('splitnow:recent-seen')) localStorage.setItem(k, '1')
  })
  await page.reload()
  await expect(section.getByTestId('home-recent-unread')).toBeVisible()
  await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
  await expect(section.getByRole('region')).toBeVisible()
  // opened: read, so the count is gone next time
  await page.reload()
  await expect(section.getByTestId('home-recent-unread')).toHaveCount(0)
})

test('receipt photos: the scanned receipt leads the strip with a badge, and a new scan asks first', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64')
  const photo = (n: string) => ({ name: `${n}.png`, mimeType: 'image/png', buffer: Buffer.concat([png, Buffer.from(n)]) })
  await page.goto('/add?group=g_goa')
  await page.getByTestId('receipt-attach-file').setInputFiles([photo('slip')])
  await expect(page.getByTestId('attached-new')).toHaveCount(1)
  // a scan: it can't read this tiny picture, so it keeps it as the scanned receipt (first, badged)
  await page.locator('input[type=file][capture]').setInputFiles([photo('bill')])
  await expect(page.getByTestId('receipt-attached')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('photo-thumb').first()).toHaveAccessibleName('Open scanned receipt')
  await expect(page.getByTestId('scan-badge')).toBeVisible()
  await expect(page.getByTestId('attached-line')).toHaveText('Scanned receipt + 1 of 4 attached')
  // attaching the scanned receipt again isn't allowed: it's already here
  await page.getByTestId('receipt-attach-file').setInputFiles([photo('bill')])
  await expect(page.getByText('That photo is already here as the scanned receipt.')).toBeVisible()
  await expect(page.getByTestId('attached-new')).toHaveCount(1)
  // scanning again asks first, and Cancel keeps it
  await page.getByTestId('receipt-scan').click()
  const ask = page.getByRole('dialog').filter({ hasText: 'Scan another receipt?' })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Cancel' }).click()
  // crossing the scanned receipt out keeps what's in the form
  await page.getByTestId('receipt-remove').click()
  await expect(page.getByTestId('receipt-attached')).toHaveCount(0)
  await expect(page.getByTestId('attached-line')).toHaveText('1 of 4 attached')
})

test('delete my account in demo mode: refused while money is owed, then the word, then back to the start', async ({ page }) => {
  await page.goto('/settings/data')
  await page.getByTestId('settings-delete-account').click()
  await expect(page).toHaveURL(/\/settings\/delete-account$/)
  // The seeded groups have money owed in them.
  await expect(page.getByTestId('delete-account-blockers')).toBeVisible()
  await page.getByTestId('delete-account-typed').fill('delete')
  await expect(page.getByTestId('delete-account-run')).toBeDisabled()
  await noGroups(page)
  await page.goto('/settings/delete-account')
  await expect(page.getByTestId('delete-account-plan')).toContainText('not in any groups')
  const run = page.getByTestId('delete-account-run')
  await expect(run).toBeDisabled()
  await page.getByTestId('delete-account-typed').fill('delete')
  await run.click()
  await expect(page.getByTestId('demo-name').or(page.getByTestId('demo-start')).first()).toBeVisible()
})

test('New group: a type chosen after the AI’s icon keeps it, and offers the type’s icon instead', async ({ page }) => {
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Sri Lanka bees')
  await expect(page.getByTestId('group-icon')).toContainText('🇱🇰')
  await page
    .getByRole('radiogroup', { name: 'Type' })
    .getByRole('radio', { name: /Dinner/ })
    .click()
  // the name's icon stays; the type's is offered
  await expect(page.getByTestId('group-icon')).toContainText('🇱🇰')
  const typeIcon = page.getByTestId('group-icon-type')
  await expect(typeIcon).toContainText('Dinner')
  await typeIcon.getByRole('button', { name: /use it/ }).click()
  await expect(page.getByTestId('group-icon')).toContainText('🍽️')
  await expect(typeIcon).toHaveCount(0)
})

test('Edit group: a new name brings a new icon, the AI’s second one, and Keep for the old one; the type stays', async ({ page }) => {
  await page.goto('/groups/g_goa/edit')
  const name = page.getByLabel('Name', { exact: true })
  await expect(name).toHaveValue('Goa Trip')
  await expect(page.getByTestId('group-icon')).toContainText('🏖️')
  await name.fill('Sri Lanka bees')
  await expect(page.getByTestId('group-icon')).toContainText('🇱🇰')
  await expect(page.getByTestId('group-icon-alt')).toContainText('🐝')
  await expect(page.getByRole('radiogroup', { name: 'Type' }).getByRole('radio', { name: /Trip/ })).toHaveAttribute('aria-checked', 'true')
  const keep = page.getByTestId('group-icon-keep')
  await expect(keep).toContainText('🏖️')
  await keep.getByRole('button', { name: /Keep/ }).click()
  await expect(page.getByTestId('group-icon')).toContainText('🏖️')
  await expect(keep).toHaveCount(0)
  // chosen now: typing on doesn't change it again
  await name.fill('Sri Lanka bees again')
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('group-icon')).toContainText('🏖️')
})

test('New group: a name the app’s own icons don’t cover gets an AI pick from any emoji, with others offered', async ({ page }) => {
  await page.goto('/groups/new')
  await page
    .getByRole('radiogroup', { name: 'What are you creating?' })
    .getByRole('radio', { name: /^Group/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Sri Lanka bees')
  // the demo's stand-in for the AI answers after the typing pause: a flag that isn't one of the app's icons, and 🐝 to switch to
  await expect(page.getByTestId('group-icon')).toContainText('🇱🇰')
  const alt = page.getByTestId('group-icon-alt')
  await expect(alt).toContainText('🐝')
  await alt.getByRole('button', { name: /use it/ }).click()
  await expect(page.getByTestId('group-icon')).toContainText('🐝')
  // the AI's first pick stays on offer, to go back to
  await expect(alt).toContainText('🇱🇰')
})

test('New people need my OK: the creator turns it on in Approvals, and it is kept', async ({ page }) => {
  await page.goto('/groups/g_goa/edit')
  const approvals = page.getByTestId('group-approvals')
  await expect(approvals).toContainText('Off')
  await approvals.getByRole('button', { name: /Approvals/ }).click()
  await page.getByTestId('group-approve-joins').click()
  await expect(page.getByTestId('group-approve-joins')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('group-save').click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)

  await page.goto('/groups/g_goa/edit')
  await expect(page.getByTestId('group-approvals')).toContainText('New people')
  await page
    .getByTestId('group-approvals')
    .getByRole('button', { name: /Approvals/ })
    .click()
  await expect(page.getByTestId('group-approve-joins')).toHaveAttribute('aria-checked', 'true')
  // and off again
  await page.getByTestId('group-approve-joins').click()
  await page.getByTestId('group-save').click()
  await expect(page).toHaveURL(/\/groups\/g_goa$/)
  await page.goto('/groups/g_goa/edit')
  await expect(page.getByTestId('group-approvals')).toContainText('Off')
})

test('New people need my OK: someone else’s group asks instead of joining, and the demo says it needs the online app', async ({ page }) => {
  // A group made by someone else, that you're not in, with the setting on.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('splitit-demo-v1') ?? '{}')
    const goa = s.groups.g_goa
    s.groups.g_ask = {
      ...goa,
      id: 'g_ask',
      name: 'Pune weekend',
      inviteCode: 'ASKJOIN1',
      createdBy: 'seed_ananya',
      memberUids: ['seed_ananya'],
      members: { p_ananya: goa.members.p_ananya, p_priya: goa.members.p_priya },
      approveJoins: true,
    }
    localStorage.setItem('splitit-demo-v1', JSON.stringify(s))
  })
  await page.reload()
  await page.goto('/join/ASKJOIN1')
  await expect(page.getByTestId('join-approval')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join Pune weekend')
  // nobody in it is named, and there's no "which one is you"
  await expect(page.getByTestId('join-approval')).not.toContainText('Priya')
  await page.getByTestId('join-ask').click()
  await expect(page.getByTestId('toasts')).toContainText('needs the online app')
})
