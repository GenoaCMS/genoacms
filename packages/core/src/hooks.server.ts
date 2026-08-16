import { cookieName, verifyAuthCookie } from '$lib/script/auth/auth.server'
import { ensureInstanceInitialised } from '$lib/script/bootstrap.server'
import { getAuthContext } from '$lib/script/authorization/grants.server'
import type { Handle } from '@sveltejs/kit'

// Once per process, before anything is served. Awaited at module scope rather than per request so
// that a fresh instance has its signing keys and manifests in place before the first login, not
// after whichever request first happens to need them — which, for an instance whose only user is
// the seed administrator, is never.
await ensureInstanceInitialised()

export const handle: Handle = async ({ event, resolve }) => {
  const sessionCookie = event.cookies.get(cookieName)
  if (!sessionCookie) return await resolve(event)
  let payload
  try {
    payload = await verifyAuthCookie(event.cookies)
  } catch {
    event.cookies.delete(cookieName, {
      path: '/'
    })
    return await resolve(event)
  }
  event.locals.user = payload

  // The token carries identity only. Grants are resolved here, from a per-subject cache, so a
  // service function is handed a context rather than being trusted to fetch one — and a permission
  // revoked elsewhere stops being honoured within the cache window rather than at token expiry.
  const subject = payload === false ? undefined : payload.sub
  if (typeof subject === 'string') {
    event.locals.auth = await getAuthContext(subject)
  }

  const response = await resolve(event)
  return response
}
