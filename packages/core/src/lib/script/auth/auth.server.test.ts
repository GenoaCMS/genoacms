import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignJWT, decodeJwt } from 'jose'
import type { Cookies } from '@sveltejs/kit'

/**
 * The cookie seam: what a caller observes across login, renewal and logout.
 *
 * Written against **behavior, not mechanism** — that a request carrying a live session is
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

vi.mock('$lib/script/host.server', () => ({ host: { get cookieName () { return COOKIE_NAME }, authenticationProviderKeys: ['a', 'b', 'c'] } }))

vi.mock('$lib/script/signing/rootKey.server', () => ({
  getSessionKey: async () => SESSION_KEY
}))

vi.mock('$lib/script/securityPolicy/policy.server', () => ({
  loadSecurityPolicy: async () => ({
    subordinateKeyRotationDays: 90,
    accessTokenMinutes: 15,
    grantCacheSeconds: 30,
    refreshTokenDays: 14,
    maxFuel: 1_000_000,
    maxDepth: 100,
    maxAllocation: 10_000_000,
    fetchOrigins: []
  })
}))

const identity = { subject: 'subject-1', email: 'admin@example.com' }
const admitted: { value: { subject: string, email: string } } = { value: identity }
const credentials: { valid: boolean, failure: 'invalid-credentials' | 'too-many-attempts' | 'sign-in-unavailable' } = { valid: true, failure: 'invalid-credentials' }

const revalidated: unknown[][] = []
const revalidation: { answer: () => Promise<{ subject: string, email: string } | null> } = { answer: async () => identity }

vi.mock('./providers.server', () => ({
  signIn: async () => credentials.valid
    ? { outcome: 'signed-in', provider: 'b', identity: admitted.value }
    : { outcome: 'failed', failure: credentials.failure },
  revalidate: async (...args: unknown[]) => { revalidated.push(args); return await revalidation.answer() }
}))

const principal: { known: boolean } = { known: true }
const askedAbout: string[] = []

vi.mock('../authorization/resolution.server', () => ({
  resolvePrincipal: async (subject: string) => { askedAbout.push(subject); return { known: principal.known, warnings: [] } }
}))

const EXPIRY = Date.now() + 14 * 24 * 60 * 60 * 1_000

const started = { familyId: 'family-1', token: 'refresh-token-1', expiresAt: EXPIRY }
const startedWith: unknown[][] = []
const refreshOutcome: { value: unknown } = { value: undefined }
const revoked: string[] = []

type Revalidate = (family: { subject: string, email: string, provider?: string }) => Promise<{ subject: string, email: string } | null>

/** The family a current token belongs to, in the tests that set no outcome of their own. */
const currentFamily: { value: { subject: string, email: string, provider?: string } } = { value: { subject: identity.subject, email: identity.email, provider: 'b' } }

/** A current token, answered as AUTHN-7 says, for the tests that set no outcome of their own. */
async function refreshingCurrent (revalidate: Revalidate): Promise<unknown> {
  const answer = await revalidate(currentFamily.value)
  if (answer === null) return { outcome: 'rejected', reason: 'identity-gone' }
  return { outcome: 'refreshed', subject: identity.subject, email: answer.email, token: 'refresh-token-2', expiresAt: EXPIRY }
}

