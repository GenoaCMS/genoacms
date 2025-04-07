import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'
import type { PageServerLoad } from '../$types'
import {
  deleteComponentEntry,
  getComponentEntry,
  uploadComponentEntry
} from '$lib/script/components/componentEntry/io.server'
import { fail, type Actions, redirect } from '@sveltejs/kit'
import { isString } from '$lib/script/utils'
import { superValidate, message } from 'sveltekit-superforms'
import { schemasafe } from 'sveltekit-superforms/adapters'
import { componentEntrySchema } from '$lib/script/components/componentEntry/component/schemas'

const componentEntryValidator = schemasafe(componentEntrySchema, { config: { includeErrors: true } })

export const load: PageServerLoad = async ({ params }) => {
  const { componentId } = params
  const componentEntry = await getComponentEntry(componentId)
  const updateForm = await superValidate(componentEntry, componentEntryValidator)

  return {
    id: componentId,
    updateForm
  }
}

export const actions = {
  update: async ({ request }) => {
    const form = await superValidate(request, componentEntryValidator)
    console.log(form)
    if (!form.valid) return message(form, { status: 'fail', text: 'Failed to update a component' })
    // TODO: get previous stade, create diff
    await uploadComponentEntry(form.data as ComponentEntry)
    return message(form, { status: 'success', text: 'Component updated' })
  },
  undo: async ({ request }) => {
  },
  redo: async ({ request }) => {
  },
  delete: async ({ request, params }) => {
    const { componentId } = params
    const data = await request.formData()
    if (!isString(componentId)) return fail(400, { reason: 'no-component-entry-name' })
    await deleteComponentEntry(componentId)
    return redirect(307, '.')
  }
} satisfies Actions
