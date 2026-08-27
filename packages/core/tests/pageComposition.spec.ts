import { test, expect, type Page } from '@playwright/test'
import { signIn, confirm, toast } from './support/session'
import { SLOW, reported } from './support/storage'

/**
 * Composing a page out of components, end to end.
 *
 * This is the product's central workflow and the one with the least coverage: `components.spec.ts`
 * exercises the catalog and the code editor, `pages.spec.ts` creates a page and publishes it, but
 * nothing until now built a **tree** — a page whose root component has a slot, with other components
 * nested inside it — or exercised what an author does to that tree afterwards: reorder it, undo,
 * redo, remove a node.
 *
 * ## It is written to fail where the product is incomplete
 *
 * These tests state what the features are supposed to do. Where the implementation does not yet do
 * it, the test fails rather than being softened to match — a suite that asserts current behavior
 * cannot tell you when behavior is wrong. Failures here are findings, not breakage.
 *
 * ## Fixtures
 *
 * Everything created is named with the `e2e` prefix and removed by the final tests. The suite is
 * **serial**: each test builds on the one before, so a failure early on leaves later fixtures
 * uncreated and the cleanup incomplete. Anything left behind is identifiable by its prefix and safe
 * to remove by hand — `e2ePage`, `e2e*Component`, and the page `e2eComposedPage`.
 */

const PREFIX = 'e2e'
const PAGE_COMPONENT = `${PREFIX}Page`
const PAGE_NAME = `${PREFIX}ComposedPage`
const SLOT = 'body'

/** One component per remaining attribute type, so every editor is exercised by the tree. */
const ATTRIBUTE_TYPES = [
  'boolean', 'number', 'string', 'text', 'markdown', 'richText', 'link', 'storageResource'
] as const

const componentFor = (type: string): string =>
  `${PREFIX}${type[0].toUpperCase()}${type.slice(1)}Component`

// ---------------------------------------------------------------------------------------------
// Driving the prebuilt component editor
// ---------------------------------------------------------------------------------------------

/** Registers a prebuilt component and lands on its editor. */
const createComponent = async (page: Page, name: string): Promise<void> => {
  await page.goto('/components/registrar')
  await page.getByRole('button', { name: 'Register component' }).click()
  await page.getByLabel('Component name:').fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByText(`Component: ${name}`)).toBeVisible()
}

/** Adds an attribute of the given type, and names it. The name is `schema.title`. */
const addAttribute = async (page: Page, type: string, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'Add attribute' }).click()
  await page.getByText(type, { exact: true }).click()

  // The newest attribute is appended, so its name field is the last one on the page.
  const nameField = page.getByLabel('Name:').last()
  await expect(nameField).toBeVisible()
  await nameField.fill(name)
}

const saveComponent = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(toast(page, /success|saved|updated/i)).toBeVisible()
}

/**
 * Publishes the component whose registrar page is open.
 *
 * **Every fixture here has to be published**, because under R3 a page may only be composed from
 * components that have been. Before R3 these fixtures were saved and never released, and the pickers
 * offered them anyway — so this is not setup that happens to be needed, it is the rule under test
 * being satisfied the way an author would satisfy it.
 */
const publishComponent = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Publish' }).click()
  const dialog = page.getByRole('dialog', { name: 'Publish the component' })
  await dialog.getByRole('textbox').last().fill('published by the end-to-end suite')
  await dialog.getByRole('button', { name: /publish/i }).click()
  await reported(page, 'Component published')
}

const openComponent = async (page: Page, name: string): Promise<void> => {
  await page.goto('/components/registrar')
  // `.first()` rather than a strict match: an interrupted run can leave a second component of the
  // same name behind, and failing to open either would hide the real result behind a fixture problem.
  await page.getByRole('link', { name: new RegExp(`\\b${name}$`) }).first().click()
  await expect(page.getByText(`Component: ${name}`)).toBeVisible()
}

// ---------------------------------------------------------------------------------------------
// Driving the page editor
// ---------------------------------------------------------------------------------------------

