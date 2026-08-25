import type { PageServerLoad } from '../$types'
import {
  deleteUserComponentEntry,
  getUserComponentEntry,
  getUserComponentEntryDepth,
  undoUserComponentEntry,
  redoUserComponentEntry
} from '$lib/script/components/componentEntry/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { fail, type Actions, type RequestEvent, redirect, error } from '@sveltejs/kit'
import { isString } from '$lib/script/utils'

export const load: PageServerLoad = async ({ params, locals }) => {
  const { componentId } = params
  const ctx = requireAuthContext(locals)
  const componentEntry = await getUserComponentEntry(ctx, componentId)
  if (!componentEntry) error(404, 'No component entry')

  // How deep the history runs is what enables or disables the buttons. Without it they render
  // permanently disabled, which is how undo appeared to exist without working.
  const depth = await getUserComponentEntryDepth(ctx, componentId)

  return {
    id: componentId,
    componentEntry,
    ...depth
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
 * works either way. That is the point of the form being a form.
 */
const stepThroughHistory = (
  move: typeof undoUserComponentEntry
) => async ({ params, locals }: RequestEvent) => {
  const ctx = requireAuthContext(locals)
  const { componentId } = params
  if (!isString(componentId)) return fail(400, { reason: 'no-component-entry-name' })
  await move(ctx, componentId)
  return { success: true }
}

export const actions = {
  undo: stepThroughHistory(undoUserComponentEntry),
  redo: stepThroughHistory(redoUserComponentEntry),
  delete: async ({ params, locals }) => {
    const ctx = requireAuthContext(locals)
    const { componentId } = params
    if (!isString(componentId)) return fail(400, { reason: 'no-component-entry-name' })
    await deleteUserComponentEntry(ctx, componentId)
    return redirect(307, '.')
  }
} satisfies Actions
