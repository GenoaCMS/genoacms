import type { Actions } from './$types'
import { error, type Load } from '@sveltejs/kit'

import { superValidate } from 'sveltekit-superforms'
import { schemasafe } from 'sveltekit-superforms/adapters'
import { formats } from '$lib/script/database/validators'
import { getComponent, getComponentDefiniton, updateComponentDefinition } from '$lib/script/components/editor'

import { componentCodeChangeSchema } from '$lib/script/components/editor/schemas'

const changeValidator = schemasafe(componentCodeChangeSchema, { config: { formats } })

export const load: Load = async ({ params }) => {
  const componentId = params.componentId
  if (!componentId || typeof componentId !== 'string') return error(404)
  const component = await getComponent(componentId)
  const componentDefinition = await getComponentDefiniton(component.uid)
  const changeForm = await superValidate({ uid: component.uid, uncommitedCode: componentDefinition.uncommitedCode }, changeValidator)

  return {
    component,
    componentDefinition,
    changeForm
  }
}

export const actions = {
  change: async function ({ request }) {
    const form = await superValidate(request, changeValidator)
    if (!form.valid) return error(400)
    await updateComponentDefinition(form.data.uid, (d) => {
      d.uncommitedCode = form.data.uncommitedCode
      return d
    })
  }
} satisfies Actions
