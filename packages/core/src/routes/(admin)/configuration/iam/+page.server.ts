import {
  listUserRolesAndAccounts,
  listGrantableResources,
  createUserRole,
  updateUserRole,
  deleteUserRole,
  assignUserAccountRoles,
  upsertUserAccount,
  removeUserAccount
} from '$lib/script/configuration/user.server'
import { createAgent, listAgents, reissueAgentToken, revokeAgent, updateAgent } from '$lib/script/agents/administration.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { isString } from '$lib/script/utils'
import { PermissionDeniedError, hasPermission } from '$lib/script/authorization/enforce'
import { error, fail, type Actions } from '@sveltejs/kit'
import type { AdministrationResult } from '$lib/script/authorization/administration'
import type { Grant } from '$lib/script/authorization/grants'

export const load = async ({ locals }) => {
  const ctx = requireAuthContext(locals)
  const result = await listUserRolesAndAccounts(ctx)

  // A read that failed is not an empty instance. Rendering empty lists would suggest the roles are
  // gone, when the manifests may simply be unreadable.
  if (!result.ok) error(503, result.reason)

  // Both are governed by `config:roles:manage`, which the read above has already demanded, so this
  // cannot deny a caller who reached this line. The check stays on the service function regardless —
  // the route is not where the rule lives.
  return { ...result.value, resources: await listGrantableResources(ctx), agents: hasPermission(ctx, 'config:users:manage') ? await listAgents(ctx) : [] }
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

/**
 * The selected role names.
 *
 * Read as repeated fields rather than one delimited string: a delimiter would have to be escaped,
 * and a role name containing it would be torn in two with nothing reporting that it happened.
 */
function selectedRoleNames (data: FormData): string[] {
  return data.getAll('roles').filter(isString).filter(name => name.length > 0)
}

/** AGT-3: a refusal of an agent action is an answer, not a fault. */
async function answer<T> (run: () => Promise<T>, success: (value: T) => object) {
  try {
    return success(await run())
  } catch (cause) {
    if (cause instanceof PermissionDeniedError) throw cause
    return fail(409, { reason: cause instanceof Error ? cause.message : String(cause) })
  }
}

export const actions = {
  createAgent: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const data = await request.formData()
    const name = data.get('name')
    const label = data.get('label')
    if (!isString(name) || !isString(label)) return fail(400, { reason: 'agents/name-required' })

    return await answer(() => createAgent(ctx, { name, label, roles: selectedRoleNames(data) }), issued => ({ issued }))
  },

  reissueAgentToken: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const subject = (await request.formData()).get('subject')
    if (!isString(subject)) return fail(400, { reason: 'user/subject-required' })

    return await answer(() => reissueAgentToken(ctx, subject), ({ token }) => ({ issued: { subject, token } }))
  },

  updateAgent: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const data = await request.formData()
    const subject = data.get('subject')
    if (!isString(subject)) return fail(400, { reason: 'user/subject-required' })
    const agent = (await listAgents(ctx)).find(candidate => candidate.subject === subject)

    return await answer(() => updateAgent(ctx, subject, { label: agent?.label ?? subject, roles: selectedRoleNames(data) }), () => ({ success: true }))
  },

  revokeAgent: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const subject = (await request.formData()).get('subject')
    if (!isString(subject)) return fail(400, { reason: 'user/subject-required' })

    return await answer(() => revokeAgent(ctx, subject), () => ({ success: true }))
  },

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
    const roles = selectedRoleNames(data)

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
    if (!isString(subject)) return fail(400, { reason: 'user/subject-required' })

    // An empty selection is a legitimate instruction: it strips every role from the account.
    return report(await assignUserAccountRoles(ctx, subject, selectedRoleNames(data)))
  },

  removeAccount: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const subject = (await request.formData()).get('subject')
    if (!isString(subject)) return fail(400, { reason: 'user/subject-required' })

    return report(await removeUserAccount(ctx, subject))
  }
} satisfies Actions
