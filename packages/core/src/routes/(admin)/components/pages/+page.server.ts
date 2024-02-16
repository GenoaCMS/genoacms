import {
  listOrCreatePreBuiltComponentList
} from '$lib/script/components/componentSchema/component.server'
import {
  listOrCreatePageList,
  createPage,
  uploadPage, serializePage
} from '$lib/script/components/page/page.server'
import { fail, redirect } from '@sveltejs/kit'

export const load = async () => {
  const pages = await listOrCreatePageList()
  const components = await listOrCreatePreBuiltComponentList()
  return {
    pages,
    components
  }
}

export const actions = {
  createPage: async ({ request }) => {
    const data = await request.formData()
    const name = data.get('name')
    const componentName = data.get('componentName')
    if (!name || typeof name !== 'string' ||
      !componentName || typeof componentName !== 'string') return fail(400, { reason: 'no-page-name' })
    const page = await createPage({
      name,
      componentName
    })
    const serializedPage = serializePage(page)
    // TODO: validate page
    await uploadPage(serializedPage)
    return redirect(307, `pages/${name}`)
  }
}