/**
 * The cards nested in the slot, in document order — which is the order they are stored in.
 *
 * The slot renders its own `Card` around the nested ones, so "a card containing an Edit link"
 * matches the container as well as its contents. The container is the one carrying the add button,
 * which is what `hasNot` excludes.
 */
const nestedCards = (page: Page) =>
  page.locator('.card')
    .filter({ has: page.getByRole('link', { name: 'Edit' }) })
    .filter({ hasNot: page.getByRole('button', { name: 'Add component' }) })

const nestedNames = async (page: Page): Promise<string[]> => {
  const names = await nestedCards(page).allInnerTexts()
  // Each card reads "name #abcde"; the uid fragment is deliberately not asserted on.
  return names.map(text => text.trim().split(/\s+/)[0])
}

/**
 * Opens a page's editor and waits for it to be ready.
 *
 * `/components/pages/{name}` redirects to the root node, so reading the DOM straight after `goto`
 * measures the page mid-redirect and finds nothing. Reading counts without waiting is how an empty
 * result gets mistaken for a persistence bug.
 */
const openPage = async (page: Page, name: string): Promise<void> => {
  await page.goto(`/components/pages/${name}`)
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByText(SLOT, { exact: true })).toBeVisible()
}

/** A page of its own, so one test's tree is not another's starting state. */
const createPage = async (page: Page, name: string): Promise<void> => {
  await page.goto('/components/pages')
  await page.getByRole('button', { name: 'Create page' }).click()
  await page.getByLabel('Name:').fill(name)
  await page.getByLabel('Component:').selectOption({ label: PAGE_COMPONENT })
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

/**
 * Adds a component to the slot from the picker.
 *
 * The picker's buttons carry an icon before their label, so their accessible name has a leading
 * space and an exact match never succeeds. The form wrapping each one is the stable handle: it
 * carries the component's schema and exactly one button.
 */
const nestComponent = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'Add component' }).click()
  await page.locator('form').filter({ hasText: name }).getByRole('button').click()
  await expect(nestedCards(page).filter({ hasText: name })).toHaveCount(1)
}

/**
 * **No retries.** Each test builds on the one before, so a retry would re-run the file from the top
 * and register a second copy of every component — turning one failure into a bucket full of
 * duplicates and a strict-mode violation that hides the original cause.
 *
 * Serial is declared **per group** rather than for the file. Serial mode skips everything after a
 * failure, and these groups test different features: a defect in nesting should not take the reorder,
 * undo, redo, delete and build tests with it and leave their state unknown.
 */
test.describe.configure({ retries: 0 })

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

// ---------------------------------------------------------------------------------------------

test.describe('building the component catalog', () => {
  test.describe.configure({ mode: 'serial' })

  test('creates a page component with a components slot', async ({ page }) => {
    // Registering, describing, saving and publishing are four round trips to real storage.
    test.setTimeout(180_000)
    await createComponent(page, PAGE_COMPONENT)
    await addAttribute(page, 'components', SLOT)
    await saveComponent(page)
    await publishComponent(page)

    await openComponent(page, PAGE_COMPONENT)
    // Reopening is the assertion: an attribute that only exists in unsaved local state would pass
    // every check made before the reload and none made after it.
    await expect(page.getByLabel('Name:').last()).toHaveValue(SLOT)
  })

  test('creates one component per remaining attribute type', async ({ page }) => {
    // Eight components, each registered, described, saved and **published** — R3 means a fixture is
    // not usable until it has been released, so this builder does twice the round trips it used to
    // and comfortably exceeds the default per-test budget.
    test.setTimeout(180_000)
    for (const type of ATTRIBUTE_TYPES) {
      await createComponent(page, componentFor(type))
      await addAttribute(page, type, `${type}Value`)
      await saveComponent(page)
      await publishComponent(page)
    }

    await page.goto('/components/registrar')
    for (const type of ATTRIBUTE_TYPES) {
      await expect(page.getByText(componentFor(type), { exact: true })).toBeVisible()
    }
  })
})

