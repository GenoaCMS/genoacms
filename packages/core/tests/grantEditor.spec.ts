import { expect, test, type Locator, type Page } from '@playwright/test'
import credentials from '../genoa.config/gcp/authCredentials.js'

/**
 * The grant editor, driven through a real browser.
 *
 * **Why this suite exists.** The editor's conversion logic is unit-tested and every component
 * type-checks, and both passed while the entire screen was inert: a Skeleton `Switch` renders its
 * visible parts as decoration and its *hidden input* as the actual control, so omitting
 * `Switch.HiddenInput` produces a switch that looks right, compiles, passes `svelte-check`, and
 * cannot be clicked. Only clicking it in a browser catches that.
 *
 * **Nothing is submitted.** Every assertion reads the editor's hidden `grants` field, which is
 * derived from the rows as they are edited. That exercises the whole interactive surface without
 * writing a role to the instance — these tests run against real infrastructure.
 *
 * **Locators follow the rendered DOM, not the component names.** Zag renders a switch as a `<label>`
 * wrapping a visually hidden `<input type="checkbox">`, so its role is `checkbox`, and combobox
 * content is portalled to `<body>` rather than nested in the dialog. The open listbox is still
 * addressed by its state rather than by position: that is cheap, and it does not depend on only one
 * modal's contents being mounted at a time.
 */

const [account] = credentials

/** The only bucket declared for this instance beside the public one. */
const BUCKET = 'genoacms'
/** The only collection declared for this instance, and one of its fields. */
const COLLECTION = 'test'
const FIELD = 'name'

