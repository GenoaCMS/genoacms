import { fail, redirect, type Actions } from '@sveltejs/kit'
import {
  generateUserReadablePageTree,
  getUserPageEntry,
  saveUserPageContent,
  saveUserPageStructure,
  revertUserPageEntry
} from '$lib/script/components/page/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import type { AuthContext } from '$lib/script/authorization/context'
import {
  addChildNodeToNodeInPage,
  componentSchemaToNode,
  redoPageEntryState,
  serializeComponentNode,
  undoPageEntryState,
  updateComponentNode
} from '$lib/script/components/page/entry'
import { isString } from '$lib/script/utils'

export const load = async ({ params, parent }) => {
  const { page } = await parent()
  const { nodeUid } = params
  const node = page.contents.nodes[nodeUid]
  if (!node) return redirect(307, page.contents.rootNodeUid)

  return {
    node
  }
}

const updatePage = async (ctx: AuthContext, pageName: string, data: FormData, generateTree: boolean) => {
  const componentNodeText = data.get('componentNode')
  if (!isString(componentNodeText)) return fail(400, { reason: 'no-diff' })
  const componentNode = JSON.parse(componentNodeText)

  let page = await getUserPageEntry(ctx, pageName)
  page = updateComponentNode(page, componentNode)
  await saveUserPageContent(ctx, page)
  if (generateTree) return await generateUserReadablePageTree(ctx, page)
}

export const actions = {
  undo: async ({ params, locals }) => {
    const ctx = requireAuthContext(locals)
    const { pageName } = params
    let page = await getUserPageEntry(ctx, pageName)
    page = undoPageEntryState(page)
    await revertUserPageEntry(ctx, page)
  },
  redo: async ({ params, locals }) => {
    const ctx = requireAuthContext(locals)
    const { pageName } = params
    let page = await getUserPageEntry(ctx, pageName)
    page = redoPageEntryState(page)
    await revertUserPageEntry(ctx, page)
  },
  changePreviewURL: async ({
    request,
    params,
    locals
  }) => {
    const ctx = requireAuthContext(locals)
    const { pageName } = params
    const data = await request.formData()
    const value = data.get('value')
    if (!isString(value)) return fail(400, { reason: 'no-diff' })
    const page = await getUserPageEntry(ctx, pageName)

    await saveUserPageContent(ctx, {
      ...page,
      previewURL: value,
      lastModified: new Date().toISOString()
    })
  },
  update: async ({
    request,
    params,
    locals
  }) => {
    const { pageName } = params
    const data = await request.formData()
    await updatePage(requireAuthContext(locals), pageName, data, false)
  },
  updateAndGenerateTree: async ({
    request,
    params,
    locals
  }) => {
    const { pageName } = params
    const data = await request.formData()
    await updatePage(requireAuthContext(locals), pageName, data, true)
  },
  addChildNode: async ({ request, params, locals }) => {
    const ctx = requireAuthContext(locals)
    const { pageName, nodeUid } = params
    const data = await request.formData()
    const schema = data.get('schema')
    const attributeUID = data.get('attributeUID')
    if (!isString(schema)) return fail(400, { reason: 'no-schema' })
    if (!isString(attributeUID)) return fail(400, { reason: 'no-target-attribute' })
    const schemaObject = JSON.parse(schema) // TODO: validate schema
    let page = await getUserPageEntry(ctx, pageName)
    const currentNode = page.contents.nodes[nodeUid]
    if (!currentNode) fail(400, { reason: 'non-existent-node' })
    const childNode = await componentSchemaToNode(schemaObject)
    const serializeChildNode = serializeComponentNode(childNode)
    page = addChildNodeToNodeInPage(page, currentNode, attributeUID, serializeChildNode)
    await saveUserPageStructure(ctx, page)
  },
  setStorageResourceValue: async ({ request, params, locals }) => {
    const ctx = requireAuthContext(locals)
    const { pageName, nodeUid } = params
    const data = await request.formData()
    const valueText = data.get('value')
    if (!isString(valueText)) return fail(400, { reason: 'no-value' })
    const value = JSON.parse(valueText)
    let page = await getUserPageEntry(ctx, pageName)
    const node = page.contents.nodes[nodeUid]
    const attribute = node.data[value.attributeUID]
    attribute.value = JSON.parse(value.selection[0])
    page = updateComponentNode(page, node)
    await saveUserPageContent(ctx, page)
    return redirect(307, `/components/pages/${pageName}/${nodeUid}`)
  }
} satisfies Actions