test.describe('composing the page', () => {
  test.describe.configure({ mode: 'serial' })

  test('creates a page rooted in the page component', async ({ page }) => {
    await page.goto('/components/pages')
    await page.getByRole('button', { name: 'Create page' }).click()
    await page.getByLabel('Name:').fill(PAGE_NAME)
    await page.getByLabel('Component:').selectOption({ label: PAGE_COMPONENT })
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.getByRole('heading', { name: PAGE_NAME })).toBeVisible()
    // The root node's editor, which is where the slot is rendered.
    await expect(page.getByText(SLOT, { exact: true })).toBeVisible()
  })

  test('nests every test component in the slot', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto(`/components/pages/${PAGE_NAME}`)

    for (const type of ATTRIBUTE_TYPES) {
      await nestComponent(page, componentFor(type))
    }

    expect(await nestedNames(page)).toEqual(ATTRIBUTE_TYPES.map(componentFor))
  })

  test('keeps the nesting after a reload', async ({ page }) => {
    // Nesting saves the page structure, so it must survive without an explicit save.
    await openPage(page, PAGE_NAME)

    expect(await nestedNames(page)).toEqual(ATTRIBUTE_TYPES.map(componentFor))
  })

  test('opens a nested component for editing', async ({ page }) => {
    await openPage(page, PAGE_NAME)
    await nestedCards(page).first().getByRole('link', { name: 'Edit' }).click()

    // The nested node's own editor, showing the attribute that component declares.
    await expect(page.getByText('booleanValue', { exact: true })).toBeVisible()
  })
})

test.describe('what a page may be composed from', () => {
  /*
   * **R3.** A page is built against a component's shape, and a shape nobody published is one no
   * consumer can verify — so an unpublished component must not be offerable at all.
   *
   * The fixture is registered and saved and deliberately **not** published, which is the whole of
   * the test: a component that reached the picker before this rule and must not now. Asserting only
   * that the published ones appear would pass just as well with the filter deleted.
   */
  const UNPUBLISHED = `${PREFIX}UnpublishedComponent`

  test.describe.configure({ mode: 'serial' })

  test('registers a component and leaves it unpublished', async ({ page }) => {
    test.setTimeout(180_000)
    await createComponent(page, UNPUBLISHED)
    await addAttribute(page, 'string', 'headline')
    await saveComponent(page)

    // The state the rest of this group depends on, asserted rather than assumed: were it published,
    // both tests below would pass for the opposite reason.
    // Exact: the component's own name contains the word, so a substring match finds the heading too.
    await expect(page.getByText('Unpublished', { exact: true })).toBeVisible({ timeout: SLOW })
  })

  test('does not offer it as the root of a new page', async ({ page }) => {
    await page.goto('/components/pages')
    await page.getByRole('button', { name: 'Create page' }).click()

    const select = page.getByLabel('Component:')
    await expect(select.getByRole('option', { name: PAGE_COMPONENT })).toHaveCount(1)
    await expect(select.getByRole('option', { name: UNPUBLISHED })).toHaveCount(0)
  })

  test('does not offer it to fill a slot', async ({ page }) => {
    await openPage(page, PAGE_NAME)
    await page.getByRole('button', { name: 'Add component' }).click()

    const picker = page.getByRole('dialog', { name: 'Add a new component' })
    await expect(picker.getByText(componentFor('string'), { exact: true })).toBeVisible()
    await expect(picker.getByText(UNPUBLISHED, { exact: true })).toHaveCount(0)
  })
})

