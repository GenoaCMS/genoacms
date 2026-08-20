import type { PageServerLoad } from '../$types'
import {
  deleteUserComponentEntry,
  getUserComponentEntry
} from '$lib/script/components/componentEntry/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { fail, type Actions, redirect, error } from '@sveltejs/kit'
import { isString } from '$lib/script/utils'

export const load: PageServerLoad = async ({ params, locals }) => {
  const { componentId } = params
  const componentEntry = await getUserComponentEntry(requireAuthContext(locals), componentId)
  if (!componentEntry) error(404, 'No component entry')

  return {
    id: componentId,
    componentEntry
  }
}

export const actions = {
  undo: async () => {
  },
  redo: async () => {
  },
  delete: async ({ params, locals }) => {
    const ctx = requireAuthContext(locals)
    const { componentId } = params
    if (!isString(componentId)) return fail(400, { reason: 'no-component-entry-name' })
    await deleteUserComponentEntry(ctx, componentId)
    return redirect(307, '.')
  }
} satisfies Actions
