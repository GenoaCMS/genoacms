import type { ComponentHeaderReference } from '../../componentHeader/component/types'
import type { ReadablePageNode } from './types'

import {
  defaultBucketId,
  fullyQualifiedNameToFilename,
  listOrCreateDirectory
} from '$lib/script/storage/storage.server'
import { pageReadableTreePath, getReadablePageTree } from './io.server'

/**
 * Which published pages depend on a component.
 *
 * **R6 accepted that deleting a component breaks the pages pinning it. It no longer does.** The
 * break is invisible from inside the CMS: a published tree goes on naming a publication that is no
 * longer there, and a consumer resolving that pin gets nothing back — which it cannot tell apart
 * from a component that never existed or a bucket it cannot reach. Nobody is notified, and the page
 * renders short.
 *
 * Q4 first answered this by *informing*: the confirmation named the pages that would break, and the
 * author decided. Using it showed why that is not enough. A warning is attached to a surface, and
 * there are four ways to delete a component — two single-component dialogs and two bulk selections —
 * so the one that carries no warning is the one that silently breaks a site. **The refusal is here,
 * below every surface**, and the warning stays as the explanation an author reads before meeting it.
 *
 * The CMS already holds every published tree, and every tree already names the components it pins,
 * so both the warning and the refusal are a scan rather than a new record to keep in step with the
 * truth.
 *
 * ## Published trees, not drafts
 *
 * A draft page referencing the component is not broken by the deletion — it simply cannot be built
 * afterwards, which the page editor says at the time. A **published** tree is the one already being
 * served to visitors, and it is what R6's accepted cost is about.
 *
 * ## A tree that cannot be read is reported, never skipped
 *
 * `getReadablePageTree` refuses a tree that does not verify, and rightly: there is no safe degraded
 * reading of a document whose plausible tampering is repointing a node at another component. But a
 * scan must not fail because one page is in that state, and it equally must not quietly leave that
 * page out — an author would be told nothing depends on the component when the truth is that nobody
 * can say. So those pages come back under a separate heading and the caller shows both.
 */

/** A published page that pins the component, and how much of it does. */
interface PinnedPage {
  name: string
  /** How many nodes in the tree pin it. One component may appear in a page more than once. */
  nodes: number
}

/**
 * What depends on a component, as far as anything can be established.
 *
 * Two lists rather than one, because "no page pins this" and "no page that could be read pins this"
 * are different assurances and only one of them is a reason to proceed calmly.
 */
interface ComponentDependents {
  pages: PinnedPage[]
  /** Published pages whose tree did not verify, so nothing can be promised about them. */
  unreadable: string[]
}

/** Every node in a tree, parents before children. */
const walkTree = function * (root: ReadablePageNode): Generator<ReadablePageNode> {
  yield root
  for (const value of Object.values(root.data)) {
    if (!Array.isArray(value)) continue
    for (const member of value) {
      // A list of URLs and a list of nodes are both arrays; only the latter has nodes in it.
      if (typeof member === 'string') continue
      yield * walkTree(member)
    }
  }
}

/**
 * How many of a tree's nodes pin the component.
 *
 * Compared on `uid` rather than on the component's **name**. A name is a label an author may reuse
 * or change, and a node carries both — matching on it would warn about pages using a different
 * component that happens to share a name, and miss pages using this one under an old one.
 */
const pinsIn = (tree: ReadablePageNode, uid: ComponentHeaderReference): number =>
  [...walkTree(tree)].filter(node => node.uid === uid).length

/** Every page that has been published, by name. The filenames are the names. */
const listPublishedPageNames = async (): Promise<string[]> => {
  const listing = await listOrCreateDirectory({
    bucket: defaultBucketId,
    // The trailing slash is what makes this a *directory* to the storage abstraction. Without it the
    // listing comes back empty rather than failing, and an empty listing here reads as "no page
    // depends on this component" — which is the one answer this must never invent.
    name: `${pageReadableTreePath}/`
  })
  return listing.files.map(file => fullyQualifiedNameToFilename(file.name))
}

