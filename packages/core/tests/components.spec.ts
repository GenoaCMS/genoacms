import { expect, test, type Locator, type Page } from '@playwright/test'
import { fixtureName, identifierFixtureName, signIn } from './support/session'
import { openDirectory } from './support/storage'

/**
 * The two component surfaces: the prebuilt catalog, and the dynamic code editor.
 *
 * They are different products sharing a menu. A **prebuilt** entry describes a component that
 * already exists in the consuming app — the CMS holds its name and attribute schema. A **dynamic**
 * component is authored here: its source lives in the CMS, and publishing it runs static analysis,
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

const openRegistrar = async (page: Page): Promise<void> => {
  await page.goto('/components/registrar')
  await expect(page.getByRole('heading', { name: 'Component registrar' })).toBeVisible()
}

/**
 * Registering navigates to the new component, so the URL is what confirms it.
 *
 * The kind is chosen here, because both kinds are registered through this one form. A component
 * whose code lives in the consuming application stays in the registrar; one coded in the CMS opens
 * in the editor, which is why the two helpers assert different destinations.
 */
const registerComponent = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'Register component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Register a new component' })
  await dialog.getByLabel('Component name:').fill(name)
  await dialog.getByRole('radio', { name: 'Already coded in my app' }).check()
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/components\/registrar\/[^/]+$/, { timeout: SLOW })
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
  await expect(page).toHaveURL(/\/components\/registrar\/?$/, { timeout: SLOW })
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
  await openRegistrar(page)

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
    await openRegistrar(page)
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
    await openRegistrar(page)
  })

  test.afterEach(async ({ page }) => {
    await openRegistrar(page)
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

    await openRegistrar(page)
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

  test('publishes a signed header, and no executable', async ({ page }) => {
    test.setTimeout(180_000)
    // The case the release path did not previously have at all. A component whose code lives in the
    // consuming application still has a description consumers must agree with — without a signed
    // one, the parameter list a consumer calls by is something anyone in between may rewrite.
    await registerComponent(page, name)
    const uid = page.url().split('/').pop() as string

    await expect(page.getByText('Unpublished')).toBeVisible({ timeout: SLOW })

    await page.getByRole('button', { name: 'Publish' }).click()
    const dialog = page.getByRole('dialog', { name: 'Publish the component' })
    await dialog.getByRole('textbox').last().fill('published by the end-to-end suite')
    await dialog.getByRole('button', { name: /publish/i }).click()
    await reported(page, 'Component published')

    // The badge is what tells an author a component is usable on a page, and it has to answer
    // without a reload — the publication does not navigate.
    await expect(page.getByText('Published', { exact: true })).toBeVisible({ timeout: SLOW })

    // One document, and it is the header. An executable here would mean the CMS had compiled
    // something for a component that has no source.
    const documents = await openSolePublication(page, uid)
    await expect(documents).toHaveCount(1, { timeout: SLOW })
    await expect(documents.first()).toHaveAccessibleName(/\/header\.json$/)
  })

  test('refuses to publish twice with nothing changed', async ({ page }) => {
    // A prebuilt component has no code, so the header digest is the *whole* of `no change, no
    // publication` for it. Without the comparison, every click would write another immutable
    // directory identical to the last.
    await registerComponent(page, name)

    const publish = async () => {
      await page.getByRole('button', { name: 'Publish' }).click()
      const dialog = page.getByRole('dialog', { name: 'Publish the component' })
      await dialog.getByRole('textbox').last().fill('published by the end-to-end suite')
      await dialog.getByRole('button', { name: /publish/i }).click()
    }

    await publish()
    await reported(page, 'Component published')
    await expect(page.getByText('Component published')).toHaveCount(0, { timeout: SLOW })

    await publish()
    await reported(page, /Nothing has changed/)
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
 * Walks into the one publication a component has, and answers what is inside it.
 *
 * The directory is named for the publication, whose identifier the test never sees — so the walk
 * stops at the component and finds the single child by shape. `openStorageDirectory` rather than a
 * direct URL: the listing is built by navigating, and a `goto` straight to a nested path renders
 * nothing, which would make an emptiness assertion pass whatever the bucket held.
 *
 * The returned locator matches on a **suffix**, because a file's select control is labelled with its
 * whole path rather than its name — anchoring at the start would only ever match the bucket root.
 */
const openSolePublication = async (page: Page, uid: string): Promise<Locator> => {
  await openStorageDirectory(page, ['.genoacms', 'components', 'public', uid])

  const publication = page.getByRole('main').getByRole('link', { name: /[0-9a-f-]{36}/ }).first()
  await expect(publication).toBeVisible({ timeout: SLOW })
  await publication.click()

  return page.getByRole('button', { name: /\.json$/ })
}

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
 * the application actually performs: the definition and its publications, the header, the
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
  // Through the registrar, because the editor no longer creates anything: a component is born in
  // one place whichever kind it is, so that one act decides its type.
  await openRegistrar(page)
  await page.getByRole('button', { name: 'Register component' }).click()

  const dialog = page.getByRole('dialog', { name: 'Register a new component' })
  await dialog.getByLabel('Component name:').fill(name)
  await dialog.getByRole('radio', { name: 'Code it here' }).check()
  await dialog.getByRole('button', { name: 'Create' }).click()

  // Registering opens the registrar, whichever kind was chosen: a component with no attributes has
  // no parameters to write a body against, so describing it comes first.
  await expect(page).toHaveURL(/\/components\/registrar\/[^/]+$/, { timeout: SLOW })
  return page.url().split('/').pop() as string
}

/** Opens a dynamic component's code, which is where most of these tests are about to work. */
const openCodeFor = async (page: Page, uid: string): Promise<void> => {
  await page.goto(`/components/editor/${uid}`)
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: SLOW })
}

/**
 * Types into the code editor.
 *
 * CodeMirror renders a contenteditable rather than a textarea, so the text goes in through the
 * keyboard the way an author would enter it.
 */
const writeCode = async (page: Page, code: string): Promise<void> => {
  const editor = page.locator('.cm-content').first()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(code)

  // **Saving is an act now.** The editor used to write a second after typing stopped, and the helper
  // waited on that request; there is no autosave to wait for, and a test that skipped this would
  // publish whatever the draft held before it typed.
  await page.getByRole('button', { name: 'Save' }).click()
  await reported(page, 'Code saved')
}

/**
 * A component **body** the pipeline accepts.
 *
 * An author writes a body and nothing around it: the entry function, its parameters and their types
 * are emitted from the component's header. A component registered without attributes has no
 * parameters, so this refers to none.
 */
const componentSource = (): string => "return 'hi'\n"

/**
 * Publishes, from the registrar.
 *
 * **The registrar, not the editor**, and navigating there is part of the helper rather than an
 * inconvenience it works around: publishing is an act on the whole component, so it lives on the one
 * surface both kinds share. A helper that could publish from the code editor would be describing a
 * flow the CMS does not have.
 */
const publishFrom = async (page: Page, uid: string): Promise<void> => {
  await page.goto(`/components/registrar/${uid}`)
  await page.getByRole('button', { name: 'Publish' }).click()

  const dialog = page.getByRole('dialog', { name: 'Publish the component' })
  await dialog.getByRole('textbox').last().fill('published by the end-to-end suite')
  await dialog.getByRole('button', { name: /publish/i }).click()
}

/**
 * Opening a component the editor has nothing to show for.
 *
 * Reported from a passing run's server log rather than by any test: a `[500] GET
 * /components/editor/{uid}` sat in the output of a suite that was entirely green, because nothing
 * asserts a status code for a page that renders no content of its own. Deleting a dynamic component
 * from the registrar is what makes it ordinary — the editor URL outlives the component.
 */
test.describe('a component the editor cannot open', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
  })

  test('answers 404 rather than a server error', async ({ page }) => {
    // A well-formed uid that names nothing, which is what a deleted component's bookmark becomes.
    const response = await page.goto('/components/editor/00000000-0000-4000-8000-000000000000')

    expect(response?.status()).toBe(404)
  })
})

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

  test('is created and opens in the registrar, where its shape is described', async ({ page }) => {
    // Not the code editor. A component registered a moment ago has no attributes, so its signature
    // has no parameters and there is nothing yet to write a body against — describing comes first,
    // which is also the order the cards on /components are in.
    uid = await createDynamic(page, name, created)

    await expect(page).toHaveURL(new RegExp(`/components/registrar/${uid}$`))
    await expect(page.getByRole('button', { name: 'Add attribute' })).toBeVisible()
  })

  test('links from the registrar to its code', async ({ page }) => {
    // The one place the two kinds differ on screen: a component whose code lives in the consuming
    // application has none for the CMS to open.
    uid = await createDynamic(page, name, created)

    await page.getByRole('link', { name: 'Edit the code' }).click()

    await expect(page).toHaveURL(new RegExp(`/components/editor/${uid}$`))
  })

  test('shows the signature its body is wrapped in', async ({ page }) => {
    // An author writes a body, so without this they are writing against parameters nothing on
    // screen names — and against identifiers the CMS derived from attribute names they never saw
    // normalized. A component registered with no attributes still has a signature to show.
    const createdId = await createDynamic(page, name, created)
    await openCodeFor(page, createdId)

    await expect(page.getByText('export default function component')).toBeVisible({ timeout: SLOW })
  })

  test('names the parameter after the attribute, not after its identifier', async ({ page }) => {
    // Reported from using the CMS: the signature declared parameters called `_3f2a1b…`, because the
    // emitter read the attribute's `name` — a field left over from deriving shapes out of code,
    // which the registrar fills with the attribute's uid. The name a person types goes to
    // `schema.title`, which is what the registrar's own Name field writes.
    const uid = await createDynamic(page, name, created)

    await page.getByRole('button', { name: 'Add attribute' }).click()
    await page.getByText('string', { exact: true }).click()
    await page.getByLabel('Name:').last().fill('heading')
    await page.getByRole('button', { name: 'Submit' }).click()

    // Waited for, not assumed. Submitting is a remote call, and navigating straight afterwards
    // raced it — the editor would load a header saved a moment later and show a signature with no
    // parameters. It passed for as long as the save happened to win.
    await reported(page, 'Component updated')

    await page.goto(`/components/editor/${uid}`)
    await expect(page.getByText('heading: string')).toBeVisible({ timeout: SLOW })
  })

  test('keeps the draft once it is saved', async ({ page }) => {
    uid = await createDynamic(page, name, created)
    await openCodeFor(page, uid)
    await writeCode(page, 'const answer = 42\nreturn answer\n')

    // Reloading shows whether the save really wrote. Reloading is also the point at which an unsaved
    // draft would be lost, which is why the guard below exists.
    await page.reload()
    await expect(page.locator('.cm-content').first()).toContainText('answer', { timeout: SLOW })
  })

  test('steps the body back and forward through saved states', async ({ page }) => {
    test.setTimeout(180_000)
    // What replaced commits. An author marks a point by saving, and undo returns to the point
    // before it — the same `UndoRedoAdjunct` the registrar and the page editor use.
    uid = await createDynamic(page, name, created)
    await openCodeFor(page, uid)

    await writeCode(page, 'return 1\n')
    await writeCode(page, 'return 2\n')

    const editor = page.locator('.cm-content').first()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(editor).toContainText('return 1', { timeout: SLOW })

    await page.getByRole('button', { name: 'Redo' }).click()
    await expect(editor).toContainText('return 2', { timeout: SLOW })

    // The step is stored, not held on the page: a reload must show what the redo produced.
    await page.reload()
    await expect(page.locator('.cm-content').first()).toContainText('return 2', { timeout: SLOW })
  })

  test('offers nothing to undo before anything is saved', async ({ page }) => {
    // A control that is always enabled is how the registrar's undo appeared to exist without
    // working. Depth comes from the stored history, and a component nobody has edited has none.
    uid = await createDynamic(page, name, created)
    await openCodeFor(page, uid)

    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  test('warns before leaving with unsaved changes, and lets the author stay', async ({ page }) => {
    test.setTimeout(180_000)
    uid = await createDynamic(page, name, created)
    await openCodeFor(page, uid)

    // Typed and deliberately not saved. Nothing is saved first: a freshly registered component has
    // an empty body, so typing into it is already a difference worth warning about — and adding a
    // save would only put a revalidation between the edit and the click for no gain.
    const editor = page.locator('.cm-content').first()
    await editor.click()
    await page.keyboard.type('return 2')

    /*
     * Dismissing the dialog is what "stay" means.
     *
     * **Awaited rather than counted afterwards.** `click()` resolves as soon as the click is
     * dispatched, and the dialog event reaches Node some time later — so asserting a counter
     * straight after the click read it before the dialog had arrived, and the test failed while the
     * guard was working perfectly.
     */
    let asked: string | undefined
    const wasAsked = new Promise<void>((resolve) => {
      page.on('dialog', async (dialog) => {
        asked = dialog.message()
        await dialog.dismiss()
        resolve()
      })
    })

    // The editor's own link back to the registrar: an ordinary in-app navigation, which is the case
    // `beforeNavigate` can actually cancel.
    await page.getByRole('link', { name: 'Edit the description' }).click()
    await wasAsked

    expect(asked).toMatch(/unsaved changes/i)

    // Still here, and still holding the unsaved text — a guard that warned and navigated anyway
    // would satisfy an assertion about the dialog alone.
    await expect(page).toHaveURL(new RegExp(`/components/editor/${uid}$`))
    await expect(page.locator('.cm-content').first()).toContainText('return 2')

    // Saved before leaving, so the fixture teardown can navigate away without meeting the guard.
    await page.getByRole('button', { name: 'Save' }).click()
    await reported(page, 'Code saved')
  })

  test('publishes, which compiles and signs it', async ({ page }) => {
    test.setTimeout(180_000)
    uid = await createDynamic(page, name, created)
    await openCodeFor(page, uid)
    await writeCode(page, componentSource())

    // Publishing runs analysis, compiles, signs with the key hierarchy and writes the documents. It
    // is the slowest thing the product does, and the one most worth knowing still works. There is
    // no act in between: the draft is saved as it is typed and is what gets built.
    await publishFrom(page, uid)

    // The exact string the server returns on success. A pattern that also matched a failure message
    // was what let this test pass for months while every publication was in fact being refused.
    await reported(page, 'Component published')

    // What "publishes" means for a component with code: **two** signed documents in one directory
    // named for the publication. Asserting only that something was written would not catch a header
    // that never reached the bucket, which is the half a consumer needs to call the other half.
    const documents = await openSolePublication(page, uid)
    await expect(documents).toHaveCount(2, { timeout: SLOW })
    await expect(page.getByRole('button', { name: /\/header\.json$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /\/executable\.json$/ })).toBeVisible()
  })

  test('reports a refusal instead of claiming to have published', async ({ page }) => {
    test.setTimeout(180_000)
    uid = await createDynamic(page, name, created)
    await openCodeFor(page, uid)

    // A component may not import anything: what is signed has to be a function of the source alone.
    // Since an author writes a **body**, an import is not merely refused but inexpressible — it is a
    // module-level construct in something that is not a module — so the refusal arrives as a syntax
    // error rather than as the import rule. What matters is that a refusal is reported at all.
    await writeCode(page, `import { format } from "date-fns"\n${componentSource()}`)

    await publishFrom(page, uid)

    // Matched on the located line rather than on "some text appeared". The registrar carries hidden
    // helper text that `/.+/` resolves to, so the loose pattern passed whether or not anything was
    // refused — and the contract's claim is precisely that a refusal an author cannot locate is a
    // refusal without a reason.
    await reported(page, /line \d+/)
    await expect(page.getByText('Component published')).toHaveCount(0)

    // Nothing was published — and that includes the **header**, which is built before the code is
    // compiled but written after it. A refusal that still wrote a header would leave a publication a
    // consumer could fetch and find half of.
    //
    // Asserted as "the directory does not exist", which is the strongest form of absent: a prefix
    // only exists while something is under it. `openStorageDirectory` would throw on the missing
    // segment, so the walk is the tolerant one from the storage helpers.
    expect(await openDirectory(page, ['.genoacms', 'components', 'public', uid])).toBe(false)
  })

  test('accepts a name no source file could declare', async ({ page }) => {
    // This was refused for as long as a component's name was the entry function its source had to
    // declare: `my-hero` could be created and never published, and the only error it could produce
    // was that no such function existed. The CMS emits that function under a fixed name of its own
    // now, so the name is a label a person reads and a hyphen in it means nothing.
    const labelled = `${fixtureName('dynamic')}-with-hyphens`

    const createdUid = await createDynamic(page, labelled, created)

    expect(createdUid).toMatch(/^[0-9a-f-]{36}$/)
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
    // Deleted from the code editor, which is the flow this asserts; the registrar has its own.
    uid = await createDynamic(page, name, created)
    await openCodeFor(page, uid)

    await page.getByRole('button', { name: 'Delete component' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    await dialog.getByRole('textbox').fill(name)
    await dialog.getByRole('button', { name: /Yes, delete/ }).click()
    await reported(page, 'Component deleted')

    await openEditor(page)
    await expect(card(page, name)).toHaveCount(0, { timeout: SLOW })
  })
})
