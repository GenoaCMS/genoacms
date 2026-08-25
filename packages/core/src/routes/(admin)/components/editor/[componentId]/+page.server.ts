import { error } from '@sveltejs/kit'
import { getUserComponent, getUserComponentDefinition } from '$lib/script/components/editor/user.server'
import { NoSuchComponentError } from '$lib/script/components/editor/errors'
import { requireAuthContext } from '$lib/script/authorization/request.server'

/**
 * Opens a component for editing, or says plainly that there is nothing to open.
 *
 * **A component that does not exist is a 404, not a 500.** It used to be the latter: the service
 * threw a bare `Error` and this passed it through, so a deleted component, a stale bookmark or a
 * mistyped uid all rendered the CMS reporting its own fault. Deleting a dynamic component from the
 * registrar is what makes that ordinary, since it leaves the editor URL behind.
 *
 * The permission failure is deliberately *not* caught here: an unauthorized read is not a missing
 * component, and answering 404 for it would be a different lie.
 */
export const load = async ({ params, locals }) => {
  const ctx = requireAuthContext(locals)
  const componentId = params.componentId
  if (typeof componentId !== 'string' || componentId.length === 0) return error(404)

  // Reading the definition is what needs `components:code`; the component record itself is catalog
  // information, so the two are fetched through their own checks rather than one broad read.
  try {
    const component = await getUserComponent(ctx, componentId)
    const componentDefinition = await getUserComponentDefinition(ctx, component.uid)

    return {
      component,
      componentDefinition
    }
  } catch (cause) {
    if (cause instanceof NoSuchComponentError) error(404, cause.message)
    throw cause
  }
}
