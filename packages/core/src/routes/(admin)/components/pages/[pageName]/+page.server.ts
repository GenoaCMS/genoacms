import { getPage, uploadPage } from '$lib/script/components/components.server'
import { fail } from '@sveltejs/kit'

export const load = async ({ params }) => {
  const { pageName } = params
  const page = await getPage(pageName)
  return {
    page
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
    const diff = JSON.parse(diffText)
    const page = await getPage(pageName)

    await uploadPage({
      ...page,
      ...diff,
      lastModified: new Date().toISOString()
    })
  }
}
