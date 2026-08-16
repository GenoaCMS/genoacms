import { config } from '@genoacms/cloudabstraction'
import type { authentication } from '@genoacms/cloudabstraction'
import { type Cookies } from '@sveltejs/kit'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { randomUUID } from 'node:crypto'
import { authenticate } from './providers.server'
import { resolvePrincipal } from '../authorization/resolution.server'
import { loadSecurityPolicy } from '$lib/script/securityPolicy/policy.server'
import { getSessionKey } from '$lib/script/signing/rootKey.server'
import { startSession, refreshSession, revokeSession } from './session.server'
import { packSessionCookie, unpackSessionCookie, type SessionCookie } from './sessionCookie'

const { cookieName } = config.authentication

/**
 * One cookie carries the whole session.
 *
 * Not three, because some hosting layers forward only one: Firebase Hosting and Google Cloud CDN
 * pass `__session` through and strip everything else, which would leave renewal permanently broken
 * on those deployments. Operators there set `authentication.cookieName` to `__session`; the packing
 * is the same everywhere, so there is one code path rather than a deployment-specific one.
 *
 * It is scoped to the whole site rather than a refresh endpoint: SvelteKit renders on the server, so
 * every request that might need to renew is an ordinary page request.
 */
const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
} as const

/**
 * Cookie lifetime, in seconds until the session family's own expiry.
 *
 * Without this the cookie would last only until the browser closed, and the family lifetime in the
 * security policy would describe something no client could ever reach. Tied to the record's expiry
 * rather than restarted on each renewal: the family does not live longer for being used.
 */
function secondsUntil (expiresAt: number): number {
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1_000))
}

/** Mints an access token for a subject. Identity only; grants are resolved per request. */
async function issueAccessToken (subject: string, email: string): Promise<string> {
  const { accessTokenMinutes } = await loadSecurityPolicy()
  return await new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${accessTokenMinutes}m`)
    .sign(await getSessionKey())
}

async function authenticateAndAuthorize (email: string, password: string): Promise<authentication.Identity | null> {
  let identity = null
  try {
    identity = await authenticate(email, password)
  } catch {
    return null
  }
  if (!identity) return null
  // Valid credentials are not admission: the identity must also be a principal of this instance,
  // which is the seed administrator or a user the authorization data names. A known user holding
  // no roles may sign in and will simply be denied every operation.
  const { known } = await resolvePrincipal(identity.subject)
  if (!known) return null
  return identity
}

async function login (email: string, password: string, cookies: Cookies) {
  const identity = await authenticateAndAuthorize(email, password)
  if (!identity) throw new Error('invalid-credentials')

  // Identity only. Grants are resolved per request and cached, so the cookie stays a few hundred
  // bytes however many permissions the principal holds — and a revoked permission stops being
  // honoured at the cache window rather than at token expiry.
  const session = await startSession(identity.subject, identity.email)
  writeSessionCookie(cookies, {
    accessToken: await issueAccessToken(identity.subject, identity.email),
    refreshToken: session.token,
    familyId: session.familyId
  }, session.expiresAt)
}

function writeSessionCookie (cookies: Cookies, session: SessionCookie, expiresAt: number): void {
  cookies.set(cookieName, packSessionCookie(session), {
    ...cookieOptions,
    maxAge: secondsUntil(expiresAt)
  })
}

/** The session this request presented, or `undefined` when it presented none we can read. */
function readSessionCookie (cookies: Cookies): SessionCookie | undefined {
  return unpackSessionCookie(cookies.get(cookieName))
}

/**
 * Renews an expired access token from the refresh cookie, in place.
 *
 * Done during an ordinary request rather than at an endpoint the client calls: the admin interface
 * renders on the server, so there is no client code running when a server load needs a session.
 *
 * Returns the subject when the session continues, `undefined` when the client must sign in again.
 */
async function renewSession (cookies: Cookies): Promise<string | undefined> {
  const presented = readSessionCookie(cookies)
  if (presented?.refreshToken === undefined || presented.familyId === undefined) return undefined

  const result = await refreshSession(presented.familyId, presented.refreshToken)
  if (result.outcome === 'rejected') {
    clearSession(cookies)
    return undefined
  }

  const accessToken = await issueAccessToken(result.subject, result.email)
  // On 'concurrent' the refresh half is written back unchanged: another request has already rotated
  // it, and replacing the winner's token with the superseded one would undo that rotation.
  const refreshToken = result.outcome === 'refreshed' ? result.token : presented.refreshToken
  writeSessionCookie(
    cookies,
    { accessToken, refreshToken, familyId: presented.familyId },
    result.expiresAt
  )
  return result.subject
}

function clearSession (cookies: Cookies): void {
  cookies.delete(cookieName, { path: '/' })
}

async function verifyAuthCookie (cookies: Cookies): Promise<JWTPayload | false> {
  const session = readSessionCookie(cookies)
  if (session === undefined) return false
  const result = await jwtVerify(session.accessToken, await getSessionKey())
  return result.payload
}

/** Verifies the access cookie, or `undefined` when it is absent, expired or not ours. */
async function verifiedPayload (cookies: Cookies): Promise<JWTPayload | undefined> {
  try {
    const payload = await verifyAuthCookie(cookies)
    return payload === false ? undefined : payload
  } catch {
    return undefined
  }
}

/**
 * The authenticated payload for a request, renewing the access token when it has expired.
 *
 * Renewal happens here rather than at an endpoint the client calls, because the access token
 * lifetime is short (§4.2.1) and nothing in a server-rendered admin interface is running to notice
 * it lapse — the next page load simply has to carry on.
 *
 * `undefined` means the request is anonymous, whether it arrived that way or lost its session.
 */
async function authenticateRequest (cookies: Cookies): Promise<JWTPayload | undefined> {
  const current = await verifiedPayload(cookies)
  if (current !== undefined) return current

  // No usable access token. `renewSession` clears the cookies when the refresh token is spent, so
  // an unrenewable request does not keep presenting a dead session on every page.
  if (await renewSession(cookies) === undefined) return undefined
  return await verifiedPayload(cookies)
}

async function logout (cookies: Cookies) {
  const familyId = readSessionCookie(cookies)?.familyId
  // Ends the family in storage, not merely in the browser: clearing a cookie leaves a usable
  // refresh token in the hands of anyone who copied it.
  if (familyId !== undefined) await revokeSession(familyId)
  clearSession(cookies)
}

export {
  cookieName,
  authenticateRequest,
  login,
  verifyAuthCookie,
  logout
}
