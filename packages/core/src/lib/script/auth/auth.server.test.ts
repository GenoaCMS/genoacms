import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignJWT } from 'jose'
import type { Cookies } from '@sveltejs/kit'

/**
 * The cookie seam: what a caller observes across login, renewal and logout.
 *
 * Written against **behaviour, not mechanism** — that a request carrying a live session is
 * authenticated, that renewal keeps the session renewable, that logout ends it in storage — so these
 * cases outlive the credential format they were written under. The access token is about to be
 * replaced by an opaque one, and the point of this file is to show that what a caller sees does not
 * change when it is.
 *
 * The layers either side of this seam are tested elsewhere: packing in `sessionCookie.test.ts`, the
 * records in `session.server.test.ts`. What was untested is the few lines joining them, which is
 * where the concurrent-renewal case lives — the one whose failure would silently make sessions
 * non-renewable.
 */

const COOKIE_NAME = 'session'
const SESSION_KEY = new Uint8Array(32).fill(7)

vi.mock('@genoacms/cloudabstraction', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const real = actual.config as Record<string, unknown>
  return {
    ...actual,
    config: { ...real, authentication: { providers: [], cookieName: COOKIE_NAME } }
  }
})

vi.mock('$lib/script/signing/rootKey.server', () => ({
  getSessionKey: async () => SESSION_KEY
}))

vi.mock('$lib/script/securityPolicy/policy.server', () => ({
  loadSecurityPolicy: async () => ({
    subordinateKeyRotationDays: 90,
    accessTokenMinutes: 15,
    grantCacheSeconds: 30,
    refreshTokenDays: 14
  })
}))

const identity = { subject: 'subject-1', email: 'admin@example.com' }
const credentials: { valid: boolean } = { valid: true }

vi.mock('./providers.server', () => ({
  authenticate: async () => credentials.valid ? identity : null
}))

const principal: { known: boolean } = { known: true }

vi.mock('../authorization/resolution.server', () => ({
  resolvePrincipal: async () => ({ known: principal.known, warnings: [] })
}))

const EXPIRY = Date.now() + 14 * 24 * 60 * 60 * 1_000

const started = { familyId: 'family-1', token: 'refresh-token-1', expiresAt: EXPIRY }
const refreshOutcome: { value: unknown } = { value: undefined }
const revoked: string[] = []

vi.mock('./session.server', () => ({
  startSession: async () => started,
  refreshSession: async () => refreshOutcome.value,
  revokeSession: async (familyId: string) => { revoked.push(familyId) }
}))

/** Enough of SvelteKit's cookie jar to observe what the module writes. */
function cookieJar (initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial))
  const cookies = {
    get: (name: string) => jar.get(name),
    set: (name: string, value: string) => { jar.set(name, value) },
    delete: (name: string) => { jar.delete(name) }
  } as unknown as Cookies
  return { cookies, jar }
}

