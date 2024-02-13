import { listOrCreatePageList, uploadPage } from '$lib/script/components/components.server'
import { fail, redirect } from '@sveltejs/kit'
import { createPage } from '$lib/script/components/pages.server'

export const load = async () => {
  const pages = await listOrCreatePageList()
  return {
    pages
  }
}

export const actions = {
  createPage: async ({ request }) => {
    const data = await request.formData()
    const pageName = data.get('name')
    if (!pageName || typeof pageName !== 'string') return fail(400, { reason: 'no-page-name' })
    const page = createPage(pageName)
    await uploadPage(page)
    return redirect(307, `pages/${pageName}`)
  }
}
