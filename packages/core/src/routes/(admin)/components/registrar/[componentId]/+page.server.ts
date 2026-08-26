import type { PageServerLoad } from '../$types'
import {
  getUserComponentHeader,
  getUserComponentHeaderDepth,
  undoUserComponentHeader,
  redoUserComponentHeader
} from '$lib/script/components/componentHeader/user.server'
import { deleteUserComponentByReference } from '$lib/script/components/registration.server'
import { getUserPublishedComponent } from '$lib/script/components/publication/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { fail, type Actions, type RequestEvent, redirect, error } from '@sveltejs/kit'
import { isString } from '$lib/script/utils'

export const load: PageServerLoad = async ({ params, locals }) => {
  const { componentId } = params
  const ctx = requireAuthContext(locals)
  const componentHeader = await getUserComponentHeader(ctx, componentId)
  if (!componentHeader) error(404, 'No such component')

  // How deep the history runs is what enables or disables the buttons. Without it they render
  // permanently disabled, which is how undo appeared to exist without working.
  //
  // The publication record is what the status badge reads, and it is `null` for a component nobody
  // has released. Read for both kinds: a prebuilt component publishes a signed header, so "never
  // published" is as meaningful for it as for one with code.
  const [depth, published] = await Promise.all([
    getUserComponentHeaderDepth(ctx, componentId),
    getUserPublishedComponent(ctx, componentId)
  ])

  return {
    id: componentId,
    componentHeader,
    publishedAt: published?.publishedAt,
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
  move: typeof undoUserComponentHeader
) => async ({ params, locals }: RequestEvent) => {
  const ctx = requireAuthContext(locals)
  const { componentId } = params
  if (!isString(componentId)) return fail(400, { reason: 'no-component-entry-name' })
  await move(ctx, componentId)
  return { success: true }
}

export const actions = {
  undo: stepThroughHistory(undoUserComponentHeader),
  redo: stepThroughHistory(redoUserComponentHeader),
  delete: async ({ params, locals }) => {
    const ctx = requireAuthContext(locals)
    const { componentId } = params
    if (!isString(componentId)) return fail(400, { reason: 'no-component-entry-name' })
    // Routed by the component's stored kind: deleting a dynamic component means its source and
    // every executable it published, not only the description shown on this page.
    await deleteUserComponentByReference(ctx, componentId)
    return redirect(307, '.')
  }
} satisfies Actions