test.describe('editing the tree', () => {
  // Not serial: each test builds its own tree, so they are independent, and a defect in one feature
  // must not leave the others' state unreported — which is the whole reason this suite exists.

  /** A fresh page with three nested components, so no test starts from another's leftovers. */
  const withTree = async (page: Page): Promise<string[]> => {
    await createPage(page, `${PAGE_NAME}${Math.random().toString(36).slice(2, 7)}`)
    for (const type of ['boolean', 'number', 'string']) await nestComponent(page, componentFor(type))
    return await nestedNames(page)
  }

  test('undoes the last change', async ({ page }) => {
    /*
     * **Two faults, told apart.** The server's history is correct — `entry/history.test.ts` drives
     * it directly — so an undo that appears to do nothing is either a step that was never taken or a
     * screen that did not refresh. Asserting only what is on screen conflates them, and asserting
     * only what survives a reload would pass while the editor showed the wrong tree.
     */
    const before = await withTree(page)

    await page.getByRole('button', { name: 'Undo' }).click()
    await page.waitForLoadState('networkidle')
    const onScreen = await nestedNames(page)

    await page.reload()
    const stored = await nestedNames(page)

    expect(stored).not.toEqual(before)
    expect(onScreen).toEqual(stored)
  })

  test('redoes it', async ({ page }) => {
    /*
     * **Both halves, in order.** This asserted only that the tree differed from where it started,
     * which is what an *undo* leaves behind — a working redo puts the tree back, so the old
     * assertion was the opposite of the property and could not have passed against a correct
     * editor. Asserting the restoration alone would be no better: it holds trivially while undo does
     * nothing, which is the state the editor is actually in.
     */
    const before = await withTree(page)

    await page.getByRole('button', { name: 'Undo' }).click()
    await page.waitForLoadState('networkidle')
    expect(await nestedNames(page)).not.toEqual(before)

    // Asserted before the click: a disabled Redo means the undo did not record a future, which is a
    // different fault from a redo that runs and restores nothing.
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled()

    await page.getByRole('button', { name: 'Redo' }).click()
    await page.waitForLoadState('networkidle')
    const onScreen = await nestedNames(page)

    /*
     * Told apart the same way undo is: a redo that appears to do nothing is either a step that was
     * never replayed or a screen that did not refresh, and the two need different fixes.
     *
     * The stored read **retries**, because object storage here is eventually consistent: a write can
     * succeed and the next read still miss it, so a single reload can report a redo that did happen
     * as one that did not.
     */
    await expect(async () => {
      await page.reload()
      expect(await nestedNames(page)).toEqual(before)
    }).toPass({ timeout: SLOW })

    expect(onScreen).toEqual(before)
  })

  test('removes a nested component', async ({ page }) => {
    const before = await withTree(page)
    const doomed = before[before.length - 1]

    await nestedCards(page).last().getByRole('button', { name: 'Delete' }).click()
    await confirm(page)

    await expect(nestedCards(page).filter({ hasText: doomed })).toHaveCount(0)
  })

  test('keeps the removal after saving and reloading', async ({ page }) => {
    // Removal edits the node's value rather than the page structure, so it is not persisted until
    // the page is saved. This asserts the save actually carries it.
    await withTree(page)
    await nestedCards(page).last().getByRole('button', { name: 'Delete' }).click()
    await confirm(page)
    const remaining = await nestedNames(page)

    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForLoadState('networkidle')
    await page.reload()

    expect(await nestedNames(page)).toEqual(remaining)
  })

  test('builds the page', async ({ page }) => {
    await withTree(page)
    await page.getByRole('button', { name: 'Build' }).click()
    await page.waitForLoadState('networkidle')

    // Building writes the readable tree. There is no success toast, so the assertion is the
    // negative one: it did not error.
    await expect(page.getByText(/error|failed/i)).toHaveCount(0)
  })
})

