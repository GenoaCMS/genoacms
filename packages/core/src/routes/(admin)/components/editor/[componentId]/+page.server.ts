import { error, fail, type Actions, type RequestEvent } from '@sveltejs/kit'
import {
  getUserComponent,
  getUserComponentDefinition,
  getUserComponentSignature,
  getUserComponentDefinitionDepth,
  undoUserComponentBody,
  redoUserComponentBody
} from '$lib/script/components/editor/user.server'
import { NoSuchComponentError } from '$lib/script/components/editor/errors'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { isString } from '$lib/script/utils'

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
    // What the body is wrapped in. Shown above the editor, because an author writing a body needs
    // to see the parameters it receives — and how each attribute's name became an identifier.
    const signature = await getUserComponentSignature(ctx, component.uid)
    // How deep the history runs is what enables or disables the two controls. Without it they render
    // permanently disabled, which is how the registrar's undo appeared to exist without working.
    const depth = await getUserComponentDefinitionDepth(ctx, component.uid)

    return {
      component,
      componentDefinition,
      signature,
      ...depth
    }
  } catch (cause) {
    if (cause instanceof NoSuchComponentError) error(404, cause.message)
    throw cause
  }
}

/**
 * Moving through the history.
 *
 * Returns plainly rather than redirecting. The buttons are progressively enhanced, so `use:enhance`
 * applies the result and calls `invalidateAll()` — `load` re-runs and the editor is rebuilt from
 * storage, which is the state the move just produced, without leaving the page. Redirecting would
 * navigate for no reason: the destination is the page the author is already on.
 *
 * Without JavaScript the same POST still runs and the browser renders the response, so the feature
 * works either way. That is the point of the form being a form. It is also the same arrangement the
 * registrar uses one directory over, so the two histories behave identically.
 */
const stepThroughHistory = (
  move: typeof undoUserComponentBody
) => async ({ params, locals }: RequestEvent) => {
  const ctx = requireAuthContext(locals)
  const { componentId } = params
  if (!isString(componentId)) return fail(400, { reason: 'no-component-id' })
  await move(ctx, componentId)
  return { success: true }
}

export const actions = {
  undo: stepThroughHistory(undoUserComponentBody),
  redo: stepThroughHistory(redoUserComponentBody)
} satisfies Actions
