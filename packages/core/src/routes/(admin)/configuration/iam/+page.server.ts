import {
  listUserRolesAndAccounts,
  createUserRole,
  updateUserRole,
  deleteUserRole,
  assignUserAccountRoles,
  upsertUserAccount,
  removeUserAccount
} from '$lib/script/configuration/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { isString } from '$lib/script/utils'
import { error, fail, type Actions } from '@sveltejs/kit'
import type { AdministrationResult } from '$lib/script/authorization/administration'
import type { Grant } from '$lib/script/authorization/grants'

export const load = async ({ locals }) => {
  const result = await listUserRolesAndAccounts(requireAuthContext(locals))

  // A read that failed is not an empty instance. Rendering empty lists would suggest the roles are
  // gone, when the manifests may simply be unreadable.
  if (!result.ok) error(503, result.reason)

  return result.value
}

/**
 * Turns a refusal into something the page can show.
 *
 * A refusal here is an ordinary outcome — the role is declared, the instance is locked, someone
 * else wrote first — not a server fault, so it comes back as a form failure carrying the reason
 * rather than as a 500 that says nothing.
 */
const report = (result: AdministrationResult<void>) =>
  result.ok ? { success: true } : fail(409, { reason: result.reason })

/** Grants arrive as JSON from the editor; a malformed body is rejected before the service sees it. */
function parseGrants (raw: FormDataEntryValue | null): Grant[] | undefined {
  if (!isString(raw)) return undefined
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as Grant[] : undefined
  } catch {
    return undefined
  }
}

function parseRoleNames (raw: FormDataEntryValue | null): string[] | undefined {
  if (!isString(raw)) return undefined
  return raw.split(',').map(name => name.trim()).filter(name => name.length > 0)
}

export const actions = {
  createRole: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const data = await request.formData()
    const name = data.get('name')
    const grants = parseGrants(data.get('grants'))

    if (!isString(name) || name.length === 0) return fail(400, { reason: 'role/name-required' })
    if (grants === undefined) return fail(400, { reason: 'role/grants-malformed' })

    return report(await createUserRole(ctx, { name, grants }))
  },

  updateRole: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const data = await request.formData()
    const name = data.get('name')
    const grants = parseGrants(data.get('grants'))

    if (!isString(name) || name.length === 0) return fail(400, { reason: 'role/name-required' })
    if (grants === undefined) return fail(400, { reason: 'role/grants-malformed' })

    // The whole grant set is replaced, not merged: a grant removed from the editor must actually
    // go, and a merge would make removal impossible through this form.
    return report(await updateUserRole(ctx, { name, grants }))
  },

  deleteRole: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const name = (await request.formData()).get('name')
    if (!isString(name)) return fail(400, { reason: 'role/name-required' })

    return report(await deleteUserRole(ctx, name))
  },

  createAccount: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const data = await request.formData()
    const subject = data.get('subject')
    const email = data.get('email')
    const roles = parseRoleNames(data.get('roles')) ?? []

    if (!isString(subject) || subject.length === 0) return fail(400, { reason: 'user/subject-required' })

    return report(await upsertUserAccount(ctx, {
      subject,
      email: isString(email) ? email : '',
      roles
    }))
  },

  assignRoles: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const data = await request.formData()
    const subject = data.get('subject')
    const roles = parseRoleNames(data.get('roles'))

    if (!isString(subject)) return fail(400, { reason: 'user/subject-required' })
    if (roles === undefined) return fail(400, { reason: 'user/roles-malformed' })

    return report(await assignUserAccountRoles(ctx, subject, roles))
  },

  removeAccount: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const subject = (await request.formData()).get('subject')
    if (!isString(subject)) return fail(400, { reason: 'user/subject-required' })

    return report(await removeUserAccount(ctx, subject))
  }
} satisfies Actions