test.describe('reordering', () => {
  test.describe.configure({ mode: 'serial' })

  /** A fresh page with three nested components, so no test starts from another's leftovers. */
  const withTree = async (page: Page): Promise<string[]> => {
    await createPage(page, `${PAGE_NAME}${Math.random().toString(36).slice(2, 7)}`)
    for (const type of ['boolean', 'number', 'string']) await nestComponent(page, componentFor(type))
    return await nestedNames(page)
  }

  test('reorders nested components by dragging', async ({ page }) => {
    const before = await withTree(page)

    const first = nestedCards(page).nth(0).getByRole('button', { name: 'Dragger' })
    const second = nestedCards(page).nth(1)

    /*
     * **Moved to the target's own coordinates, in steps.**
     *
     * This used to finish with `page.mouse.move(0, 40)`, which is an **absolute** position and not a
     * delta — so after picking the first card up the pointer jumped to the top-left of the viewport,
     * well outside the list, and the card was dropped wherever that landed. The order did change;
     * it changed into `[b, c, a]`, which is what dropping past the end looks like, and the test read
     * that as "dragging does not reorder".
     *
     * `svelte-dnd-action` tracks pointer movement rather than HTML5 drag events, so the pointer has
     * to travel: a single jump to the destination is not a drag it recognizes.
     */
    const start = await first.boundingBox()
    if (!start) throw new Error('the dragger has no box to pick up from')

    await first.hover()
    await page.mouse.down()
    // A first move is what turns the press into a drag. The list reflows once it does — the dragged
    // card leaves the flow and a placeholder takes its place — so the destination has to be measured
    // *after* this, not before: a box read while the list was still at rest points at where the
    // second card used to be, which is how a drop meant for position 1 landed past the end.
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 12, { steps: 4 })

    const target = await second.boundingBox()
    if (!target) throw new Error('the second card has no box to drop onto')
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 })
    // The list animates each reorder over `flipDurationMs`, and the drop is resolved against where
    // the cards are *now*. Releasing mid-animation drops onto a layout that is still moving.
    await page.waitForTimeout(500)
    await page.mouse.up()
    await page.waitForLoadState('networkidle')

    const after = await nestedNames(page)
    expect(after[0]).toBe(before[1])
    expect(after[1]).toBe(before[0])
  })
})

/** Every `e2e`-prefixed name on the current list, in the order shown. */
const ownFixturesOn = async (page: Page): Promise<string[]> => {
  const texts = await page.getByRole('link').allInnerTexts()
  return texts.map(text => text.trim()).filter(text => text.startsWith(PREFIX))
}

/** The selection checkboxes belonging to this suite's fixtures, in the order they are shown. */
const ownCheckboxes = (page: Page) => page.locator(`button[aria-label^="select-${PREFIX}"]`)

/**
 * Selects this suite's own fixtures and removes them in one action.
 *
 * **Never "select all".** These lists hold real content beside the fixtures, and a cleanup that
 * selected everything would delete the instance's actual pages and components. Only checkboxes whose
 * label carries the prefix are ever clicked — the same rule the rest of the suite follows, applied to
 * the one operation that could do the most damage.
 *
 * Addressed by the label's **prefix** rather than by exact name, because an interrupted run can leave
 * two fixtures sharing a name and an exact match would resolve to both.
 *
 * The confirmation phrase is read off the dialog rather than assembled here: a test that composed it
 * independently could pass while the list showed something else.
 */
const deleteFixtures = async (page: Page): Promise<number> => {
  const boxes = await ownCheckboxes(page).all()
  for (const box of boxes) await box.click()
  if (boxes.length === 0) return 0

  await page.getByRole('button', { name: 'Delete selected' }).click()
  const phrase = (await page.locator('code').innerText()).trim()
  expect(phrase.split(',').length).toBe(boxes.length)

  await page.locator('input[name="confirmation"]').fill(phrase)
  await page.getByRole('button', { name: /^Yes, delete/ }).click()
  return boxes.length
}

