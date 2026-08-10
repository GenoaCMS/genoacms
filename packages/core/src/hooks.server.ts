import { cookieName, verifyAuthCookie } from '$lib/script/auth/auth.server'
import type { Handle } from '@sveltejs/kit'

export const handle: Handle = async ({ event, resolve }) => {
  const sessionCookie = event.cookies.get(cookieName)
  if (!sessionCookie) return await resolve(event)
  let payload
  try {
    payload = await verifyAuthCookie(event.cookies)
  } catch (e) {
    event.cookies.delete(cookieName, {
      path: '/'
    })
    return await resolve(event)
  }
  event.locals.user = payload
  const response = await resolve(event)
  return response
}
