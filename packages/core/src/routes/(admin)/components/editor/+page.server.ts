import type { Actions } from './$types'

import { message, superValidate } from 'sveltekit-superforms'
import { schemasafe } from 'sveltekit-superforms/adapters'
import { formats } from '$lib/script/database/validators'
import { createComponent, listOrCreateComponentList } from '$lib/script/components/editor'
import { componentCreationSchema } from '$lib/script/components/editor/schemas'

const validator = schemasafe(componentCreationSchema, { config: { formats } })

export async function load () {
  const components = await listOrCreateComponentList()
  const createForm = await superValidate({}, validator)
  return {
    components,
    createForm
  }
}

export const actions = {
  create: async function ({ request }) {
    const form = await superValidate(request, validator)

    if (!form.valid) return message(form, { status: 'fail', text: 'Failed to create a component' })
    await createComponent(form.data.name)
    return message(form, { status: 'success', text: 'Component created' })
  }
} satisfies Actions
