import type { PageServerLoad } from '../$types'
import {
  deleteComponentEntry,
  getComponentEntry
} from '$lib/script/components/componentEntry/io.server'
import { fail, type Actions, redirect, error } from '@sveltejs/kit'
import { isString } from '$lib/script/utils'

export const load: PageServerLoad = async ({ params }) => {
  const { componentId } = params
  const componentEntry = await getComponentEntry(componentId)
  if (!componentEntry) error(404, 'No component entry')

  return {
    id: componentId,
    componentEntry
  }
}

export const actions = {
  undo: async ({ request }) => {
  },
  redo: async ({ request }) => {
  },
  delete: async ({ params }) => {
    const { componentId } = params
    if (!isString(componentId)) return fail(400, { reason: 'no-component-entry-name' })
    await deleteComponentEntry(componentId)
    return redirect(307, '.')
  }
} satisfies Actions
