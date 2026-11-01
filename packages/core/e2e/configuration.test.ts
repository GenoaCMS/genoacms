import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Locator, Page } from 'playwright'
import { startServer, type RunningServer, type User } from './server'
import { enabled, removeInstance } from './bucket'
import { launchBrowser, closeBrowser, signedInSession, type Session } from './browser'

const password = (): string => randomBytes(18).toString('base64url')
const run = randomBytes(4).toString('hex')

const ada: User = { subject: 'e2e-ada', email: 'ada@e2e.test', password: password() }
const carol: User = { subject: 'e2e-carol', email: 'carol@e2e.test', password: password() }

const SETUP_TIMEOUT_MS = 300_000
const TEARDOWN_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 120_000
const SLOW_MS = 30_000
const BUCKET = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'
const ROLE = `e2e-role-${run}`
const KEY_ID = /^[0-9a-z]/i

let server: RunningServer
let session: Session

const shown = async (locator: Locator): Promise<void> => { await locator.first().waitFor({ state: 'visible', timeout: SLOW_MS }) }
const hidden = async (locator: Locator): Promise<void> => { await locator.waitFor({ state: 'hidden', timeout: SLOW_MS }) }
const button = (scope: Page | Locator, name: string | RegExp): Locator => scope.getByRole('button', { name })