vi.mock('./session.server', () => ({
  startSession: async (...args: unknown[]) => { startedWith.push(args); return started },
  refreshSession: async (_familyId: string, _token: string, revalidate: Revalidate) =>
    refreshOutcome.value ?? await refreshingCurrent(revalidate),
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
  credentials.failure = 'invalid-credentials'
  startedWith.length = 0
  principal.known = true
  refreshOutcome.value = undefined
  revoked.length = 0
  revalidated.length = 0
  revalidation.answer = async () => identity
  askedAbout.length = 0
  admitted.value = identity
  currentFamily.value = { subject: identity.subject, email: identity.email, provider: 'b' }
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

  it('AUTHN-5: a sign-in authorization does not know fails as invalid credentials', async () => {
    principal.known = false
    const { login, SignInError } = await authModule()
    const { cookies, jar } = cookieJar()

    const refusal = login(identity.email, 'password', cookies)
    await expect(refusal).rejects.toBeInstanceOf(SignInError)
    await expect(refusal).rejects.toMatchObject({ code: 'invalid-credentials' })
    expect(jar.size).toBe(0)
    expect(startedWith).toEqual([])
  })

  it('AUTHN-5: login logs neither the email nor the password', async () => {
    const PASSWORD = 'correct horse battery staple'
    const lines: string[] = []
    for (const channel of Object.keys(console) as Array<keyof Console>) {
      if (typeof console[channel] !== 'function') continue
      vi.spyOn(console, channel as 'log').mockImplementation((...line: unknown[]) => { lines.push(line.map(part => typeof part === 'string' ? part : JSON.stringify(part)).join(' ')) })
    }
    for (const stream of [process.stdout, process.stderr]) {
      vi.spyOn(stream, 'write').mockImplementation((chunk: unknown) => { lines.push(String(chunk)); return true })
    }
    const { login } = await authModule()

    await login(identity.email, PASSWORD, cookieJar().cookies)
    for (const failure of ['invalid-credentials', 'too-many-attempts', 'sign-in-unavailable'] as const) {
      credentials.valid = false
      credentials.failure = failure
      await login(identity.email, PASSWORD, cookieJar().cookies).catch(() => undefined)
    }
    credentials.valid = true
    principal.known = false
    await login(identity.email, PASSWORD, cookieJar().cookies).catch(() => undefined)
    vi.restoreAllMocks()

    for (const line of lines) {
      expect(line).not.toContain(identity.email)
      expect(line).not.toContain(PASSWORD)
    }
  })

  it('AUTHN-5: the session and the access token carry the identity as the provider returned it', async () => {
    admitted.value = { subject: identity.subject, email: ' Ada@Example.COM ' }
    const { login } = await authModule()
    const { cookies, jar } = cookieJar()

    await login(identity.email, 'password', cookies)

    expect(startedWith).toEqual([[{ subject: identity.subject, email: ' Ada@Example.COM ' }, 'b']])
    expect(decodeJwt((await sessionIn(jar))?.accessToken as string).email).toBe(' Ada@Example.COM ')
  })

  it('AUTHN-5: authorization is asked about the subject', async () => {
    const { login } = await authModule()
    const { cookies } = cookieJar()

    await login(identity.email, 'password', cookies)

    expect(askedAbout).toEqual([identity.subject])
  })

  it('AUTHN-5: each failure reaches the caller as its code', async () => {
    const { login, SignInError } = await authModule()
    for (const failure of ['invalid-credentials', 'too-many-attempts', 'sign-in-unavailable'] as const) {
      credentials.valid = false
      credentials.failure = failure
      const { cookies, jar } = cookieJar()

      const refusal = login(identity.email, 'password', cookies)
      await expect(refusal).rejects.toBeInstanceOf(SignInError)
      await expect(refusal).rejects.toMatchObject({ code: failure, message: failure })
      expect(jar.size).toBe(0)
    }
  })

  it('AUTHN-6: a session records the provider that signed it in', async () => {
    const { login } = await authModule()
    const { cookies } = cookieJar()

    await login(identity.email, 'password', cookies)

    expect(startedWith).toEqual([[identity, 'b']])
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

describe('revalidating at renewal (CS1)', () => {
  const expiredCookie = async (): Promise<string> => {
    const { packSessionCookie } = await import('./sessionCookie')
    return packSessionCookie({
      accessToken: await accessTokenFor('-1s'),
      refreshToken: started.token,
      familyId: started.familyId
    })
  }

  it('AUTHN-7: a refresh revalidates the family\'s subject with its recorded provider', async () => {
    const { authenticateRequest } = await authModule()
    const { cookies } = cookieJar({ [COOKIE_NAME]: await expiredCookie() })

    expect((await authenticateRequest(cookies))?.sub).toBe(identity.subject)
    expect(revalidated).toEqual([[identity.subject, 'b']])
  })

  it('AUTHN-7: a failed revalidation fails the request and leaves the cookie', async () => {
    revalidation.answer = async () => { throw new Error('session/revalidation-failed: b: down') }
    const { authenticateRequest } = await authModule()
    const cookie = await expiredCookie()
    const { cookies, jar } = cookieJar({ [COOKIE_NAME]: cookie })

    await expect(authenticateRequest(cookies)).rejects.toThrow('session/revalidation-failed: b: down')
    expect([...jar.entries()]).toEqual([[COOKIE_NAME, cookie]])
  })

  it('AUTHN-7: the renewed access token carries the email revalidation returned', async () => {
    revalidation.answer = async () => ({ subject: identity.subject, email: ' Ada@New.Example.com ' })
    const { authenticateRequest } = await authModule()
    const { cookies } = cookieJar({ [COOKIE_NAME]: await expiredCookie() })

    expect((await authenticateRequest(cookies))?.email).toBe(' Ada@New.Example.com ')
  })

  it('AUTHN-7: a family without a provider is revalidated without one', async () => {
    currentFamily.value = { subject: identity.subject, email: identity.email }
    const { authenticateRequest } = await authModule()
    const { cookies } = cookieJar({ [COOKIE_NAME]: await expiredCookie() })

    await authenticateRequest(cookies)

    expect(revalidated).toEqual([[identity.subject, undefined]])
  })

  it('AUTHN-7: a gone identity clears the session', async () => {
    revalidation.answer = async () => null
    const { authenticateRequest } = await authModule()
    const { cookies, jar } = cookieJar({ [COOKIE_NAME]: await expiredCookie() })

    expect(await authenticateRequest(cookies)).toBeUndefined()
    expect(jar.size).toBe(0)
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
