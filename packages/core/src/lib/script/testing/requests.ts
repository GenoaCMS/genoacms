import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit'
import { createAuthContext, type AuthContext } from '#lib/script/authorization/context.js'
import type { Grant } from '#lib/script/authorization/grants.js'
import type { Permission } from '#lib/script/authorization/permissions.js'

/** A value read from JSON, whose shape a test asserts rather than declares. */
type Parsed = ReturnType<typeof JSON.parse>

/** Imports a module by a path known only at run time, so a test file loads before the module exists. */
async function importModule<T = Parsed> (path: string): Promise<T> {
  return await import(/* @vite-ignore */ path) as T
}

const principal = (permissions: Array<Permission | '*'>, subject = 'subject-1'): AuthContext =>
  createAuthContext(subject, permissions.map(permission => ({ permission, resource: '*' }) as Grant))

/** How a form action ended: its return value, a failure, a redirect or an HTTP error. */
interface ActionOutcome {
  status: number
  data?: Parsed
  location?: string
  thrown?: unknown
}

async function runAction (
  actions: Record<string, unknown>,
  name: string,
  fields: Record<string, string>,
  options: { auth: AuthContext, params?: Record<string, string>, path?: string }
): Promise<ActionOutcome> {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  const url = new URL(`http://localhost${options.path ?? '/components/pages'}?/${name}`)
  const event = { request: new Request(url, { method: 'POST', body }), url, params: options.params ?? {}, locals: { auth: options.auth } }
  try {
    const result = await (actions[name] as (event: unknown) => Promise<unknown>)(event)
    if (isActionFailure(result)) return { status: result.status, data: result.data }
    return { status: 200, data: result }
  } catch (error) {
    if (isRedirect(error)) return { status: error.status, location: error.location }
    if (isHttpError(error)) return { status: error.status, data: error.body, thrown: error }
    return { status: 500, thrown: error }
  }
}

export { importModule, principal, runAction }
export type { ActionOutcome, Parsed }