async function visit (page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

const switchNamed = (scope: Locator, name: string): Locator =>
  scope.locator('label[data-scope="switch"]').filter({ hasText: new RegExp(`^\\s*${escaped(name)}\\s*$`) })

const switchState = (scope: Locator, name: string): Locator => scope.getByRole('checkbox', { name, exact: true })

const grantsOf = async (dialog: Locator): Promise<unknown[]> =>
  JSON.parse(await dialog.locator('input[name="grants"]').inputValue()) as unknown[]

async function openNewRole (page: Page): Promise<Locator> {
  await visit(page, '/configuration/iam')
  await button(page, 'New role').click()
  const dialog = page.getByRole('dialog', { name: 'New role' })
  await shown(dialog)
  return dialog
}

async function choose (dialog: Locator, category: string, permission: string, row = 0): Promise<void> {
  await dialog.getByRole('tab', { name: category }).nth(row).click()
  await dialog.getByPlaceholder('Select permission...').nth(row).click()
  await dialog.page().locator(`[role="listbox"][data-state="open"] [role="option"][data-value="${permission}"]`).click()
}

const roleCard = (page: Page): Locator =>
  page.locator('.card').filter({ has: page.getByRole('heading', { name: ROLE, exact: true }) })

async function openRole (page: Page): Promise<Locator> {
  await button(roleCard(page), 'Edit').click()
  const dialog = page.getByRole('dialog', { name: `Grants of ${ROLE}` })
  await shown(dialog)
  return dialog
}

const keyCards = (page: Page): Locator =>
  page.locator('section', { has: page.getByRole('heading', { name: 'Subordinate keys' }) }).locator('.card')

const keyCard = (page: Page, keyId: string): Locator =>
  keyCards(page).filter({ has: page.getByRole('heading', { name: keyId, exact: true }) })

async function keyIdOf (card: Locator): Promise<string> {
  const keyId = (await card.getByRole('heading').first().textContent() ?? '').trim()
  expect(keyId).toMatch(KEY_ID)
  return keyId
}

async function currentKeyId (page: Page): Promise<string> {
  const current = keyCards(page).filter({ has: page.getByText('current', { exact: true }) })
  expect(await current.count()).toBe(1)
  return await keyIdOf(current)
}

async function openKeys (page: Page): Promise<void> {
  await visit(page, '/configuration/keys')
  await shown(page.getByRole('heading', { name: 'Signing keys' }))
}

async function rotate (page: Page): Promise<void> {
  await button(page, 'Rotate').click()
  await shown(page.getByText('Rotated. New signatures use the new key.'))
  await page.waitForLoadState('networkidle')
}

describe.skipIf(!enabled).sequential('the configuration screens through the running server', { timeout: TEST_TIMEOUT_MS }, () => {
  beforeAll(async () => {
    await removeInstance()
    server = await startServer({ primary: [ada, carol] })
    await launchBrowser()
    session = await signedInSession(server, ada)
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    await closeBrowser()
    await server?.stop()
    await removeInstance()
  }, TEARDOWN_TIMEOUT_MS)

  it('ROL-1, KEY-1: the configuration index links an administrator to Roles and access and Signing keys, and shows neither to a reader', async () => {
    const { page } = session
    for (const [text, path] of [['Roles and access', '/configuration/iam'], ['Signing keys', '/configuration/keys']]) {
      await visit(page, '/configuration')
      await page.getByText(text, { exact: true }).click()
      await page.waitForURL(url => url.pathname === path, { timeout: SLOW_MS })
      await shown(page.getByRole('heading', { name: text }))
    }

    const reader = await signedInSession(server, carol)
    try {
      await visit(reader.page, '/configuration')
      expect(await reader.page.getByText('Roles and access', { exact: true }).count()).toBe(0)
      expect(await reader.page.getByText('Signing keys', { exact: true }).count()).toBe(0)
    } finally {
      await reader.context.close()
    }
  })

  describe('the grant editor', () => {
    it('ROL-2: a permission is chosen by category and value, and leaves the row incomplete until a resource is on', async () => {
      const dialog = await openNewRole(session.page)
      await choose(dialog, 'Storage', 'storage:bucket:read')

      await shown(dialog.getByText('Applies to'))
      expect(await grantsOf(dialog)).toStrictEqual([])
    })

    it('ROL-3: a bucket switched on becomes one grant over that bucket', async () => {
      const dialog = await openNewRole(session.page)
      await choose(dialog, 'Storage', 'storage:bucket:read')
      await switchNamed(dialog, BUCKET).click()

      expect(await switchState(dialog, BUCKET).isChecked()).toBe(true)
      expect(await grantsOf(dialog)).toStrictEqual([
        { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: BUCKET } }
      ])
    })

    it('ROL-3: several collections switched on in one row become one grant each, in order', async () => {
      const dialog = await openNewRole(session.page)
      await choose(dialog, 'Database', 'db:collection:delete')
      await switchNamed(dialog, 'test').click()
      await switchNamed(dialog, 'authors').click()

      expect(await grantsOf(dialog)).toStrictEqual([
        { permission: 'db:collection:delete', resource: { scope: 'collection', id: 'test' } },
        { permission: 'db:collection:delete', resource: { scope: 'collection', id: 'authors' } }
      ])
    })

    it('ROL-3: Any bucket is off at first, and on becomes one grant over *', async () => {
      const dialog = await openNewRole(session.page)
      await choose(dialog, 'Storage', 'storage:bucket:read')
      expect(await switchState(dialog, 'Any bucket').isChecked()).toBe(false)

      await switchNamed(dialog, 'Any bucket').click()
      expect(await grantsOf(dialog)).toStrictEqual([{ permission: 'storage:bucket:read', resource: '*' }])
    })

    it('ROL-3: an instance-scoped permission becomes one grant over *', async () => {
      const dialog = await openNewRole(session.page)
      await choose(dialog, 'Content', 'pages:read')

      expect(await grantsOf(dialog)).toStrictEqual([{ permission: 'pages:read', resource: '*' }])
    })

    it('ROL-2, ROL-3: a collection read row shows its fields once the collection is on, and records the fields switched on', async () => {
      const dialog = await openNewRole(session.page)
      await choose(dialog, 'Database', 'db:collection:read')
      await switchNamed(dialog, 'test').click()

      await shown(switchNamed(dialog, 'Every field'))
      expect(await switchState(dialog, 'Every field').isChecked()).toBe(false)
      expect(await grantsOf(dialog)).toStrictEqual([])

      await switchNamed(dialog, 'name').click()
      expect(await grantsOf(dialog)).toStrictEqual([
        { permission: 'db:collection:read', resource: { scope: 'collection', id: 'test' }, fields: ['name'] }
      ])
    })

    it('ROL-3: Every field records the grant without fields', async () => {
      const dialog = await openNewRole(session.page)
      await choose(dialog, 'Database', 'db:collection:read')
      await switchNamed(dialog, 'test').click()
      await switchNamed(dialog, 'Every field').click()

      expect(await grantsOf(dialog)).toStrictEqual([
        { permission: 'db:collection:read', resource: { scope: 'collection', id: 'test' } }
      ])
    })

    it('ROL-3: read and write rows over one collection keep their own field selections', async () => {
      const dialog = await openNewRole(session.page)
      await choose(dialog, 'Database', 'db:collection:read')
      await switchNamed(dialog, 'test').click()
      await switchNamed(dialog, 'Every field').click()
      await button(dialog, 'Add grant').click()
      await choose(dialog, 'Database', 'db:collection:write', 1)
      await switchNamed(dialog, 'test').nth(1).click()
      await switchNamed(dialog, 'name').click()

      expect(await grantsOf(dialog)).toStrictEqual([
        { permission: 'db:collection:read', resource: { scope: 'collection', id: 'test' } },
        { permission: 'db:collection:write', resource: { scope: 'collection', id: 'test' }, fields: ['name'] }
      ])
    })

    it('ROL-4: Add grant appends a row, and Remove grant removes it with its grants', async () => {
      const dialog = await openNewRole(session.page)
      await choose(dialog, 'Storage', 'storage:bucket:read')
      await switchNamed(dialog, BUCKET).click()

      await button(dialog, 'Add grant').click()
      expect(await dialog.getByPlaceholder('Select permission...').count()).toBe(2)
      expect(await grantsOf(dialog)).toHaveLength(1)

      await button(dialog, 'Remove grant').first().click()
      expect(await grantsOf(dialog)).toStrictEqual([])
    })

    it('ROL-5: New role closed without creating reopens with one new row', async () => {
      const { page } = session
      const dialog = await openNewRole(page)
      await choose(dialog, 'Storage', 'storage:bucket:read')
      await switchNamed(dialog, BUCKET).click()
      await button(dialog, 'Close').click()
      await hidden(dialog)

      await button(page, 'New role').click()
      const reopened = page.getByRole('dialog', { name: 'New role' })
      await shown(reopened)
      expect(await reopened.getByPlaceholder('Select permission...').count()).toBe(1)
      expect(await grantsOf(reopened)).toStrictEqual([])
    })
  })

  describe('a role', () => {
    it('ROL-5: a created role reopens with its grants, without a reload', async () => {
      const { page } = session
      const dialog = await openNewRole(page)
      await dialog.getByPlaceholder('Copywriter').fill(ROLE)
      await choose(dialog, 'Storage', 'storage:bucket:read')
      await switchNamed(dialog, BUCKET).click()
      await button(dialog, 'Create').click()
      await hidden(dialog)

      expect(await grantsOf(await openRole(page))).toStrictEqual([
        { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: BUCKET } }
      ])
    })

    it('ROL-5: a role saved again reopens with the grants of the second save', async () => {
      const { page } = session
      await visit(page, '/configuration/iam')
      const first = await openRole(page)
      await switchNamed(first, 'Any bucket').click()
      await button(first, 'Save').click()
      await hidden(first)

      expect(await grantsOf(await openRole(page))).toStrictEqual([{ permission: 'storage:bucket:read', resource: '*' }])
    })

    it('ROL-5: Delete asks, and Yes removes the role', async () => {
      const { page } = session
      await visit(page, '/configuration/iam')
      await button(roleCard(page), 'Delete').click()
      await shown(page.getByText(`Delete the role "${ROLE}". Anyone holding it loses what it granted.`))
      await button(page, 'Yes').click()

      await shown(page.getByText('Role deleted'))
      await expect.poll(async () => await roleCard(page).count(), { timeout: SLOW_MS }).toBe(0)
    })
  })

  describe('the key registry', () => {
    it('KEY-2: the root anchor shows its public key in full, and nothing on the screen rotates the root', async () => {
      const { page } = session
      await openKeys(page)
      const anchor = page.locator('.card', { has: page.getByRole('heading', { name: 'Root trust anchor' }) })

      await shown(anchor.getByText(/^[A-Za-z0-9+/]{40,}={0,2}$/))
      expect(await page.getByRole('button', { name: /rotate.*root|root.*rotate/i }).count()).toBe(0)
    })

    it('KEY-2: the registry shows its sequence, and exactly one current key, listed first', async () => {
      const { page } = session
      await openKeys(page)
      const summary = page.locator('.card', { has: page.getByRole('heading', { name: 'Registry' }) })

      await shown(summary.getByText('sequence'))
      const current = await currentKeyId(page)
      expect(await keyIdOf(keyCards(page).first())).toBe(current)
    })

    it('KEY-3: Rotate mints a new current key, and keeps the outgoing one as superseded', async () => {
      const { page } = session
      await openKeys(page)
      const before = await currentKeyId(page)
      const count = await keyCards(page).count()

      await rotate(page)
      await expect.poll(async () => await keyCards(page).count(), { timeout: SLOW_MS }).toBe(count + 1)
      await shown(keyCard(page, before).getByText('superseded', { exact: true }))
      expect(await currentKeyId(page)).not.toBe(before)
    })

    it('KEY-4: Revoke states that earlier signatures stop verifying, and No changes nothing', async () => {
      const { page } = session
      await openKeys(page)
      const current = await currentKeyId(page)

      await button(keyCard(page, current), 'Revoke').click()
      await shown(page.getByText(/stops verifying/i))
      await shown(page.getByText(/before now/i))
      await button(page, 'No').click()

      expect(await keyCard(page, current).getByText('revoked', { exact: true }).count()).toBe(0)
      expect(await currentKeyId(page)).toBe(current)
    })

    it('KEY-4: a revoked key stays listed as revoked, without Revoke, and one key stays current', async () => {
      const { page } = session
      await openKeys(page)
      await rotate(page)
      const superseded = await keyIdOf(keyCards(page).filter({ has: page.getByText('superseded', { exact: true }) }).first())

      await button(keyCard(page, superseded), 'Revoke').click()
      await button(page, 'Yes').click()
      await shown(page.getByText('Key revoked'))

      await shown(keyCard(page, superseded).getByText('revoked', { exact: true }))
      expect(await button(keyCard(page, superseded), 'Revoke').count()).toBe(0)
      expect(await keyCards(page).filter({ has: page.getByText('current', { exact: true }) }).count()).toBe(1)
    })
  })
})
