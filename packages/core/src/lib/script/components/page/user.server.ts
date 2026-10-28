import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import type { IsSerializable, PageEntry } from '$lib/script/components/page/entry/types'
import {
  listOrCreatePageList,
  listPageSummaries,
  getPageEntry,
  getPageEntryVersioned,
  savePageEntry,
  applyPageEdit,
  createPageIfAbsent,
  generateReadablePageTree,
  deletePageEntry,
  type PageSummary
} from './page.server'
import { getComponentHeader } from '$lib/script/components/componentHeader/io.server'
import { getPublishedComponent } from '$lib/script/components/publication/io.server'
import { addNode, moveNode, removeNode, setValues, applyNodeEdit, PageEditError } from './edits'
import { undoPageEntryState, redoPageEntryState } from './entry'

/**
 * Page operations performed **by a user**.
 *
 * `page.server` is the primary service and stays unprivileged: `tree/index.ts` calls `getPageEntry`
 * to resolve a link to another page while building a readable tree, which is rendering rather than a
 * user opening a page.
 *
 * **The permission is chosen by what an operation alters, not by which screen it came from.** The
 * storage primitive underneath is one upsert, so a single `savePage` wrapper would have to pick one
 * permission for every kind of edit — collapsing the content/structure distinction that the whole
 * pair of permissions exists to express. Each wrapper therefore names an intent, and the call site
 * declares which one it is performing.
 *
 * Content permissions are instance-scoped, so no resource is passed.
 */

const listUserPages = async (ctx: AuthContext) => {
  requirePermission(ctx, 'pages:read')
  return await listOrCreatePageList()
}

const getUserPageEntry = async (ctx: AuthContext, name: string): Promise<PageEntry<IsSerializable>> => {
  requirePermission(ctx, 'pages:read')
  return await getPageEntry(name)
}

const listUserPageSummaries = async (ctx: AuthContext): Promise<PageSummary[]> => {
  requirePermission(ctx, 'pages:read')
  return await listPageSummaries()
}

/** HIS-2: the entry with the version a later save must carry. */
const getUserPageEntryVersioned = async (ctx: AuthContext, name: string) => {
  requirePermission(ctx, 'pages:read')
  return await getPageEntryVersioned(name)
}

/** Editing values on a page: attributes, storage resources, the preview URL. Conditional on `version` (HIS-2). */
const saveUserPageContent = async (ctx: AuthContext, page: PageEntry<IsSerializable>, version: string) => {
  requirePermission(ctx, 'pages:content_edit')
  return await savePageEntry(page, version)
}

/** Changing a page's shape: creating it, adding or rearranging nodes. Conditional on `version` (HIS-2). */
const saveUserPageStructure = async (ctx: AuthContext, page: PageEntry<IsSerializable>, version: string) => {
  requirePermission(ctx, 'pages:structure_edit')
  return await savePageEntry(page, version)
}

/** PGE-2, PGE-11: a new page, of a published component, under a free name. */
const createUserPage = async (ctx: AuthContext, name: string, componentUID: string): Promise<string | undefined> => {
  requirePermission(ctx, 'pages:structure_edit')
  return await createPageIfAbsent(name, componentUID)
}

/** PGE-4: a node edit sent by a screen; its values need content_edit, its slots structure_edit. */
const editUserNode = async (ctx: AuthContext, name: string, version: string, sent: unknown) => {
  requirePermission(ctx, 'pages:read')
  return await applyPageEdit(name, version, [], (contents, headers) => applyNodeEdit(contents, sent, headers), result => {
    if (result.content) requirePermission(ctx, 'pages:content_edit')
    if (result.structure) requirePermission(ctx, 'pages:structure_edit')
  })
}

interface ChildNodeOrder {
  parent: string
  slot: string
  componentUID: string
  position?: number
}

/** PGE-5, TOL-10: a node of a stored, published component, inserted into a slot. */
const addUserChildNode = async (ctx: AuthContext, name: string, version: string, order: ChildNodeOrder) => {
  requirePermission(ctx, 'pages:read')
  requirePermission(ctx, 'pages:structure_edit')
  const header = await getComponentHeader(order.componentUID)
  if (header === null) throw new PageEditError('pages/unpublished-component', `pages/unpublished-component: ${order.componentUID}`)
  const published = await getPublishedComponent(order.componentUID) !== null
  return await applyPageEdit(name, version, [header.uid], (contents, headers) =>
    addNode(contents, order.parent, order.slot, header, published, headers, order.position))
}

