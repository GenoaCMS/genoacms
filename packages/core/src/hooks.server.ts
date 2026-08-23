import { authenticateRequest } from '$lib/script/auth/auth.server'
import { ensureInstanceInitialized } from '$lib/script/bootstrap.server'
import { getAuthContext } from '$lib/script/authorization/grants.server'
import type { Cookies, Handle } from '@sveltejs/kit'
import type { JWTPayload } from 'jose'

// Once per process, before anything is served. Awaited at module scope rather than per request so
// that a fresh instance has its signing keys and manifests in place before the first login, not
// after whichever request first happens to need them — which, for an instance whose only user is
// the seed administrator, is never.
await ensureInstanceInitialized()

/**
 * Attaches identity and grants to the request.
 *
 * The token carries identity only. Grants are resolved here, from a per-subject cache, so a service
 * function is handed a context rather than being trusted to fetch one — and a permission revoked
 * elsewhere stops being honored within the cache window rather than at token expiry.
 */
async function attachPrincipal (locals: App.Locals, cookies: Cookies): Promise<void> {
  const payload: JWTPayload | undefined = await authenticateRequest(cookies)
  if (payload === undefined) return

  locals.user = payload
  if (typeof payload.sub === 'string') locals.auth = await getAuthContext(payload.sub)
}

export const handle: Handle = async ({ event, resolve }) => {
  await attachPrincipal(event.locals, event.cookies)
  return await resolve(event)
}
