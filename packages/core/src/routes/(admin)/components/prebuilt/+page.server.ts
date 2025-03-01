import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'
import {
  createComponentEntry,
  deletePrebuiltComponentEntry,
  listOrCreatePreBuiltComponentList,
  uploadPrebuiltComponentEntry
} from '$lib/script/components/componentEntry/component.server'
import { fail, type Actions, redirect } from '@sveltejs/kit'
import { isString } from '$lib/script/utils'
import { validateComponentEntryAttributes } from '$lib/script/components/componentEntry/component/validators'
import { superValidate, message } from 'sveltekit-superforms'
import { schemasafe } from 'sveltekit-superforms/adapters'
import { componentEntryCreationSchema } from '$lib/script/components/componentEntry/component/schemas'

const componentEntryCreationValidator = schemasafe(componentEntryCreationSchema)

export const load = async () => {
  const componentEntries = await listOrCreatePreBuiltComponentList()
  const creationForm = superValidate(componentEntryCreationValidator)
  return {
    componentEntries,
    creationForm
  }
}

export const actions = {
  create: async ({ request }) => {
    const form = await superValidate(request, componentEntryCreationValidator)
    if (!form.valid) return message(form, { status: 'fail', text: 'Failed to register a component' })
    const componentEntry = await createComponentEntry(form.data)
    return redirect(307, `prebuilt/${componentEntry.uid}`)
  },
  uploadComponentEntry: async ({ request }) => {
    const data = await request.formData()
    const componentEntryText = data.get('componentEntry')
    if (!isString(componentEntryText)) return fail(400, { reason: 'no-component-entry' })
    const componentEntry = JSON.parse(componentEntryText) as ComponentEntry
    if (!validateComponentEntryAttributes(componentEntry.attributes)) return fail(400, { reason: 'invalid-component-entry' })
    await uploadPrebuiltComponentEntry(componentEntry)
  },
  deleteComponentEntry: async ({ request }) => {
    const data = await request.formData()
    const entryUID = data.get('UID')
    if (!isString(entryUID)) return fail(400, { reason: 'no-component-entry-name' })
    await deletePrebuiltComponentEntry(entryUID)
  }
} satisfies Actions
