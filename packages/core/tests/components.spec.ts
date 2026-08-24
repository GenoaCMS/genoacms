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

test.describe('a prebuilt component', () => {
  let name: string

  test.beforeEach(async ({ page }) => {
    name = fixtureName('prebuilt')
    await signIn(page)
    await openPrebuilt(page)
  })

  test.afterEach(async ({ page }) => {
    await openPrebuilt(page)
    if (await card(page, name).count() === 0) return

    await card(page, name).first().click()
    await deletePrebuilt(page, name)
  })

  test('is registered and appears in the catalog', async ({ page }) => {
    await registerComponent(page, name)

    await openPrebuilt(page)
    await expect(card(page, name).first()).toBeVisible({ timeout: SLOW })
  })

  test('can be renamed, and the new name persists', async ({ page }) => {
    await registerComponent(page, name)

    const renamed = `${name}-renamed`
    await page.getByRole('button', { name: 'Change name' }).click()

    const dialog = page.getByRole('dialog', { name: 'Change name' })
    await dialog.getByRole('textbox').fill(renamed)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await reported(page, /updated|saved/i)

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
// Cleanup that goes around the interface
// ---------------------------------------------------------------------------------------------

const BUCKET = 'genoacms'

/**
 * Where the editor keeps a dynamic component, mirrored from `components/editor/io.ts`.
 *
 * Deleting through the interface now works, and the test below asserts it. This sweep stays as the
 * safety net for the tests that do **not** delete: a run that fails partway through still has to
 * leave the bucket as it found it.
 */
const DYNAMIC_DIRECTORIES = [
  ['.genoacms', 'components', 'edited'],
  ['.genoacms', 'components', 'definitions'],
  // Creating a dynamic component also registers it in the prebuilt catalog, so its entry has to
  // go too — otherwise the component vanishes from the editor but lingers as a component entry.
  ['.genoacms', 'components', 'prebuilt']
]

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

/** Deletes whatever is selected in the current listing, if anything is. */
const deleteSelection = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByText('Deleted', { exact: true }).first()).toBeVisible({ timeout: SLOW })
}

/**
 * Removes the published executables, which live in a directory of the component's own.
 *
 * Unlike the objects above, these are named for the commit rather than the component, so they are
 * removed by emptying the directory rather than by matching a name. A committed component has one
 * per commit, and an uncommitted one has no directory at all.
 */
const removeExecutables = async (page: Page, uid: string): Promise<void> => {
  await page.goto(`/storage/${BUCKET}/contents/.genoacms/components/${uid}`)

  const items = page.getByRole('button', { name: /^select-/ })
  if (await items.count() === 0) return

  for (const item of await items.all()) await item.click()
  await deleteSelection(page)
}

/** Removes a dynamic component's objects, since the delete action cannot. */
const removeDynamicObjects = async (page: Page, uid: string): Promise<void> => {
  await removeExecutables(page, uid)

  for (const directory of DYNAMIC_DIRECTORIES) {
    await openStorageDirectory(page, directory)

    const item = page.getByRole('button', { name: new RegExp(`^select-.*${uid}$`) })
    if (await item.count() === 0) continue

    await item.first().click()
    await deleteSelection(page)
  }
}

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/components/editor')
  await expect(page.getByRole('heading', { name: 'Component editor' })).toBeVisible()
}

/** Creates a dynamic component and returns its uid, which is the last segment of the URL. */
const createDynamic = async (page: Page, name: string): Promise<string> => {
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

  test.beforeEach(async ({ page }) => {
    // A dynamic component's name is the function its source declares, so the fixture name has to be
    // one a source file can actually name.
    name = identifierFixtureName('dynamic')
    // Reset, so a test that creates nothing does not have the previous test's uid swept again.
    uid = undefined as unknown as string
    await signIn(page)
    await openEditor(page)
  })

  test.afterEach(async ({ page }) => {
    if (uid !== undefined) await removeDynamicObjects(page, uid)
  })

  test('is created and opens in the code editor', async ({ page }) => {
    uid = await createDynamic(page, name)
    await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: SLOW })
  })

  test('keeps draft code without committing it', async ({ page }) => {
    uid = await createDynamic(page, name)
    await writeCode(page, 'export const answer = 42\n')

    // The draft is saved as it is typed; reloading shows whether it really was.
    await page.reload()
    await expect(page.locator('.cm-content').first()).toContainText('answer', { timeout: SLOW })
  })

  test('commits, which signs and publishes it', async ({ page }) => {
    test.setTimeout(180_000)
    uid = await createDynamic(page, name)
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
    uid = await createDynamic(page, name)

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
    uid = await createDynamic(page, name)
    // Creating navigates to the new component, so the list has to be reopened before creating again.
    await openEditor(page)
    await createDynamic(page, second)

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
    uid = await createDynamic(page, name)
    await openEditor(page)
    const secondUid = await createDynamic(page, second)

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
    await removeDynamicObjects(page, secondUid)
  })

  test('is gone once deleted', async ({ page }) => {
    uid = await createDynamic(page, name)

    await page.getByRole('button', { name: 'Delete component' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    await dialog.getByRole('textbox').fill(name)
    await dialog.getByRole('button', { name: /Yes, delete/ }).click()
    await reported(page, 'Component deleted')

    await openEditor(page)
    await expect(card(page, name)).toHaveCount(0, { timeout: SLOW })
  })
})
