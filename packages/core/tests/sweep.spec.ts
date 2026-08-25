import { expect, test } from '@playwright/test'
import { FIXTURE_PREFIX, signIn } from './support/session'

/**
 * Removes every leftover `e2e-` fixture from both catalogs, through the UI's own bulk selection.
 *
 * Run deliberately — `SWEEP=1 pnpm exec playwright test sweep.spec.ts` — and skipped otherwise, so a
 * destructive sweep never rides along with an ordinary suite run. The specs clean up after
 * themselves; this is for what an interrupted or crashed run left behind.
 *
 * **Selects by the `e2e-` prefix and never "select all".** These catalogs hold the instance's real
 * components, and a sweep that cannot tell them apart is worse than no sweep at all.
 */
test('sweeps leftover fixtures from both catalogs', async ({ page }) => {
  test.skip(process.env.SWEEP === undefined, 'destructive; run with SWEEP=1 (or SWEEP=count to only report)')
  test.setTimeout(300_000)
  await signIn(page)

  for (const [label, path] of [
    ['prebuilt', '/components/registrar'],
    ['dynamic', '/components/editor']
  ]) {
    await page.goto(path)
    // `e2e-` and `e2eDynamic` only. **Not** every name beginning `e2e`: `pageComposition` builds a
    // shared catalog (`e2ePage`, one component per attribute type) that its later groups depend on,
    // and sweeping those away leaves that spec creating pages against an empty dropdown.
    const boxes = page.locator(
      `button[aria-label^="select-${FIXTURE_PREFIX}"], button[aria-label^="select-e2eDynamic"]`
    )
    const count = await boxes.count()
    console.log(`[sweep] ${label}: ${count} fixture(s)`)
    for (const box of await boxes.all()) console.log('[sweep]   ', await box.getAttribute('aria-label'))
    if (count === 0 || process.env.SWEEP === 'count') continue

    for (const box of await boxes.all()) await box.click()
    await page.getByRole('button', { name: 'Delete selected' }).click()
    const phrase = (await page.locator('code').innerText()).trim()
    await page.locator('input[name="confirmation"]').fill(phrase)
    await page.getByRole('button', { name: /^Yes, delete/ }).click()

    await expect(async () => {
      await page.goto(path)
      await expect(page.locator(
        `button[aria-label^="select-${FIXTURE_PREFIX}"], button[aria-label^="select-e2eDynamic"]`
      )).toHaveCount(0, { timeout: 2_000 })
    }).toPass({ timeout: 120_000 })
    console.log(`[sweep] ${label}: cleared`)
  }
})
