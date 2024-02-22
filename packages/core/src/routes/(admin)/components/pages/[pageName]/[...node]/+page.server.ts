import { error, fail } from '@sveltejs/kit'
import { getPage, serializePartialPage, uploadPage } from '$lib/script/components/page/page.server'
import { componentSchemaToNode, getComponentNodeByUidPath } from '$lib/script/components/page/tree'

export const load = async ({ params, parent }) => {
  const { page } = await parent()
  const nodePath = params.node.split('/')
  let node
  try {
    node = getComponentNodeByUidPath(page.contents, nodePath)
  } catch (e) {
    return error(404, { message: `No node at path "${params.node}"` })
  }
  return {
    node
  }
}

export const actions = {
  updatePage: async ({
    request,
    params
  }) => {
    const { pageName } = params
    const data = await request.formData()
    const diffText = data.get('diff')
    if (!diffText || typeof diffText !== 'string') return fail(400, { reason: 'no-diff' })
    const diff = serializePartialPage(JSON.parse(diffText))
    const page = await getPage(pageName)

    await uploadPage({
      ...page,
      ...diff,
      lastModified: new Date().toISOString()
    })
  },
  componentSchemaToNode: async ({ request }) => {
    const data = await request.formData()
    const schema = data.get('schema')
    if (!schema || typeof schema !== 'string') return fail(400, { reason: 'no-schema' })
    const schemaObject = JSON.parse(schema)
    // TODO: validate schema
    const node = await componentSchemaToNode(schemaObject)
    return {
      node
    }
  }
}