test.describe('warning before a deletion breaks a page', () => {
  /*
   * **R6 and Q4.** Deleting a component removes its publications, and a published page pinning one
   * of them breaks — as an *unresolvable pin*, which a consumer cannot tell apart from a component
   * that never existed or a bucket it cannot reach. Nothing notices, nobody is told, and the page
   * renders short.
   *
   * R6 accepts that. What is asserted here is that it is accepted **knowingly**: the confirmation
   * names the published pages that would break before an author types the component's name.
   *
   * The deletion is deliberately **cancelled**. The warning is the subject, and actually deleting a
   * shared fixture would take the cleanup group's own assertions with it.
   */
  test.describe.configure({ mode: 'serial' })

  const PINNED_PAGE = `${PAGE_NAME}Pinned`
  const USED = componentFor('boolean')

  test('publishes a page that pins a component', async ({ page }) => {
    await createPage(page, PINNED_PAGE)
    await nestComponent(page, USED)

    await page.getByRole('button', { name: 'Build' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/error|failed/i)).toHaveCount(0)
  })

  test('names that page when the component is about to be deleted', async ({ page }) => {
    await openComponent(page, USED)
    await page.getByRole('button', { name: 'Delete component' }).click()

    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    // The page by name, because "some pages use this" is not something an author can act on.
    await expect(dialog.getByText(PINNED_PAGE)).toBeVisible({ timeout: SLOW })
  })

  test('refuses the deletion, not merely warns about it', async ({ page }) => {
    /*
     * **What the warning alone did not do.** R6 accepted the break and the confirmation named it;
     * four surfaces delete a component and only two carried the warning, so the other two went on
     * silently breaking published pages. The refusal is below all four, which is what this asserts:
     * the author confirms properly, and the component is still there afterwards.
     */
    await openComponent(page, USED)
    await page.getByRole('button', { name: 'Delete component' }).click()

    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    await dialog.getByRole('textbox').fill(USED)
    await dialog.getByRole('button', { name: `Yes, delete ${USED}` }).click()

    // Reported where the author is looking, and naming the pages so they can act on it. Asserted
    // after the refusal itself, because a silent deletion and an unreported refusal are different
    // faults and checking the message first would confuse them.
    await expect(dialog.getByText(/used by .* published page/i)).toBeVisible({ timeout: SLOW })

    // **The property that matters.** Refused means the component is still there, not merely that
    // something was said about it.
    await openComponent(page, USED)
    await expect(page.getByText(`Component: ${USED}`)).toBeVisible({ timeout: SLOW })
  })

  test('says so plainly when nothing depends on a component', async ({ page }) => {
    /*
     * The other half, and the one that makes the first mean anything. A dialog that renders an empty
     * space where a warning would go reads as one that has not finished loading — so the absence of
     * dependents is **stated**. Without this, a warning that silently failed to load would look
     * exactly like a component that is safe to delete.
     */
    await createComponent(page, `${PREFIX}UnusedComponent`)
    await saveComponent(page)
    await page.getByRole('button', { name: 'Delete component' }).click()

    const dialog = page.getByRole('dialog', { name: 'Delete the component' })
    await expect(dialog.getByText(/No published page uses this component/i))
      .toBeVisible({ timeout: SLOW })
  })
})

test.describe('removing everything', () => {
  test.describe.configure({ mode: 'serial' })

  test('refuses a confirmation that does not name everything selected', async ({ page }) => {
    // The guard the sequence exists for: one name is what someone types out of habit, and it must
    // not be enough to remove several things.
    await page.goto('/components/registrar')
    const boxes = await ownCheckboxes(page).all()
    expect(boxes.length).toBeGreaterThan(1)
    for (const box of boxes) await box.click()

    await page.getByRole('button', { name: 'Delete selected' }).click()
    const phrase = (await page.locator('code').innerText()).trim()
    await page.locator('input[name="confirmation"]').fill(phrase.split(',')[0])

    await expect(page.getByRole('button', { name: /^Yes, delete/ })).toBeDisabled()
  })

  test('deletes every page it created', async ({ page }) => {
    await page.goto('/components/pages')
    expect(await ownFixturesOn(page)).not.toEqual([])

    await deleteFixtures(page)

    // On the suite's real-storage budget: removing a component now removes its publications too, so
    // the listing settles later than it did when these fixtures were never published.
    await expect(ownCheckboxes(page)).toHaveCount(0, { timeout: SLOW })
  })

  test('deletes every component it created', async ({ page }) => {
    await page.goto('/components/registrar')
    expect(await ownFixturesOn(page)).not.toEqual([])

    await deleteFixtures(page)

    // On the suite's real-storage budget: removing a component now removes its publications too, so
    // the listing settles later than it did when these fixtures were never published.
    await expect(ownCheckboxes(page)).toHaveCount(0, { timeout: SLOW })
  })
})
