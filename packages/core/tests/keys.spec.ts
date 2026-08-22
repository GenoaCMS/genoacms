import { test, expect, type Page } from '@playwright/test'
import { signIn, confirm, toast } from './support/session'

/**
 * The signing key administration screen.
 *
 * ## Revocation is exercised for real, against a key the test minted
 *
 * Revoking is permanent and reaches backwards — every signature that key ever made stops verifying.
 * The suite therefore applies the same rule as the rest of the fixtures: **it destroys only what it
 * made.** The revocation test rotates first, which mints a key and supersedes it moments later, and
 * revokes *that* key. Nothing this instance published earlier was signed by it, so the assertion is
 * about the real operation without the blast radius of revoking a key the CMS's own manifests
 * depend on.
 *
 * Keys are the one fixture with no `e2e-` prefix, because nobody names them: a `keyId` derives from
 * the key itself. Rotation is additive and superseded keys are never removed, so a run leaves two
 * more entries in the registry — one superseded, one revoked — and nothing to clean up.
 *
 * ## What this suite cannot catch
 *
 * It runs against `pnpm build && pnpm preview`. The dev server is a different program, and a defect
 * that exists only there is invisible here — as one did: writing a secret used to restart the Vite
 * dev server mid-request, so rotating reported failure and revoking succeeded while reporting
 * failure. That is guarded in `vite.config.test.ts` instead, at the level where the cause lives.
 */

const KEY_ID = /^[0-9a-z]/i

/** The cards under "Subordinate keys", which is the list rotation changes. */
const keyCards = (page: Page) =>
  page.locator('section', { has: page.getByRole('heading', { name: 'Subordinate keys' }) })
    .locator('.card')

/** One key's card, addressed by the id shown as its heading. */
const cardFor = (page: Page, keyId: string) =>
  keyCards(page).filter({ has: page.getByRole('heading', { name: keyId, exact: true }) })

const currentKeyId = async (page: Page): Promise<string> => {
  // The current key is rendered first by construction, so the badge identifies it rather than the
  // position — a screen that ordered them differently should fail here, not silently pass.
  const current = keyCards(page).filter({ has: page.getByText('current', { exact: true }) })
  await expect(current).toHaveCount(1)

  const keyId = await current.getByRole('heading').first().textContent()
  expect(keyId?.trim()).toMatch(KEY_ID)
  return (keyId as string).trim()
}

/**
 * The most recently superseded key, which is the one a rotation just stepped away from.
 *
 * Addressed by its supersession time rather than by position: the cards are ordered current-first
 * and then newest to oldest, so "the newest superseded one" is the first such card — but asserting
 * that here would make this helper depend on the ordering the ordering test already covers.
 */
const supersededKeyId = async (page: Page): Promise<string> => {
  const superseded = keyCards(page).filter({ has: page.getByText('superseded', { exact: true }) }).first()
  await expect(superseded).toBeVisible()

  const keyId = await superseded.getByRole('heading').first().textContent()
  expect(keyId?.trim()).toMatch(KEY_ID)
  return (keyId as string).trim()
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await page.goto('/configuration/keys')
  await expect(page.getByRole('heading', { name: 'Signing keys' })).toBeVisible()
})

test.describe('the registry', () => {
  test('reaches the screen from the configuration index', async ({ page }) => {
    // The card is permission-gated, so this also covers the gate being satisfied for an
    // administrator — a gate that hid it from everyone would pass every other test in this file.
    await page.goto('/configuration')
    await page.getByText('Signing keys').click()

    await expect(page).toHaveURL(/\/configuration\/keys$/)
  })

  test('shows the root anchor a consumer SDK has to embed', async ({ page }) => {
    const anchor = page.locator('.card', { has: page.getByRole('heading', { name: 'Root trust anchor' }) })

    await expect(anchor).toBeVisible()
    // The public key in full: it is what an operator came here to copy, and truncating it would
    // make the screen useless for the one job it does.
    await expect(anchor.getByText(/^[A-Za-z0-9+/]{40,}={0,2}$/)).toBeVisible()
  })

  test('does not offer to rotate the root', async ({ page }) => {
    // The operation that strands every deployed consumer belongs with whoever can redeploy
    // them. This asserts the absence, so adding such a button is a failing test rather than a
    // review comment.
    await expect(page.getByRole('button', { name: /rotate.*root|root.*rotate/i })).toHaveCount(0)
  })

  test('states the sequence, which is what rollback detection rests on', async ({ page }) => {
    const summary = page.locator('.card', { has: page.getByRole('heading', { name: 'Registry' }) })

    await expect(summary.getByText('sequence')).toBeVisible()
  })

  test('lists exactly one current key', async ({ page }) => {
    await expect(await currentKeyId(page)).toMatch(KEY_ID)
  })
})

test.describe('rotating', () => {
  test('mints a new current key and supersedes the outgoing one', async ({ page }) => {
    const before = await currentKeyId(page)
    const countBefore = await keyCards(page).count()

    await page.getByRole('button', { name: 'Rotate' }).click()
    await expect(toast(page, /Rotated/)).toBeVisible()

    // The outgoing key stays and keeps verifying — the property that makes rotation safe, and the
    // one that makes it no answer to a leak.
    await expect(keyCards(page)).toHaveCount(countBefore + 1)
    await expect(cardFor(page, before).getByText('superseded', { exact: true })).toBeVisible()

    const after = await currentKeyId(page)
    expect(after).not.toBe(before)
  })
})

test.describe('revoking', () => {
  test('states what it costs before doing it, and does nothing when declined', async ({ page }) => {
    const current = await currentKeyId(page)

    await cardFor(page, current).getByRole('button', { name: 'Revoke' }).click()

    // The word "revoke" does not say that earlier signatures stop verifying, and an administrator
    // who learns that afterwards has already lost them.
    await expect(page.getByText(/stops verifying/i)).toBeVisible()
    await expect(page.getByText(/before now/i)).toBeVisible()

    await page.getByRole('button', { name: 'No' }).click()

    // Declining must leave the registry untouched, not merely close the dialog.
    await expect(cardFor(page, current).getByText('revoked', { exact: true })).toHaveCount(0)
    expect(await currentKeyId(page)).toBe(current)
  })

  test('revokes a key, and refuses to revoke it a second time', async ({ page }) => {
    // Rotate first, so the key destroyed below is one this test minted seconds ago rather than one
    // the CMS's own manifests were signed with.
    await page.getByRole('button', { name: 'Rotate' }).click()
    await expect(toast(page, /Rotated/)).toBeVisible()

    const doomed = await supersededKeyId(page)
    await cardFor(page, doomed).getByRole('button', { name: 'Revoke' }).click()
    await confirm(page)

    await expect(toast(page, 'Key revoked')).toBeVisible()
    // The entry stays: a revocation is a published fact, not an absence a consumer has to infer.
    await expect(cardFor(page, doomed).getByText('revoked', { exact: true })).toBeVisible()

    // And the control goes, because revoking again would spend a sequence number and a root
    // signature to publish exactly what the previous registry already said.
    await expect(cardFor(page, doomed).getByRole('button', { name: 'Revoke' })).toHaveCount(0)
  })

  test('leaves the instance able to sign', async ({ page }) => {
    // The property that makes revocation safe to offer here at all: there is always exactly one
    // current key afterwards, so the registry recording the revocation could itself be signed.
    await expect(keyCards(page).filter({ has: page.getByText('current', { exact: true }) })).toHaveCount(1)
  })
})
