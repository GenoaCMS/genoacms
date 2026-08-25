import type { Actions } from './$types'
import {
  deleteUserComponent,
  getUserComponent,
  listUserComponents
} from '$lib/script/components/editor/user.server'
import { parseBulkDeletion } from '$lib/script/selection/request.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { fail } from '@sveltejs/kit'

export async function load ({ locals }) {
  const components = await listUserComponents(requireAuthContext(locals))
  return {
    components
  }
}

export const actions = {
  /**
   * Removes every selected component, and everything each of them published.
   *
   * Each one goes through the same gated service a single deletion uses, so selecting several
   * changes how many times the check runs and nothing about whether it runs.
   *
   * **Sequential, and it stops at the first failure.** Deleting in parallel would report one error
   * for an unknown number of completed removals; stopping leaves a partial result the person can see
   * on the refreshed list and act on, with the reason naming how far it got.
   *
   * The component is read before it is removed because deletion needs its name as well as its uid —
   * and reading it through the gated service is also what refuses a uid the principal may not touch.
   */
  deleteSelected: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const parsed = parseBulkDeletion(await request.formData())
    if (!parsed.ok) return fail(400, { reason: parsed.reason })

    for (const [index, uid] of parsed.ids.entries()) {
      try {
        await deleteUserComponent(ctx, await getUserComponent(ctx, uid))
      } catch (error) {
        return fail(409, {
          reason: `selection/partial: removed ${index} of ${parsed.ids.length}; ${(error as Error).message}`
        })
      }
    }

    return { success: true }
  }
} satisfies Actions
