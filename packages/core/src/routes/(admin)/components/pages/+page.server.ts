import type { PageServerLoad } from './$types'
import {
  saveUserPageStructure, listUserPages, deleteUserPage
} from '$lib/script/components/page/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { fail, redirect, type Actions } from '@sveltejs/kit'
import { createPageEntry } from '$lib/script/components/page/entry'
import { isString } from '$lib/script/utils'
import { parseBulkDeletion } from '$lib/script/selection/request.server'

export const load: PageServerLoad = async ({ locals }) => {
  // Awaited rather than streamed: the list drives a selection in the top panel, which cannot be
  // built from a promise that has not resolved, and the list is a directory listing rather than
  // anything worth streaming.
  const pages = await listUserPages(requireAuthContext(locals))

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
  },

  /**
   * Removes every selected page.
   *
   * Sequential and stopping at the first failure, for the same reason as the component list: a
   * partial result the person can see beats one error standing for an unknown number of deletions.
   */
  deleteSelected: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const parsed = parseBulkDeletion(await request.formData())
    if (!parsed.ok) return fail(400, { reason: parsed.reason })

    for (const [index, name] of parsed.ids.entries()) {
      try {
        await deleteUserPage(ctx, name)
      } catch (error) {
        return fail(409, {
          reason: `selection/partial: removed ${index} of ${parsed.ids.length}; ${(error as Error).message}`
        })
      }
    }

    return { success: true }
  }
} satisfies Actions
