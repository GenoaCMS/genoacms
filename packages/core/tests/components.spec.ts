import { expect, test, type Locator, type Page } from '@playwright/test'
import { fixtureName, identifierFixtureName, signIn } from './support/session'

/**
 * The two component surfaces: the prebuilt catalog, and the dynamic code editor.
 *
 * They are different products sharing a menu. A **prebuilt** entry describes a component that
 * already exists in the consuming app — the CMS holds its name and attribute schema. A **dynamic**
 * component is authored here: its source lives in the CMS, and committing it runs static analysis,
 * compiles a bundle, signs it and publishes an executable.
 *
 * Every fixture is created by the test that uses it and deleted afterwards. Deleting a prebuilt
 * entry requires typing its name back, which is itself worth exercising: the confirm button stays
 * disabled until the typed name matches.
 */

const SLOW = 20_000

const reported = async (page: Page, message: string | RegExp): Promise<void> => {
  await expect(page.getByText(message).first()).toBeVisible({ timeout: SLOW })
}

const card = (page: Page, name: string): Locator =>
  page.getByRole('link', { name })

// ---------------------------------------------------------------------------------------------
// Prebuilt components
// ---------------------------------------------------------------------------------------------

const openPrebuilt = async (page: Page): Promise<void> => {
  await page.goto('/components/prebuilt')
  await expect(page.getByRole('heading', { name: 'Prebuilt component management' })).toBeVisible()
}

/** Registering navigates to the new entry, so the URL is what confirms it. */
const registerComponent = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'Register component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Register a new component' })
  await dialog.getByLabel('Component name:').fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/components\/prebuilt\/[^/]+$/, { timeout: SLOW })
}

const deletePrebuilt = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'Delete component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Delete the component' })
  const confirmButton = dialog.getByRole('button', { name: `Yes, delete ${name}` })

  // Guarded by retyping the name: the control is inert until the two match.
  await expect(confirmButton).toBeDisabled()
  await dialog.getByRole('textbox').fill(name)
  await expect(confirmButton).toBeEnabled()

  await confirmButton.click()
  await expect(page).toHaveURL(/\/components\/prebuilt\/?$/, { timeout: SLOW })
}

/**
 * Removes prebuilt fixtures this spec created, through the catalog's own bulk selection.
 *
 * `afterEach` deletes the component a test knew the name of, which is not the same as every
 * component a test created. A test that fails partway leaves one behind, and these tests rename as
 * they go — so the name the hook holds may not be the name that is stored. That is how a run left
 * the catalog full of fixtures.
 *
 * **Scoped to named fixtures, never a prefix and never "select all".** Playwright runs spec files in
 * parallel, so a sweep that took everything matching `e2e-` would delete another spec's fixtures
 * while that spec was still using them — which is exactly what it did, removing the shared component
 * `pageComposition` builds its trees from and leaving that spec with an empty dropdown.
 */
const sweepPrebuiltFixtures = async (page: Page, names: string[]): Promise<void> => {
  if (names.length === 0) return
  await openPrebuilt(page)

  const selector = names.map(each => `button[aria-label="select-${each}"]`).join(', ')
  const boxes = page.locator(selector)
  if (await boxes.count() === 0) return
  for (const box of await boxes.all()) await box.click()

  await page.getByRole('button', { name: 'Delete selected' }).click()
  // The confirmation names everything selected, and is generated rather than typed so that the
  // sweep cannot remove more than it named.
  const phrase = (await page.locator('code').innerText()).trim()
  await page.locator('input[name="confirmation"]').fill(phrase)
  await page.getByRole('button', { name: /^Yes, delete/ }).click()

  // Listing is eventually consistent, so a component can be removed and still appear once more.
  await expect(async () => {
    await openPrebuilt(page)
    await expect(page.locator(selector)).toHaveCount(0, { timeout: 2_000 })
  }).toPass({ timeout: SLOW })
}