/** TOL-12 */
const moveUserNode = async (
  ctx: AuthContext, name: string, version: string,
  order: { node: string, parent: string, slot: string, position?: number }
) => {
  requirePermission(ctx, 'pages:read')
  requirePermission(ctx, 'pages:structure_edit')
  return await applyPageEdit(name, version, [], (contents, headers) =>
    moveNode(contents, order.node, order.parent, order.slot, headers, order.position))
}

/** TOL-13 */
const removeUserNode = async (ctx: AuthContext, name: string, version: string, node: string) => {
  requirePermission(ctx, 'pages:read')
  requirePermission(ctx, 'pages:structure_edit')
  return await applyPageEdit(name, version, [], contents => removeNode(contents, node))
}

/** TOL-11 */
const setUserValues = async (ctx: AuthContext, name: string, version: string, node: string, values: Record<string, unknown>) => {
  requirePermission(ctx, 'pages:read')
  requirePermission(ctx, 'pages:content_edit')
  return await applyPageEdit(name, version, [], (contents, headers) => setValues(contents, node, values, headers))
}

/** PGE-6, TOL-14: the preview URL, which records no step. */
const setUserPreviewURL = async (ctx: AuthContext, name: string, version: string, url: string) => {
  requirePermission(ctx, 'pages:read')
  requirePermission(ctx, 'pages:content_edit')
  const { page } = await getPageEntryVersioned(name)
  return await savePageEntry({ ...page, previewURL: url }, version)
}

/**
 * Undo and redo.
 *
 * Demands **both** editing permissions, because a page's history contains changes of either kind and
 * the entry being reverted does not record which. Demanding only one would let a structure editor
 * revert a content change they could not have made.
 */
const revertUserPageEntry = async (ctx: AuthContext, page: PageEntry<IsSerializable>, version: string) => {
  requirePermission(ctx, 'pages:content_edit')
  requirePermission(ctx, 'pages:structure_edit')
  return await savePageEntry(page, version)
}

/** PGE-7: steps the page's history, and writes the entry also when there was nothing to step. */
const stepUserPage = async (ctx: AuthContext, name: string, version: string, direction: 'undo' | 'redo') => {
  requirePermission(ctx, 'pages:read')
  const { page } = await getPageEntryVersioned(name)
  const stepped = direction === 'undo' ? undoPageEntryState(page) : redoPageEntryState(page)
  return await revertUserPageEntry(ctx, stepped, version)
}

/**
 * Generates the readable tree, which is what makes an edit visible.
 *
 * Demands the edit that produced it **and** `pages:publish`: publishing someone else's saved draft
 * is still publishing, and the tree is the artifact a visitor sees.
 */
const generateUserReadablePageTree = async (ctx: AuthContext, page: PageEntry<IsSerializable>) => {
  requirePermission(ctx, 'pages:content_edit')
  requirePermission(ctx, 'pages:publish')
  return await generateReadablePageTree(page)
}

/**
 * Deleting a page.
 *
 * `pages:delete` and nothing else. It is deliberately **not** additionally gated on the edit
 * permissions: deletion is a distinct authority in the taxonomy, and demanding an edit permission
 * alongside it would make the narrow role — someone who may remove a page but not rewrite one —
 * inexpressible.
 *
 * Nor is it gated on `pages:publish`, though deleting removes the built tree and so unpublishes the
 * page. Publishing puts something in front of visitors; this takes the whole page away, which is
 * what `pages:delete` names. Requiring both would mean nobody could delete a page they were not also
 * trusted to publish, which is the wrong way round.
 */
const deleteUserPage = async (ctx: AuthContext, name: string) => {
  requirePermission(ctx, 'pages:delete')
  return await deletePageEntry(name)
}

export {
  listUserPages,
  listUserPageSummaries,
  getUserPageEntry,
  getUserPageEntryVersioned,
  createUserPage,
  editUserNode,
  addUserChildNode,
  moveUserNode,
  removeUserNode,
  setUserValues,
  setUserPreviewURL,
  stepUserPage,
  saveUserPageContent,
  saveUserPageStructure,
  revertUserPageEntry,
  generateUserReadablePageTree,
  deleteUserPage
}
