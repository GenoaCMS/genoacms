import { config } from '@genoacms/cloudabstraction'
import type { authentication } from '@genoacms/cloudabstraction'
import { type Cookies } from '@sveltejs/kit'
import { CompactSign, jwtVerify, type JWTPayload } from 'jose'
import { authenticate } from './providers.server'
import { isSeedAdmin } from '../authorization/seedAdmin.server'

const { cookieName, JWTSecret } = await config.authentication

async function authenticateAndAuthorize (email: string, password: string): Promise<authentication.Identity | null> {
  let identity = null
  try {
    identity = await authenticate(email, password)
  } catch {
    return null
  }
  if (!identity) return null
  if (!isSeedAdmin(identity.subject)) return null
  return identity
}

async function login (email: string, password: string, cookies: Cookies) {
  const identity = await authenticateAndAuthorize(email, password)
  if (!identity) throw new Error('invalid-credentials')
  const payloadText = JSON.stringify({ sub: identity.subject, email: identity.email }) // TODO: expiration
  const encoder = new TextEncoder()
  const token = await new CompactSign(encoder.encode(payloadText))
    .setProtectedHeader({ alg: 'HS256' })
    .sign(encoder.encode(JWTSecret))
  cookies.set(cookieName, token, { path: '/' })
}

async function verifyAuthCookie (cookies: Cookies): Promise<JWTPayload | false> {
  const authCookie = cookies.get(cookieName)
  if (!authCookie) return false
  const result = await jwtVerify(authCookie, new TextEncoder().encode(JWTSecret))
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
