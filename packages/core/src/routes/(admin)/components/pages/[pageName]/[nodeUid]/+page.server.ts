import { error, fail } from '@sveltejs/kit'
import { getPage, uploadPage } from '$lib/script/components/page/page.server'
import { addNodeToPage, componentSchemaToNode, updateComponentNode } from '$lib/script/components/page/entry'

export const load = async ({ params, parent }) => {
  const { page } = await parent()
  const { nodeUid } = params
  const node = page.contents.nodes[nodeUid]
  if (!node) return error(404, { message: `No node with id "${nodeUid}"` })

  return {
    node
  }
}

export const actions = {
  changePreviewURL: async ({
    request,
    params
  }) => {
    const { pageName } = params
    const data = await request.formData()
    const value = data.get('value')
    if (!value || typeof value !== 'string') return fail(400, { reason: 'no-diff' })
    const page = await getPage(pageName)

    await uploadPage({
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
    const componentNodeText = data.get('componentNode')
    if (!componentNodeText || typeof componentNodeText !== 'string') return fail(400, { reason: 'no-diff' })
    const componentNode = JSON.parse(componentNodeText)

    let page = await getPage(pageName)
    page = updateComponentNode(page, componentNode)
    await uploadPage(page)
  },
  addChildNode: async ({ request, params }) => {
    const { pageName, nodeUid } = params
    const data = await request.formData()
    const schema = data.get('schema')
    const attributeUID = data.get('attributeUID')
    if (!schema || typeof schema !== 'string') return fail(400, { reason: 'no-schema' })
    if (!attributeUID || typeof attributeUID !== 'string') return fail(400, { reason: 'no-target-attribute' })
    const schemaObject = JSON.parse(schema) // TODO: validate schema
    let page = await getPage(pageName)
    const currentNode = page.contents.nodes[nodeUid]
    if (!currentNode) fail(400, { reason: 'non-existent-node' })
    const childNode = await componentSchemaToNode(schemaObject)
    page = addNodeToPage(page, childNode)
    currentNode.data[attributeUID].value.push(childNode.uid)
    page = updateComponentNode(page, currentNode)
    await uploadPage(page)
  }
}