test.describe('a prebuilt component', () => {
  let name: string
  /** Every prebuilt fixture this spec created, under whatever name it ended up with. */
  const created: string[] = []

  test.beforeEach(async ({ page }) => {
    name = fixtureName('prebuilt')
    created.push(name)
    await signIn(page)
    await openPrebuilt(page)
  })

  test.afterEach(async ({ page }) => {
    await openPrebuilt(page)
    if (await card(page, name).count() === 0) return

    await card(page, name).first().click()
    await deletePrebuilt(page, name)
  })

  // The safety net. `afterEach` covers the ordinary path; this covers what a failed or renaming
  // test left behind, which is what actually flooded the catalog.
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    await signIn(page)
    await sweepPrebuiltFixtures(page, created)
    await page.close()
  })

  test('is registered and appears in the catalog', async ({ page }) => {
    await registerComponent(page, name)

    await openPrebuilt(page)
    await expect(card(page, name).first()).toBeVisible({ timeout: SLOW })
  })

  test('can be renamed, and the new name persists', async ({ page }) => {
    await registerComponent(page, name)

    const renamed = `${name}-renamed`
    await rename(page, renamed)

    await page.reload()
    await expect(page.getByText(`Component: ${renamed}`)).toBeVisible({ timeout: SLOW })

    name = renamed
  })

  test('takes an attribute, which survives saving', async ({ page }) => {
    await registerComponent(page, name)

    await page.getByRole('button', { name: 'Add attribute' }).click()
    const dialog = page.getByRole('dialog', { name: 'New attribute' })
    await dialog.getByRole('button', { name: 'string' }).first().click()

    // The attribute exists in the form until it is submitted, so saving is part of the test.
    await page.getByRole('button', { name: 'Submit' }).click()
    await reported(page, /updated|saved/i)

    await page.reload()
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: SLOW })
  })

  /**
   * Renames through the dialog and waits for the save to be reported.
   *
   * Records the new name: cleanup selects by name, and a fixture renamed after creation is stored
   * under a name the creation never saw.
   */
  const rename = async (page: Page, to: string) => {
    created.push(to)
    await page.getByRole('button', { name: 'Change name' }).click()
    const dialog = page.getByRole('dialog', { name: 'Change name' })
    await dialog.getByRole('textbox').fill(to)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await reported(page, /updated|saved/i)
  }

  test('enables undo as soon as a change is saved, without a reload', async ({ page }) => {
    // Saving goes through a remote function rather than a form action, so nothing invalidates the
    // loaded data on its own. The history depth that enables this button is part of that data, so
    // an author who has just made a change is told there is nothing to undo.
    await registerComponent(page, name)

    const renamed = `${name}-undone`
    await rename(page, renamed)
    name = renamed

    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled({ timeout: SLOW })
  })

  test('undoes a rename, and redoes it', async ({ page }) => {
    // The undo and redo buttons existed from the day this editor was written and did nothing: the
    // server actions were empty, no save recorded a step, and the buttons were given no history
    // depth so they rendered permanently disabled. Every unit test passed throughout, because the
    // generic undo operations worked perfectly well and nothing called them. Only a test that
    // presses the button catches that.
    await registerComponent(page, name)

    const renamed = `${name}-undone`
    await rename(page, renamed)
    name = renamed

    // Reloaded deliberately, so this test fails on the button doing nothing rather than on the
    // button being disabled — which is the separate failure above.
    await page.reload()

    const original = name.replace('-undone', '')
    const undo = page.getByRole('button', { name: 'Undo' })
    await expect(undo).toBeEnabled({ timeout: SLOW })

    // Survives an enhanced submission and not a navigation, so it distinguishes the two. Undo used
    // to reload the whole page, which works and is the wrong way for an editor to behave.
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).kept = true })
    await undo.click()

    // Asserted as the renamed heading being *gone*, not as the original being present. `getByText`
    // matches substrings, and the original name is a prefix of the renamed one — so asserting the
    // original is visible passes just as well when the undo did nothing at all. That is exactly how
    // this test first went green against a button that never submitted.
    await expect(page.getByText(`Component: ${renamed}`)).toBeHidden({ timeout: SLOW })
    await expect(page.getByText(`Component: ${original}`)).toBeVisible({ timeout: SLOW })
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).kept)).toBe(true)
    name = original

    const redo = page.getByRole('button', { name: 'Redo' })
    await expect(redo).toBeEnabled({ timeout: SLOW })
    await redo.click()
    await expect(page.getByText(`Component: ${renamed}`)).toBeVisible({ timeout: SLOW })
    name = renamed
  })

  test('offers nothing to undo on a component that was only just created', async ({ page }) => {
    // Creation is not a step: there is no previous state to return to.
    await registerComponent(page, name)

    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  test('saves a numeric constraint that was entered and then cleared', async ({ page }) => {
    // An unset constraint is an **omitted key**, not a null one: component entries are signed over
    // their canonical JSON, and `{"minimum": null}` and `{}` canonicalize to different bytes, so the
    // two would sign differently. The boundary refuses null outright.
    //
    // Svelte binds an emptied `type="number"` input to `null` (`to_number('')`), so an author who
    // types a minimum and then changes their mind writes exactly the value the schema now refuses.
    // Clearing a field is the ordinary way to say "no constraint", and it must produce no key.
    await registerComponent(page, name)

    await page.getByRole('button', { name: 'Add attribute' }).click()
    const dialog = page.getByRole('dialog', { name: 'New attribute' })
    await dialog.getByRole('button', { name: 'number' }).first().click()

    const minimum = page.getByLabel('Minimum value:')
    await minimum.fill('5')
    await minimum.fill('')

    await page.getByRole('button', { name: 'Submit' }).click()
    await reported(page, /updated|saved/i)

    // Reloaded rather than trusted: what matters is that the entry was really stored, and that the
    // field comes back empty rather than holding a value the author cleared.
    await page.reload()
    await expect(page.getByLabel('Minimum value:')).toHaveValue('', { timeout: SLOW })
  })
})

