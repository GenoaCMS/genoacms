import { test, expect } from '@playwright/test'
import { signIn } from './support/session'
import {
  COMPONENTS, PAGES,
  createComponent, createPage, openPage, nest, openNested, fill, saveNode, buildPage
} from './support/demo'

/**
 * Publishing the content the consumer demos render.
 *
 * **Not a test.** Nothing here asserts a product behaviour; it drives the CMS the way an author would
 * and leaves published documents behind. It is a Playwright scenario because that is the only way to
 * produce them *as the CMS produces them* — signed by the live key, pinned by a real page tree,
 * written where a consumer looks. A script writing the objects directly would be a second producer of
 * the documents the SDK exists to verify, which is exactly the circularity the demos are meant to
 * avoid.
 *
 * ## Running it
 *
 * ```
 * pnpm run test:demo
 * ```
 *
 * It is excluded from the ordinary end-to-end run by its `@demo` tag, because it creates content and
 * removes none — `demoCleanup.spec.ts` is separate and deliberate, so that a demo can be left standing
 * between sessions.
 *
 * ## What the pages are for
 *
 * Three shapes rather than three pages of content. Each exercises something a renderer can get wrong
 * on its own, and between them they cover what a wrapper in any framework has to handle:
 *
 * | page | what it is for |
 * | :--- | :--- |
 * | `demoHome` | Depth four, siblings, and one component used more than once — the publication cache, the recursion, and the ordering, together. |
 * | `demoFlat` | Siblings and no nesting. The simplest tree that is not a single node. |
 * | `demoEmpty` | A slot with nothing in it, which must render as a parent with no children rather than as a missing value. |
 *
 * Attribute values are filled in on purpose: a tree of empty strings renders as a shape with nothing
 * in it, and a wrapper that put every value in the wrong parameter would look identical.
 */

test.describe('@demo publishing the demo content', () => {
  /*
   * **Serial, and no retries.** Each step builds on the last, and a retry would re-run the file from
   * the top and register a second copy of every component — turning one failure into a bucket full of
   * duplicates.
   */
  test.describe.configure({ mode: 'serial', retries: 0 })

  test.beforeEach(async ({ page }) => {
    await signIn(page)
  })

  test('publishes the components the pages are composed from', async ({ page }) => {
    // Four components, each registered, described, saved and released: sixteen round trips to real
    // cloud storage.
    test.setTimeout(240_000)

    for (const component of Object.values(COMPONENTS)) {
      await createComponent(page, component)
    }

    await page.goto('/components/registrar')
    for (const component of Object.values(COMPONENTS)) {
      await expect(page.getByText(component.name, { exact: true })).toBeVisible()
    }
  })

  test('builds a page with depth, siblings and repetition', async ({ page }) => {
    /*
     * The tree, which is the point of this one:
     *
     *   Page
     *    └ Section "Welcome"
     *       ├ Card  "What this is"
     *       ├ Note  "first note"
     *       └ Section "Going deeper"
     *          └ Card "Nested twice"
     *
     * Four levels, a slot holding three different components, and `Card` appearing twice — which is
     * what makes the publication cache observable: two placements of one component that must not
     * share their values.
     */
    test.setTimeout(300_000)

    await createPage(page, PAGES.home, COMPONENTS.page.name)

    await nest(page, COMPONENTS.section.name)
    await openNested(page, COMPONENTS.section.name)
    await fill(page, 'heading', 'Welcome')
    await saveNode(page)

    await nest(page, COMPONENTS.card.name)
    await nest(page, COMPONENTS.note.name)
    await nest(page, COMPONENTS.section.name)

    await openNested(page, COMPONENTS.card.name)
    await fill(page, 'title', 'What this is')
    await fill(page, 'body', 'One page, fetched and verified by four different frameworks.')
    await saveNode(page)

    await openPage(page, PAGES.home)
    await openNested(page, COMPONENTS.section.name)
    await openNested(page, COMPONENTS.note.name)
    await fill(page, 'text', 'Every signature was checked in the browser.')
    await fill(page, 'order', '1')
    await saveNode(page)

    await openPage(page, PAGES.home)
    await openNested(page, COMPONENTS.section.name)
    await openNested(page, COMPONENTS.section.name)
    await fill(page, 'heading', 'Going deeper')
    await saveNode(page)

    await nest(page, COMPONENTS.card.name)
    await openNested(page, COMPONENTS.card.name)
    await fill(page, 'title', 'Nested twice')
    await fill(page, 'body', 'This card is four levels below the root.')
    await saveNode(page)

    await openPage(page, PAGES.home)
    await buildPage(page)
  })

  test('builds a page of siblings with no nesting', async ({ page }) => {
    test.setTimeout(240_000)

    await createPage(page, PAGES.flat, COMPONENTS.page.name)
    await nest(page, COMPONENTS.card.name)
    await nest(page, COMPONENTS.card.name)
    await nest(page, COMPONENTS.note.name)

    await openNested(page, COMPONENTS.card.name, 0)
    await fill(page, 'title', 'First')
    await fill(page, 'body', 'The first of two cards.')
    await saveNode(page)

    await openPage(page, PAGES.flat)
    await openNested(page, COMPONENTS.card.name, 1)
    // Deliberately different from the first: two placements of one component sharing a value is what
    // caching the resolved node rather than the publication would produce.
    await fill(page, 'title', 'Second')
    await fill(page, 'body', 'The second, which must not borrow the first\'s text.')
    await saveNode(page)

    await openPage(page, PAGES.flat)
    await openNested(page, COMPONENTS.note.name)
    await fill(page, 'text', 'A note beside them.')
    await fill(page, 'order', '2')
    await saveNode(page)

    await openPage(page, PAGES.flat)
    await buildPage(page)
  })

  test('builds a page whose slot is empty', async ({ page }) => {
    // An empty slot and an absent one are different documents, and a renderer that read one as the
    // other would either drop the parent or refuse the page.
    test.setTimeout(180_000)

    await createPage(page, PAGES.empty, COMPONENTS.page.name)
    await buildPage(page)
  })

  test('reports what the demo applications should ask for', async ({ page }) => {
    // The last step prints the names, because they are what the demos are configured with and
    // reading them out of the source of this file is one more place to get them wrong.
    await page.goto('/components/pages')
    for (const name of Object.values(PAGES)) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
    }
    console.log('\nDemo pages published:', Object.values(PAGES).join(', '), '\n')
  })
})
