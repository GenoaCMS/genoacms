import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import type { IsSerializable, PageEntry } from '$lib/script/components/page/entry/types'
import {
  listOrCreatePageList,
  getPageEntry,
  uploadPageEntry,
  generateReadablePageTree
} from './page.server'

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

/** Editing values on a page: attributes, storage resources, the preview URL. */
const saveUserPageContent = async (ctx: AuthContext, page: PageEntry<IsSerializable>) => {
  requirePermission(ctx, 'pages:content_edit')
  return await uploadPageEntry(page)
}

/** Changing a page's shape: creating it, adding or rearranging nodes. */
const saveUserPageStructure = async (ctx: AuthContext, page: PageEntry<IsSerializable>) => {
  requirePermission(ctx, 'pages:structure_edit')
  return await uploadPageEntry(page)
}

/**
 * Undo and redo.
 *
 * Demands **both** editing permissions, because a page's history contains changes of either kind and
 * the entry being reverted does not record which. Demanding only one would let a structure editor
 * revert a content change they could not have made.
 */
const revertUserPageEntry = async (ctx: AuthContext, page: PageEntry<IsSerializable>) => {
  requirePermission(ctx, 'pages:content_edit')
  requirePermission(ctx, 'pages:structure_edit')
  return await uploadPageEntry(page)
}

/**
 * Generates the readable tree, which is what makes an edit visible.
 *
 * Demands the edit that produced it **and** `pages:publish`: publishing someone else's saved draft
 * is still publishing, and the tree is the artefact a visitor sees.
 */
const generateUserReadablePageTree = async (ctx: AuthContext, page: PageEntry<IsSerializable>) => {
  requirePermission(ctx, 'pages:content_edit')
  requirePermission(ctx, 'pages:publish')
  return await generateReadablePageTree(page)
}

export {
  listUserPages,
  getUserPageEntry,
  saveUserPageContent,
  saveUserPageStructure,
  revertUserPageEntry,
  generateUserReadablePageTree
}
