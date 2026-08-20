import type { PageServerLoad } from './$types'
import {
  saveUserPageStructure, listUserPages
} from '$lib/script/components/page/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { fail, redirect, type Actions } from '@sveltejs/kit'
import { createPageEntry } from '$lib/script/components/page/entry'
import { isString } from '$lib/script/utils'

export const load: PageServerLoad = async ({ locals }) => {
  const pages = listUserPages(requireAuthContext(locals))

  return {
    pages
  }
}

export const actions = {
  createPage: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const data = await request.formData()
    const name = data.get('name')
    const componentUID = data.get('componentUID')
    if (!isString(name) || !isString(componentUID)) return fail(400, { reason: 'no-page-name' })
    const page = await createPageEntry({
      name,
      componentUID
    })
    await saveUserPageStructure(ctx, page)
    return redirect(307, `pages/${name}`)
  }
} satisfies Actions