// ---------------------------------------------------------------------------------------------
// Dynamic components
// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// Reading the bucket directly, for assertions the interface cannot make
// ---------------------------------------------------------------------------------------------

const BUCKET = 'genoacms'

/**
 * Walks the storage browser into a directory, one card at a time.
 *
 * Each click is waited out: the browser navigates client-side, and clicking the next segment before
 * the current listing has arrived lands somewhere else while appearing to succeed.
 */
const openStorageDirectory = async (page: Page, segments: string[]): Promise<void> => {
  await page.goto(`/storage/${BUCKET}/contents`)

  // Scoped to the listing: the navigation sidebar has links of its own, and "components" there
  // would take the walk to a different screen entirely.
  const grid = page.getByRole('main')
  const walked: string[] = []
  for (const segment of segments) {
    await grid.getByRole('link', { name: segment }).first().click()
    walked.push(segment)
    await expect(page.locator('h1')).toHaveText(`${walked.join('/')}/`, { timeout: SLOW })
  }
}

/**
 * Removes the published executables, which live in a directory of the component's own.
 *
 * Unlike the objects above, these are named for the commit rather than the component, so they are
 * removed by emptying the directory rather than by matching a name. A committed component has one
 * per commit, and an uncommitted one has no directory at all.
 */

/** Removes a dynamic component's objects, since the delete action cannot. */
/**
 * Removes dynamic fixtures through the editor's own bulk selection.
 *
 * This used to delete the underlying storage objects by hand, matching filenames that ended with the
 * component's uid. Splitting a component entry into `{uid}.json` and `{uid}.history` broke that
 * match silently — the cleanup found nothing, skipped, and every run left entries behind that
 * surfaced in the prebuilt catalog.
 *
 * Deleting through the UI removes the dependence on filenames entirely, and exercises the deletion
 * the application actually performs: the definition and its commits, the entry, the component file,
 * and every published executable, removed together.
 *
 * **Selects named fixtures only, never "select all".** The editor lists the instance's own
 * components beside these.
 */
const deleteDynamicFixtures = async (page: Page, names: string[]): Promise<void> => {
  if (names.length === 0) return
  await openEditor(page)

  const selector = names.map(each => `button[aria-label="select-${each}"]`).join(', ')
  const boxes = page.locator(selector)
  if (await boxes.count() === 0) return
  for (const box of await boxes.all()) await box.click()

  await page.getByRole('button', { name: 'Delete selected' }).click()
  // Generated rather than typed, so the confirmation cannot name more than was selected.
  const phrase = (await page.locator('code').innerText()).trim()
  await page.locator('input[name="confirmation"]').fill(phrase)
  await page.getByRole('button', { name: /^Yes, delete/ }).click()

  // Listing is eventually consistent: a component can be removed and still appear in the next read.
  await expect(async () => {
    await openEditor(page)
    await expect(page.locator(selector)).toHaveCount(0, { timeout: 2_000 })
  }).toPass({ timeout: SLOW })
}

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/components/editor')
  await expect(page.getByRole('heading', { name: 'Component editor' })).toBeVisible()
}

/**
 * Creates a dynamic component and returns its uid, which is the last segment of the URL.
 *
 * The name is appended to `record` so cleanup knows about it the moment it exists. Recording it at
 * the call site instead would miss anything created by a test that then failed.
 */
