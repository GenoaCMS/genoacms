import { fail, redirect } from '@sveltejs/kit'
import { generateReadablePageTree, getPageEntry, uploadPageEntry } from '$lib/script/components/page/page.server'
import {
  addChildNodeToNodeInPage,
  componentSchemaToNode,
  redoPageEntryState,
  undoPageEntryState,
  updateComponentNode
} from '$lib/script/components/page/entry'

export const load = async ({ params, parent }) => {
  const { page } = await parent()
  const { nodeUid } = params
  const node = page.contents.nodes[nodeUid]
  if (!node) return redirect(307, page.contents.rootNodeUid)

  return {
    node
  }
}

const updatePage = async (pageName: string, data: FormData, generateTree: boolean) => {
  const componentNodeText = data.get('componentNode')
  if (!componentNodeText || typeof componentNodeText !== 'string') return fail(400, { reason: 'no-diff' })
  const componentNode = JSON.parse(componentNodeText)

  let page = await getPageEntry(pageName)
  page = updateComponentNode(page, componentNode)
  await uploadPageEntry(page)
  if (generateTree) return generateReadablePageTree(page)
}

export const actions = {
  undo: async ({ params }) => {
    const { pageName } = params
    let page = await getPageEntry(pageName)
    page = undoPageEntryState(page)
    await uploadPageEntry(page)
  },
  redo: async ({ params }) => {
    const { pageName } = params
    let page = await getPageEntry(pageName)
    page = redoPageEntryState(page)
    await uploadPageEntry(page)
  },
  changePreviewURL: async ({
    request,
    params
  }) => {
    const { pageName } = params
    const data = await request.formData()
    const value = data.get('value')
    if (!value || typeof value !== 'string') return fail(400, { reason: 'no-diff' })
    const page = await getPageEntry(pageName)

    await uploadPageEntry({
      ...page,
      previewURL: value,
      lastModified: new Date().toISOString()
    })
  },
  update: async ({
    request,
    params
  }) => {
    const { pageName } = params
    const data = await request.formData()
    await updatePage(pageName, data, false)
  },
  updateAndGenerateTree: async ({
    request,
    params
  }) => {
    const { pageName } = params
    const data = await request.formData()
    await updatePage(pageName, data, true)
  },
  addChildNode: async ({ request, params }) => {
    const { pageName, nodeUid } = params
    const data = await request.formData()
    const schema = data.get('schema')
    const attributeUID = data.get('attributeUID')
    if (!schema || typeof schema !== 'string') return fail(400, { reason: 'no-schema' })
    if (!attributeUID || typeof attributeUID !== 'string') return fail(400, { reason: 'no-target-attribute' })
    const schemaObject = JSON.parse(schema) // TODO: validate schema
    let page = await getPageEntry(pageName)
    const currentNode = page.contents.nodes[nodeUid]
    if (!currentNode) fail(400, { reason: 'non-existent-node' })
    const childNode = await componentSchemaToNode(schemaObject)
    page = addChildNodeToNodeInPage(page, currentNode, attributeUID, childNode)
    await uploadPageEntry(page)
  },
  setStorageResourceValue: async ({ request, params }) => {
    const { pageName, nodeUid } = params
    const data = await request.formData()
    const valueText = data.get('value')
    if (!valueText || typeof valueText !== 'string') return fail(400, { reason: 'no-value' })
    const value = JSON.parse(valueText)
    const page = await getPageEntry(pageName)
    const node = page.contents.nodes[nodeUid]
    const attribute = node.data[value.attributeUID]
    attribute.value = JSON.parse(value.selection[0])
    await uploadPageEntry(page)
    return redirect(307, `/components/pages/${pageName}/${nodeUid}`)
  }
}