/**
 * Reads one page's tree, keeping "did not verify" apart from "not published".
 *
 * `null` for a page with no tree, which is ordinary. `undefined` for one whose tree is there and
 * unreadable, which is the case the caller has to surface rather than absorb.
 */
const readTree = async (name: string): Promise<ReadablePageNode | null | undefined> => {
  try {
    return await getReadablePageTree(name)
  } catch {
    return undefined
  }
}

/**
 * Every published page pinning a component, and every page that could not be checked.
 *
 * Read in parallel: this runs when someone opens a deletion dialog and is waited on, and the pages
 * are independent of one another.
 */
const listPagesPinning = async (
  uid: ComponentHeaderReference
): Promise<ComponentDependents> => {
  const names = await listPublishedPageNames()
  const trees = await Promise.all(names.map(readTree))

  const pages: PinnedPage[] = []
  const unreadable: string[] = []

  names.forEach((name, index) => {
    const tree = trees[index]
    if (tree === undefined) {
      unreadable.push(name)
      return
    }
    if (tree === null) return

    const nodes = pinsIn(tree, uid)
    if (nodes > 0) pages.push({ name, nodes })
  })

  return { pages, unreadable }
}

/** Raised instead of breaking a published page. Carries the pages, so a caller can name them. */
class ComponentInUseError extends Error {
  constructor (readonly pages: PinnedPage[]) {
    super(
      `components/in-use: this component is used by ${pages.length === 1 ? 'a published page' : `${pages.length} published pages`} ` +
      `(${pages.map(page => page.name).join(', ')}). Remove it from ` +
      `${pages.length === 1 ? 'that page' : 'those pages'} and rebuild ` +
      `${pages.length === 1 ? 'it' : 'them'}, or delete the ${pages.length === 1 ? 'page' : 'pages'}, and then delete the component.`
    )
    this.name = 'ComponentInUseError'
  }
}

/**
 * Whether a failure is the dependants refusal.
 *
 * A predicate rather than `instanceof`, for the reason `io.server.ts` states about
 * `PublicationExistsError`: a route and a library reached through different module graphs can hold
 * different copies of the same class, and `instanceof` then answers `false` for the very error it
 * was written to catch. That failure is silent and reads as an unrelated server error — which is
 * exactly what it did here, turning a refusal an author was meant to read into a 500.
 */
const isComponentInUse = (error: unknown): boolean =>
  error instanceof Error && error.name === 'ComponentInUseError'

/**
 * Refuses to delete a component a published page is built on.
 *
 * **Enforced below the surfaces, not at them.** Four things delete a component — the registrar's
 * dialog and its bulk selection, the code editor's dialog and its bulk selection — and a rule that
 * lives in a confirmation is a rule the other three do not have. This is what the bulk paths get for
 * free, and it is why the check is not merely a nicer dialog.
 *
 * ## A page nobody can read does not block
 *
 * An unreadable tree is one that failed verification, and a tree that fails verification **is
 * already not being served**: this CMS refuses to return it and a consumer refuses to render it. So
 * a component it pins is not holding up a working page, and blocking on it would let a single
 * corrupt document freeze component deletion across the whole instance with no way out but deleting
 * pages blind.
 *
 * They are still surfaced in the confirmation, where an author can see that something could not be
 * checked. Refusing there and permitting here would be the wrong way round: the dialog is where
 * uncertainty is worth showing, and the gate is where only certainty should stop someone.
 */
const requireNoPublishedDependents = async (uid: ComponentHeaderReference): Promise<void> => {
  const { pages } = await listPagesPinning(uid)
  if (pages.length === 0) return
  throw new ComponentInUseError(pages)
}

export { listPagesPinning, requireNoPublishedDependents, ComponentInUseError, isComponentInUse }
export type { ComponentDependents, PinnedPage }