const createDynamic = async (page: Page, name: string, record: string[] = []): Promise<string> => {
  record.push(name)
  await page.getByRole('button', { name: 'Create component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create a new component' })
  await dialog.getByLabel('Name:').fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/components\/editor\/[^/]+$/, { timeout: SLOW })
  return page.url().split('/').pop() as string
}

/**
 * Types into the code editor.
 *
 * CodeMirror renders a contenteditable rather than a textarea, so the text goes in through the
 * keyboard the way an author would enter it.
 */
const writeCode = async (page: Page, code: string): Promise<void> => {
  // The commit modal holds a diff editor of its own, so once it is open there is more than one
  // editor on the page. The author's is first either way.
  const editor = page.locator('.cm-content').first()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')

  // The draft is written a second after typing stops, with nothing on screen to say so. Waiting for
  // that request is the difference between testing the editor and testing how fast the test types.
  const autoSaved = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.ok(),
    { timeout: SLOW }
  )
  await page.keyboard.type(code)
  await autoSaved
}

/**
 * A component the pipeline accepts.
 *
 * The entry function is named after the component, because that is how the CMS finds it. The
 * attribute type is declared in the source rather than imported: the analyzer reads a parameter's
 * resolved type text, and a component may not import anything anyway.
 */
const componentSource = (name: string): string =>
  'interface StringAttribute<Pattern, MaxLength, Default> { _brand: Pattern }\n' +
  `export function ${name} (heading: StringAttribute<".*", 120, "hi">) { return heading }\n`

/** Opens the commit dialog and submits it. */
const commitDraft = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Commit' }).click()

  const dialog = page.getByRole('dialog', { name: 'Commit changes' })
  await dialog.getByRole('textbox').last().fill('committed by the end-to-end suite')
  await dialog.getByRole('button', { name: /commit/i }).click()
}