const signIn = async (page: Page): Promise<void> => {
  await page.goto('/login')
  await page.locator('input[name="username"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

/** Opens the role editor with one blank grant row, and returns the dialog. */
const openNewRole = async (page: Page): Promise<Locator> => {
  await page.goto('/configuration/iam')
  await expect(page.getByRole('heading', { name: 'Roles and access' })).toBeVisible()
  await page.getByRole('button', { name: 'New role' }).click()

  const dialog = page.getByRole('dialog', { name: 'New role' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** The grants the open editor would submit right now. */
const composedGrants = async (dialog: Locator): Promise<unknown[]> =>
  JSON.parse(await dialog.locator('input[name="grants"]').inputValue())

/**
 * Chooses a permission from the open category, by the permission itself.
 *
 * Addressed by `data-value` rather than by label: labels are trimmed of the segments their group
 * shares, so `pages:read` and `components:prebuilt:read` both read as "read" in the content
 * category. The permission string is what the grant will actually carry.
 *
 * The list is portalled out of the dialog rather than nested in it, so it is addressed by its own
 * state rather than through the dialog.
 */
const choosePermission = async (dialog: Locator, permission: string, row = 0): Promise<void> => {
  const page = dialog.page()
  await dialog.getByPlaceholder('Select permission...').nth(row).click()
  await page.locator(`[role="listbox"][data-state="open"] [role="option"][data-value="${permission}"]`)
    .click()
}

/**
 * The switch's checkbox, for asserting state.
 *
 * Not for clicking: the input is visually hidden beneath its own label, so a click on it is
 * refused as obscured — which is also true for a real user, who clicks the label.
 */
const switchState = (scope: Locator, name: string): Locator =>
  scope.getByRole('checkbox', { name, exact: true })

/**
 * The switch's label, which is what a user actually clicks.
 *
 * Anchored so that `genoacms` does not also match `genoacms-public`, and whitespace-tolerant
 * because the label's `textContent` includes the control's own empty spans.
 */
const switchNamed = (scope: Locator, name: string): Locator =>
  scope.locator('label[data-scope="switch"]')
    .filter({ hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\s*$`) })

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('the permission combobox opens and selects', async ({ page }) => {
  const dialog = await openNewRole(page)
  await choosePermission(dialog, 'storage:bucket:read')

  // Storage is the first category, so this is storage:bucket:read. The row stays incomplete until a
  // resource is named, which is the intended prompt.
  await expect(dialog.getByText('Applies to')).toBeVisible()
  expect(await composedGrants(dialog)).toEqual([])
})

test('a bucket switch is clickable and becomes a grant', async ({ page }) => {
  const dialog = await openNewRole(page)
  await choosePermission(dialog, 'storage:bucket:read')

  // The bug this suite was written for: the switch rendered, and clicking it did nothing.
  await switchNamed(dialog, BUCKET).click()
  await expect(switchState(dialog, BUCKET)).toBeChecked()

  expect(await composedGrants(dialog)).toEqual([
    { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: BUCKET } }
  ])
})

test('several buckets in one row become several grants', async ({ page }) => {
  const dialog = await openNewRole(page)
  await choosePermission(dialog, 'storage:bucket:read')

  await switchNamed(dialog, BUCKET).click()
  await switchNamed(dialog, `${BUCKET}-public`).click()

  expect(await composedGrants(dialog)).toEqual([
    { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: BUCKET } },
    { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: `${BUCKET}-public` } }
  ])
})

test('"any bucket" is off by default and switches to the wildcard', async ({ page }) => {
  const dialog = await openNewRole(page)
  await choosePermission(dialog, 'storage:bucket:read')

  await expect(switchState(dialog, 'Any bucket')).not.toBeChecked()

  await switchNamed(dialog, 'Any bucket').click()
  expect(await composedGrants(dialog)).toEqual([
    { permission: 'storage:bucket:read', resource: '*' }
  ])
})

test('an instance-scoped permission needs no resource', async ({ page }) => {
  const dialog = await openNewRole(page)

  await dialog.getByRole('tab', { name: 'Content' }).click()
  await choosePermission(dialog, 'pages:read')

  expect(await composedGrants(dialog)).toEqual([
    { permission: 'pages:read', resource: '*' }
  ])
})

test('a collection read grant offers clickable field switches', async ({ page }) => {
  const dialog = await openNewRole(page)

  await dialog.getByRole('tab', { name: 'Database' }).click()
  await choosePermission(dialog, 'db:collection:read')
  await switchNamed(dialog, COLLECTION).click()

  // Fields appear only once the collection they belong to is named.
  await expect(switchNamed(dialog, 'Every field')).toBeVisible()
  await expect(switchState(dialog, 'Every field')).not.toBeChecked()

  await switchNamed(dialog, FIELD).click()
  expect(await composedGrants(dialog)).toEqual([
    {
      permission: 'db:collection:read',
      resource: { scope: 'collection', id: COLLECTION },
      fields: [FIELD]
    }
  ])
})

test('"every field" is the unrestricted case, recorded by absence', async ({ page }) => {
  const dialog = await openNewRole(page)

  await dialog.getByRole('tab', { name: 'Database' }).click()
  await choosePermission(dialog, 'db:collection:read')
  await switchNamed(dialog, COLLECTION).click()
  await switchNamed(dialog, 'Every field').click()

  expect(await composedGrants(dialog)).toEqual([
    { permission: 'db:collection:read', resource: { scope: 'collection', id: COLLECTION } }
  ])
})

test('read and write carry their field lists independently', async ({ page }) => {
  const dialog = await openNewRole(page)

  // "May see the price but not change it", which is the case field selection exists for.
  await dialog.getByRole('tab', { name: 'Database' }).click()
  await choosePermission(dialog, 'db:collection:read')
  await switchNamed(dialog, COLLECTION).click()
  await switchNamed(dialog, 'Every field').click()

  // A new row starts on the first category, so it needs its own tab click.
  await dialog.getByRole('button', { name: 'Add grant' }).click()
  await dialog.getByRole('tab', { name: 'Database' }).nth(1).click()
  await choosePermission(dialog, 'db:collection:write', 1)

  // The second row's controls: the first row has "every field" on, so it renders no field switches.
  await switchNamed(dialog, COLLECTION).nth(1).click()
  await switchNamed(dialog, FIELD).click()

  expect(await composedGrants(dialog)).toEqual([
    { permission: 'db:collection:read', resource: { scope: 'collection', id: COLLECTION } },
    {
      permission: 'db:collection:write',
      resource: { scope: 'collection', id: COLLECTION },
      fields: [FIELD]
    }
  ])
})

/**
 * Reopening an editor must show the role as it currently stands.
 *
 * Unlike every other test in this file, these **write**: the bug only appears once a save has
 * reloaded the page data, so it cannot be reproduced without saving. They create a role of their
 * own rather than editing an existing one, and remove it again afterwards.
 */
test.describe('reopening an editor', () => {
  const ROLE = 'e2e-grant-reload'

  /** The temporary role's card, identified by its heading rather than by any text containing it. */
  const roleCard = (page: Page): Locator =>
    page.locator('.card').filter({ has: page.getByRole('heading', { name: ROLE, exact: true }) })

  /** Removes the temporary role, whether or not the test that created it got that far. */
  const removeRole = async (page: Page): Promise<void> => {
    await page.goto('/configuration/iam')
    if (await roleCard(page).count() === 0) return

    await roleCard(page).getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Yes' }).click()
    await expect(roleCard(page)).toHaveCount(0)
  }

  const createRole = async (page: Page): Promise<void> => {
    const dialog = await openNewRole(page)
    await dialog.getByPlaceholder('Copywriter').fill(ROLE)
    await choosePermission(dialog, 'storage:bucket:read')
    await switchNamed(dialog, BUCKET).click()
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog).toBeHidden()
  }

  /** The editor for the temporary role, opened fresh. */
  const openRole = async (page: Page): Promise<Locator> => {
    await roleCard(page).getByRole('button', { name: 'Edit' }).click()

    const dialog = page.getByRole('dialog', { name: `Grants of ${ROLE}` })
    await expect(dialog).toBeVisible()
    return dialog
  }

  test.afterEach(async ({ page }) => {
    await removeRole(page)
  })

  test('loads the saved grants without a page refresh', async ({ page }) => {
    await createRole(page)

    // The bug: the editor seeds its rows once, at mount, so after a save reloaded the page data it
    // kept showing the state it was built with. A refresh hid it by remounting everything.
    const dialog = await openRole(page)
    expect(await composedGrants(dialog)).toEqual([
      { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: BUCKET } }
    ])
  })

  test('loads them again after a second save', async ({ page }) => {
    await createRole(page)

    const first = await openRole(page)
    await switchNamed(first, `${BUCKET}-public`).click()
    await first.getByRole('button', { name: 'Save' }).click()
    await expect(first).toBeHidden()

    const second = await openRole(page)
    expect(await composedGrants(second)).toEqual([
      { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: BUCKET } },
      { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: `${BUCKET}-public` } }
    ])
  })
})

test('a new role starts blank when reopened after being abandoned', async ({ page }) => {
  // The same staleness in the other direction: rows left behind by an edit that was never saved
  // must not reappear as though they had been.
  const dialog = await openNewRole(page)
  await choosePermission(dialog, 'storage:bucket:read')
  await switchNamed(dialog, BUCKET).click()

  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()

  const reopened = await openNewRole(page)
  expect(await composedGrants(reopened)).toEqual([])
})

test('adding and removing rows works', async ({ page }) => {
  const dialog = await openNewRole(page)
  await choosePermission(dialog, 'storage:bucket:read')
  await switchNamed(dialog, BUCKET).click()

  await dialog.getByRole('button', { name: 'Add grant' }).click()
  expect(await composedGrants(dialog)).toHaveLength(1)

  await dialog.getByRole('button', { name: 'Remove grant' }).first().click()
  expect(await composedGrants(dialog)).toEqual([])
})
