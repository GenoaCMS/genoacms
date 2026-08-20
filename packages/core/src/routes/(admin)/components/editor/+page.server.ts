import type { Actions } from './$types'
import { validator } from '@exodus/schemasafe'
import { formats } from '$lib/script/database/validators'
import { createUserComponent, listUserComponents } from '$lib/script/components/editor/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { componentCreationSchema } from '$lib/script/components/editor/schemas'
import { fail, redirect } from '@sveltejs/kit'

const validate = validator(componentCreationSchema as any, { formats })

export async function load ({ locals }) {
  const components = await listUserComponents(requireAuthContext(locals))
  return {
    components
  }
}

export const actions = {
  create: async function ({ request, locals }) {
    const ctx = requireAuthContext(locals)
    const formData = await request.formData()
    const data = Object.fromEntries(formData)

    const isValid = validate(data)

    if (!isValid) {
      return fail(400, { status: 'fail', text: 'Failed to create a component' })
    }

    const componentId = await createUserComponent(ctx, data.name as string)
    return redirect(307, `editor/${componentId}`)
  }
} satisfies Actions