const accessTokenFor = async (expiresIn: string): Promise<string> =>
  await new SignJWT({ email: identity.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.subject)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(SESSION_KEY)

type AuthModule = typeof import('./auth.server')
const authModule = async (): Promise<AuthModule> => await import('./auth.server')

/** Reads back what the module put in the jar, through the same packing a browser would return. */
async function sessionIn (jar: Map<string, string>) {
  const { unpackSessionCookie } = await import('./sessionCookie')
  return unpackSessionCookie(jar.get(COOKIE_NAME))
}

beforeEach(() => {
  credentials.valid = true
  principal.known = true
  refreshOutcome.value = undefined
  revoked.length = 0
})

describe('login', () => {
  it('leaves the request able to authenticate and to renew', async () => {
    const { login } = await authModule()
    const { cookies, jar } = cookieJar()

    await login(identity.email, 'password', cookies)

    const session = await sessionIn(jar)
    expect(session?.accessToken).toBeDefined()
    // Both halves, or the session is authenticated now and dead at the first expiry.
    expect(session?.refreshToken).toBe(started.token)
    expect(session?.familyId).toBe(started.familyId)
  })

  it('writes exactly one cookie', async () => {
    const { login } = await authModule()
    const { cookies, jar } = cookieJar()

    await login(identity.email, 'password', cookies)

    // Hosts that forward only `__session` strip the rest; a second cookie would not arrive.
    expect([...jar.keys()]).toEqual([COOKIE_NAME])
  })

  it('refuses invalid credentials without writing a cookie', async () => {
    credentials.valid = false
    const { login } = await authModule()
    const { cookies, jar } = cookieJar()

    await expect(login(identity.email, 'wrong', cookies)).rejects.toThrow('invalid-credentials')
    expect(jar.size).toBe(0)
  })

  it('refuses an authenticated identity that is not a principal of this instance', async () => {
    principal.known = false
    const { login } = await authModule()
    const { cookies, jar } = cookieJar()

    await expect(login(identity.email, 'password', cookies)).rejects.toThrow('invalid-credentials')
    expect(jar.size).toBe(0)
  })
})

describe('authenticating a request', () => {
  it('accepts a live session without renewing it', async () => {
    const { authenticateRequest } = await authModule()
    const { packSessionCookie } = await import('./sessionCookie')
    const { cookies } = cookieJar({
      [COOKIE_NAME]: packSessionCookie({
        accessToken: await accessTokenFor('15m'),
        refreshToken: started.token,
        familyId: started.familyId
      })
    })

    const payload = await authenticateRequest(cookies)

    expect(payload?.sub).toBe(identity.subject)
    // Renewal would have been an unnecessary storage write on an ordinary page load.
    expect(refreshOutcome.value).toBeUndefined()
  })

  it('is anonymous when no cookie is presented', async () => {
    const { authenticateRequest } = await authModule()
    const { cookies } = cookieJar()

    expect(await authenticateRequest(cookies)).toBeUndefined()
  })

  it('is anonymous for an unreadable cookie rather than throwing', async () => {
    const { authenticateRequest } = await authModule()
    const { cookies } = cookieJar({ [COOKIE_NAME]: 'not-a-session-cookie' })

    expect(await authenticateRequest(cookies)).toBeUndefined()
  })

  it('is anonymous for a token signed with another key', async () => {
    const foreign = await new SignJWT({ email: identity.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('intruder')
      .setExpirationTime('15m')
      .sign(new Uint8Array(32).fill(9))
    const { packSessionCookie } = await import('./sessionCookie')
    const { authenticateRequest } = await authModule()
    const { cookies } = cookieJar({ [COOKIE_NAME]: packSessionCookie({ accessToken: foreign }) })

    expect(await authenticateRequest(cookies)).toBeUndefined()
  })
})

describe('renewing an expired session', () => {
  const expiredCookie = async (): Promise<string> => {
    const { packSessionCookie } = await import('./sessionCookie')
    return packSessionCookie({
      accessToken: await accessTokenFor('-1s'),
      refreshToken: started.token,
      familyId: started.familyId
    })
  }

  it('authenticates the request again', async () => {
    refreshOutcome.value = {
      outcome: 'refreshed',
      subject: identity.subject,
      email: identity.email,
      token: 'refresh-token-2',
      expiresAt: EXPIRY
    }
    const { authenticateRequest } = await authModule()
    const { cookies, jar } = cookieJar({ [COOKIE_NAME]: await expiredCookie() })

    const payload = await authenticateRequest(cookies)

    expect(payload?.sub).toBe(identity.subject)
    expect((await sessionIn(jar))?.refreshToken).toBe('refresh-token-2')
  })

  it('keeps the presented refresh token when another request rotated first', async () => {
    // The regression that matters. Dropping the refresh half here leaves an authenticated request
    // whose session can never be renewed again — which presents as being signed out at the next
    // expiry, with nothing to say why.
    refreshOutcome.value = {
      outcome: 'concurrent',
      subject: identity.subject,
      email: identity.email,
      expiresAt: EXPIRY
    }
    const { authenticateRequest } = await authModule()
    const { cookies, jar } = cookieJar({ [COOKIE_NAME]: await expiredCookie() })

    const payload = await authenticateRequest(cookies)

    expect(payload?.sub).toBe(identity.subject)
    const session = await sessionIn(jar)
    expect(session?.refreshToken).toBe(started.token)
    expect(session?.familyId).toBe(started.familyId)
  })

  it('clears the session when the refresh token is spent', async () => {
    refreshOutcome.value = { outcome: 'rejected', reason: 'token-reused' }
    const { authenticateRequest } = await authModule()
    const { cookies, jar } = cookieJar({ [COOKIE_NAME]: await expiredCookie() })

    expect(await authenticateRequest(cookies)).toBeUndefined()
    // Left in place, the browser would re-present a dead session on every subsequent request.
    expect(jar.size).toBe(0)
  })

  it('does not attempt renewal when the cookie carries no refresh half', async () => {
    const { packSessionCookie } = await import('./sessionCookie')
    const { authenticateRequest } = await authModule()
    const { cookies } = cookieJar({
      [COOKIE_NAME]: packSessionCookie({ accessToken: await accessTokenFor('-1s') })
    })

    expect(await authenticateRequest(cookies)).toBeUndefined()
    expect(revoked).toEqual([])
  })
})

describe('logout', () => {
  it('ends the family in storage and clears the cookie', async () => {
    const { login, logout } = await authModule()
    const { cookies, jar } = cookieJar()
    await login(identity.email, 'password', cookies)

    await logout(cookies)

    // Clearing the cookie alone would leave a usable refresh token with anyone who copied it.
    expect(revoked).toEqual([started.familyId])
    expect(jar.size).toBe(0)
  })

  it('succeeds when no session is present', async () => {
    const { logout } = await authModule()
    const { cookies } = cookieJar()

    await expect(logout(cookies)).resolves.toBeUndefined()
    expect(revoked).toEqual([])
  })
})
