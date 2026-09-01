import { fail, error, type Actions } from '@sveltejs/kit'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { readUserSecurityPolicy, updateUserSecurityPolicy } from '$lib/script/securityPolicy/user.server'
import { NUMERIC_FIELDS, MAX_FETCH_ORIGINS } from '$lib/script/securityPolicy/policy'

/**
 * The security policy, as a screen.
 *
 * The whole document, not the guard ceilings alone: it is parsed as a unit and the format has no
 * notion of a field left alone, so a screen editing three of seven would still be sending back the
 * other four.
 */

export const load = async ({ locals }) => {
  const result = await readUserSecurityPolicy(requireAuthContext(locals))

  // A policy that cannot be read is not an instance without one. Rendering blank fields would
  // suggest nothing is configured, when the document may simply be unreadable.
  if (!result.ok) error(503, result.reason)

  return { ...result.value, maxOrigins: MAX_FETCH_ORIGINS }
}

/**
 * Everything the form sent, as numbers.
 *
 * Read field by field from the known list rather than by iterating what arrived: a form is a thing
 * anyone can post, and building the candidate from its keys would let an unexpected one through to
 * a parser whose whole job is to refuse those.
 */
/**
 * The allowlist as the form sent it.
 *
 * Anything unreadable is handed on as it arrived, so the parser refuses it. Silently clearing an
 * allowlist because a field was malformed is the one outcome worth ruling out: it fails safe for the
 * bridge and unsafe for whoever believed they had just saved their origins.
 */
const originsFrom = (value: FormDataEntryValue | null): unknown => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const submitted = (form: FormData): Record<string, unknown> => ({
  ...Object.fromEntries(NUMERIC_FIELDS.map(field => [field, Number(form.get(field))])),
  fetchOrigins: originsFrom(form.get('fetchOrigins'))
})

const version = (form: FormData): string | undefined => {
  const value = form.get('version')
  return typeof value === 'string' && value !== '' ? value : undefined
}

export const actions = {
  save: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const form = await request.formData()

    const result = await updateUserSecurityPolicy(ctx, submitted(form), version(form))

    // A refused value and a document someone else moved are both ordinary answers carrying a
    // reason, not server faults that say nothing.
    return result.ok ? { success: true } : fail(409, { reason: result.reason })
  }
} satisfies Actions
