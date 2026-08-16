import { config } from '@genoacms/cloudabstraction'
import type { authentication } from '@genoacms/cloudabstraction'
import { type Cookies } from '@sveltejs/kit'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { randomUUID } from 'node:crypto'
import { authenticate } from './providers.server'
import { resolvePrincipal } from '../authorization/resolution.server'
import { loadSecurityPolicy } from '$lib/script/securityPolicy/policy.server'
import { getSessionKey } from '$lib/script/signing/rootKey.server'

const { cookieName } = config.authentication

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
  const { accessTokenMinutes } = await loadSecurityPolicy()
  const token = await new SignJWT({ email: identity.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.subject)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${accessTokenMinutes}m`)
    .sign(await getSessionKey())

  cookies.set(cookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  })
}

async function verifyAuthCookie (cookies: Cookies): Promise<JWTPayload | false> {
  const authCookie = cookies.get(cookieName)
  if (!authCookie) return false
  const result = await jwtVerify(authCookie, await getSessionKey())
  return result.payload
}

function logout (cookies: Cookies) {
  cookies.delete(cookieName, { path: '/' })
}

export {
  cookieName,
  login,
  verifyAuthCookie,
  logout
}
