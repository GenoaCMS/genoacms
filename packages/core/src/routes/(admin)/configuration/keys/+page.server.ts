import {
  listUserSigningKeys,
  rotateUserSubordinateKey,
  revokeUserSubordinateKey
} from '$lib/script/signing/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { isString } from '$lib/script/utils'
import { error, fail, type Actions } from '@sveltejs/kit'
import type { KeyOperationResult } from '$lib/script/signing/user.server'

export const load = async ({ locals }) => {
  const ctx = requireAuthContext(locals)
  const result = await listUserSigningKeys(ctx)

  // A registry that cannot be read is not an instance without keys. Rendering an empty list would
  // suggest nothing is signing, when the document may simply be unreadable — and the difference is
  // the whole reason someone opened this screen.
  if (!result.ok) error(503, result.reason)

  return result.value
}

/**
 * Turns a refusal into something the page can show.
 *
 * The same treatment the roles screen gives its refusals: a key that is already revoked, or a
 * registry someone else rotated first, is an ordinary answer carrying a reason — not a server fault
 * that says nothing.
 */
const report = (result: KeyOperationResult<unknown>) =>
  result.ok ? { success: true } : fail(409, { reason: result.reason })

export const actions = {
  rotate: async ({ locals }) => {
    return report(await rotateUserSubordinateKey(requireAuthContext(locals)))
  },

  revoke: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const keyId = (await request.formData()).get('keyId')
    if (!isString(keyId) || keyId.length === 0) return fail(400, { reason: 'key/id-required' })

    return report(await revokeUserSubordinateKey(ctx, keyId))
  }
} satisfies Actions
