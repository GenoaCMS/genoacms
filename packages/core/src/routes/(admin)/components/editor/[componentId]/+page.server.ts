import { error } from '@sveltejs/kit'
import { getUserComponent, getUserComponentDefinition } from '$lib/script/components/editor/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

export const load = async ({ params, locals }) => {
  const ctx = requireAuthContext(locals)
  const componentId = params.componentId
  if (typeof componentId !== 'string' || componentId.length === 0) return error(404)

  // Reading the definition is what needs `components:code`; the component record itself is catalog
  // information, so the two are fetched through their own checks rather than one broad read.
  const component = await getUserComponent(ctx, componentId)
  const componentDefinition = await getUserComponentDefinition(ctx, component.uid)

  return {
    component,
    componentDefinition
  }
}
