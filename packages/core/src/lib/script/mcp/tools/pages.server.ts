import type { AuthContext } from '#lib/script/authorization/context.js'
import { readingOnceEach } from '#lib/script/utils.js'
import { requirePermission } from '#lib/script/authorization/enforce.js'
import { isNotFound } from '@genoacms/contracts/storage'
import { getComponentHeader } from '#lib/script/components/componentHeader/io.server.js'
import type { ComponentHeader } from '#lib/script/components/componentHeader/component/types.js'
import { PageEditError, subtreeOf } from '#lib/script/components/page/edits.js'
import type { IsSerializable, PageEntry } from '#lib/script/components/page/entry/types.js'
import {
  addUserChildNode,
  createUserPage,
  deleteUserPage,
  generateUserReadablePageTree,
  getUserPageEntry,
  getUserPageEntryVersioned,
  listUserPageSummaries,
  moveUserNode,
  removeUserNode,
  setUserPreviewURL,
  setUserValues
} from '#lib/script/components/page/user.server.js'

type Args = Record<string, unknown>

async function readPage (ctx: AuthContext, name: string) {
  try {
    return await getUserPageEntryVersioned(ctx, name)
  } catch (error) {
    if (isNotFound(error)) throw new PageEditError('pages/no-such-page', `pages/no-such-page: ${name}`)
    throw error
  }
}

async function viewOf (page: PageEntry<IsSerializable>, version: string | undefined) {
  const readHeader = readingOnceEach(getComponentHeader)
  const reachable = subtreeOf(page.contents, page.contents.rootNodeUid)
  const nodes = await Promise.all(reachable.map(async uid => {
    const node = page.contents.nodes[uid]
    const header = await readHeader(node.entryReference) as ComponentHeader
    return {
      uid,
      component: { uid: header.uid, name: header.name },
      values: header.attributeOrder.map(key => {
        const { uid: attribute, name, type, value } = node.data[key]
        return { uid: attribute, name, type, value }
      })
    }
  }))
  return { name: page.name, previewURL: page.previewURL, root: page.contents.rootNodeUid, nodes, version }
}

/** TOL-8 */
async function listPages (ctx: AuthContext) {
  return await listUserPageSummaries(ctx)
}

/** TOL-8 */
async function getPage (ctx: AuthContext, { name }: Args) {
  const { page, version } = await readPage(ctx, name as string)
  return await viewOf(page, version)
}

/** TOL-9 */
async function createPage (ctx: AuthContext, { name, component }: Args) {
  requirePermission(ctx, 'pages:read')
  return { version: await createUserPage(ctx, name as string, component as string) }
}

/** TOL-10 */
async function addNode (ctx: AuthContext, { page, version, parent, slot, component, position }: Args) {
  const { version: next, result } = await addUserChildNode(ctx, page as string, version as string, {
    parent: parent as string, slot: slot as string, componentUID: component as string, position: position as number | undefined
  })
  return { node: result.node, version: next }
}

/** TOL-11 */
async function setValues (ctx: AuthContext, { page, version, node, values }: Args) {
  const { version: next } = await setUserValues(ctx, page as string, version as string, node as string, values as Record<string, unknown>)
  return { version: next }
}

/** TOL-12 */
async function moveNode (ctx: AuthContext, { page, version, node, parent, slot, position }: Args) {
  const { version: next } = await moveUserNode(ctx, page as string, version as string, {
    node: node as string, parent: parent as string, slot: slot as string, position: position as number | undefined
  })
  return { version: next }
}

/** TOL-13 */
async function removeNode (ctx: AuthContext, { page, version, node }: Args) {
  const { version: next } = await removeUserNode(ctx, page as string, version as string, node as string)
  return { version: next }
}

/** TOL-14 */
async function setPreviewUrl (ctx: AuthContext, { page, version, url }: Args) {
  return { version: await setUserPreviewURL(ctx, page as string, version as string, url as string) }
}

/** TOL-15 */
async function buildPage (ctx: AuthContext, { page }: Args) {
  await generateUserReadablePageTree(ctx, await getUserPageEntry(ctx, page as string))
  return { built: page }
}

/** TOL-15 */
async function deletePage (ctx: AuthContext, { page }: Args) {
  await deleteUserPage(ctx, page as string)
  return { deleted: page }
}

export { listPages, getPage, createPage, addNode, setValues, moveNode, removeNode, setPreviewUrl, buildPage, deletePage }
