import {
  listUserComponentEntries,
  deleteUserComponentHeader
} from '$lib/script/components/componentHeader/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { parseBulkDeletion } from '$lib/script/selection/request.server'
import { fail, type Actions } from '@sveltejs/kit'

export const load = async ({ locals }) => {
  const componentEntries = await listUserComponentEntries(requireAuthContext(locals))
  return {
    componentEntries
  }
}

export const actions = {
  /**
   * Removes every selected component.
   *
   * Each one goes through the same gated service a single deletion uses, so selecting several
   * changes how many times the check runs and nothing about whether it runs.
   *
   * **Sequential, and it stops at the first failure.** Deleting in parallel would report one error
   * for an unknown number of completed removals; stopping leaves a partial result the person can
   * see on the refreshed list and act on, with the reason naming what was reached.
   */
  deleteSelected: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const parsed = parseBulkDeletion(await request.formData())
    if (!parsed.ok) return fail(400, { reason: parsed.reason })

    for (const [index, uid] of parsed.ids.entries()) {
      try {
        await deleteUserComponentHeader(ctx, uid)
      } catch (error) {
        return fail(409, {
          reason: `selection/partial: removed ${index} of ${parsed.ids.length}; ${(error as Error).message}`
        })
      }
    }

    return { success: true }
  }
} satisfies Actions
