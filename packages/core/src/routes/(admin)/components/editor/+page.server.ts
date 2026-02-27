import type { Actions } from './$types'
import { validator } from '@exodus/schemasafe'
import { formats } from '$lib/script/database/validators'
import { createComponent, listOrCreateComponentList } from '$lib/script/components/editor'
import { componentCreationSchema } from '$lib/script/components/editor/schemas'
import { fail, redirect } from '@sveltejs/kit'

const validate = validator(componentCreationSchema as any, { formats })

export async function load() {
  const components = await listOrCreateComponentList()
  return {
    components
  }
}

export const actions = {
  create: async function ({ request }) {
    const formData = await request.formData()
    const data = Object.fromEntries(formData)

    const isValid = validate(data)

    if (!isValid) {
      return fail(400, { status: 'fail', text: 'Failed to create a component' })
    }

    const componentId = await createComponent(data.name as string)
    return redirect(307, `editor/${componentId}`)
  }
} satisfies Actions
