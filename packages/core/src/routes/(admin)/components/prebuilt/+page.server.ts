import {
  listOrCreateComponentEntryList
} from '$lib/script/components/componentEntry/io.server'
import {
  createComponentEntry
} from '$lib/script/components/componentEntry/component.server'
import { type Actions, redirect } from '@sveltejs/kit'
import { superValidate, message } from 'sveltekit-superforms'
import { schemasafe } from 'sveltekit-superforms/adapters'
import { componentEntryCreationSchema } from '$lib/script/components/componentEntry/component/schemas'

const componentEntryCreationValidator = schemasafe(componentEntryCreationSchema)

export const load = async () => {
  const componentEntries = await listOrCreateComponentEntryList()
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
  }
} satisfies Actions