test.describe('a dynamic component', () => {
  let name: string
  let uid: string
  /**
   * Every fixture this test created, whether or not it went on to delete it.
   *
   * Tracked by name rather than by uid because the editor selects by name, and recorded at creation
   * rather than assigned per test: several tests create a second component, and a test that failed
   * between the two creations would otherwise leave one behind with nothing holding its name.
   */
  let created: string[]

  test.beforeEach(async ({ page }) => {
    // A dynamic component's name is the function its source declares, so the fixture name has to be
    // one a source file can actually name.
    name = identifierFixtureName('dynamic')
    // Reset, so a test that creates nothing does not have the previous test's uid swept again.
    uid = undefined as unknown as string
    created = []
    await signIn(page)
    await openEditor(page)
  })

  test.afterEach(async ({ page }) => {
    await deleteDynamicFixtures(page, created)
  })

  test('is created and opens in the code editor', async ({ page }) => {
    uid = await createDynamic(page, name, created)
    await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: SLOW })
  })

  test('keeps draft code without committing it', async ({ page }) => {
    uid = await createDynamic(page, name, created)
    await writeCode(page, 'export const answer = 42\n')

    // The draft is saved as it is typed; reloading shows whether it really was.
    await page.reload()
    await expect(page.locator('.cm-content').first()).toContainText('answer', { timeout: SLOW })
  })

  test('commits, which signs and publishes it', async ({ page }) => {
    test.setTimeout(180_000)
    uid = await createDynamic(page, name, created)
    await writeCode(page, componentSource(name))

    // Committing runs static analysis, compiles, signs with the key hierarchy and publishes. It is
    // the slowest thing the product does, and the one most worth knowing still works.
    await commitDraft(page)

    // The exact string the server returns on success. A pattern that also matched a failure message
    // was what let this test pass for months while every commit was in fact being refused.
    await reported(page, 'Code commited')

    // What "publishes" means: one object under the component's own directory, named for the commit
    // that produced it. Matched on the per-file select control rather than on links, because the
    // listing also renders navigation the count would otherwise include.
    await openStorageDirectory(page, ['.genoacms', 'components', uid])
    const executables = page.getByRole('button', { name: /^select-/ })
    await expect(executables).toHaveCount(1, { timeout: SLOW })
    await expect(executables.first()).toHaveAccessibleName(/[0-9a-f-]{36}\.json$/)
  })

  test('reports a refusal instead of claiming to have committed', async ({ page }) => {
    test.setTimeout(180_000)
    uid = await createDynamic(page, name, created)

    // Analysis passes and compilation refuses: a component may not import anything, because what is
    // signed has to be a function of the source alone.
    await writeCode(page, `import { format } from "date-fns"\n${componentSource(name)}`)
    await commitDraft(page)

    await reported(page, /cannot import|self-contained/i)
    await expect(page.getByText('Code commited')).toHaveCount(0)

    // Nothing was published, so the component has no executables.
    await page.goto(`/storage/${BUCKET}/contents/.genoacms/components/${uid}`)
    await expect(page.getByRole('button', { name: /^select-/ })).toHaveCount(0, { timeout: SLOW })
  })

  test('refuses a name no source file could declare', async ({ page }) => {
    // The name is the entry function. Accepting `my-hero` would create a component that can never be
    // committed, and the only error the author would ever see is that no such function exists.
    await page.getByRole('button', { name: 'Create component' }).click()

    const dialog = page.getByRole('dialog', { name: 'Create a new component' })
    await dialog.getByLabel('Name:').fill('e2e-not-an-identifier')
    await dialog.getByRole('button', { name: 'Create' }).click()

    await expect(page).not.toHaveURL(/\/components\/editor\/[^/]+$/)
  })

  /**
   * Removing several at once, from the list.
   *
   * The same control the prebuilt catalog has, which the editor lacked entirely — so the only way to
   * remove a dynamic component was one at a time from its own page.
   *
   * **Only this test's own checkboxes are ever clicked.** The list holds the instance's real
   * components beside the fixtures, and the confirmation phrase is read off the dialog rather than
   * composed here: a test that assembled it independently could pass while the dialog named
   * something else.
   */
  test('several are removed in one action', async ({ page }) => {
    test.setTimeout(180_000)
    const second = identifierFixtureName('dynamic')
    uid = await createDynamic(page, name, created)
    // Creating navigates to the new component, so the list has to be reopened before creating again.
    await openEditor(page)
    await createDynamic(page, second, created)

    await openEditor(page)
    // Labelled by name, as in the prebuilt catalog. Both fixture names are unique to this test, so
    // nothing of the instance's own can be caught by them.
    const boxes = page.locator(
      `button[aria-label="select-${name}"], button[aria-label="select-${second}"]`
    )
    await expect(boxes).toHaveCount(2, { timeout: SLOW })
    for (const box of await boxes.all()) await box.click()

    await page.getByRole('button', { name: 'Delete selected' }).click()
    const phrase = (await page.locator('code').innerText()).trim()
    expect(phrase.split(',').length).toBe(2)

    await page.locator('input[name="confirmation"]').fill(phrase)
    await page.getByRole('button', { name: /^Yes, delete/ }).click()
    await reported(page, 'Deleted 2 components')

    // Reloaded until it settles: object listing is eventually consistent, so a component can be
    // removed successfully and still appear in the very next listing.
    await expect(async () => {
      await openEditor(page)
      await expect(card(page, name)).toHaveCount(0, { timeout: 2_000 })
      await expect(card(page, second)).toHaveCount(0, { timeout: 2_000 })
    }).toPass({ timeout: SLOW })

    uid = undefined as unknown as string
  })

  test('refuses a bulk confirmation that does not name everything selected', async ({ page }) => {
    // One name is what someone types out of habit, and it must not be enough to remove two things.
    test.setTimeout(180_000)
    const second = identifierFixtureName('dynamic')
    uid = await createDynamic(page, name, created)
    await openEditor(page)
    await createDynamic(page, second, created)

    await openEditor(page)
    const boxes = page.locator(
      `button[aria-label="select-${name}"], button[aria-label="select-${second}"]`
    )
    await expect(boxes).toHaveCount(2, { timeout: SLOW })
    for (const box of await boxes.all()) await box.click()

    await page.getByRole('button', { name: 'Delete selected' }).click()
    const phrase = (await page.locator('code').innerText()).trim()
    await page.locator('input[name="confirmation"]').fill(phrase.split(',')[0])

    await expect(page.getByRole('button', { name: /^Yes, delete/ })).toBeDisabled()

    // Both are still here, and both are this test's to clean up.
    await page.keyboard.press('Escape')
  })

  test('is gone once deleted', async ({ page }) => {
    uid = await createDynamic(page, name, created)

    await page.getByRole('button', { name: 'Delete component' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    await dialog.getByRole('textbox').fill(name)
    await dialog.getByRole('button', { name: /Yes, delete/ }).click()
    await reported(page, 'Component deleted')

    await openEditor(page)
    await expect(card(page, name)).toHaveCount(0, { timeout: SLOW })
  })
})
