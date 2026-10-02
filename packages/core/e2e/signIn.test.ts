import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { buildCore, startServer, type RunningServer, type User } from './server'
import { signIn, openLoginPage, withExpiredAccessToken, accessClaims } from './client'
import { enabled, removeInstance } from './bucket'

const password = (): string => randomBytes(18).toString('base64url')

const ada: User = { subject: 'e2e-ada', email: 'Ada.Lovelace@E2E.test', password: password() }
const adaElsewhere: User = { ...ada, password: password() }
const adaRenamed: User = { ...adaElsewhere, email: 'Countess.Lovelace@E2E.test' }
const bob: User = { subject: 'e2e-bob', email: 'bob@e2e.test', password: password() }
const stranger: User = { subject: 'e2e-stranger', email: 'stranger@e2e.test', password: password() }
const secrets = [ada.password, adaElsewhere.password, bob.password, stranger.password]

const BUILD_TIMEOUT_MS = 300_000
const REQUEST_TIMEOUT_MS = 60_000

let server: RunningServer
let viaPrimary: string
let viaSecondary: string
const written: string[] = []

async function stopServer (): Promise<void> {
  if (server === undefined) return
  await server.stop()
  written.push(server.output())
}

async function serve (providers: Parameters<typeof startServer>[0]): Promise<void> {
  await stopServer()
  server = await startServer(providers)
}

async function refreshed (cookie: string): Promise<Awaited<ReturnType<typeof openLoginPage>>> {
  return await openLoginPage(server, withExpiredAccessToken(cookie))
}

describe.skipIf(!enabled).sequential('signing in and refreshing through the running server', { timeout: REQUEST_TIMEOUT_MS }, () => {
  beforeAll(async () => {
    await removeInstance()
    buildCore()
  }, BUILD_TIMEOUT_MS)

  afterAll(async () => {
    await stopServer()
    await removeInstance()
  }, BUILD_TIMEOUT_MS)

  describe('with both providers', () => {
    beforeAll(async () => { await serve({ primary: [ada, stranger], secondary: [adaElsewhere, bob] }) }, BUILD_TIMEOUT_MS)

    it('AUTHN-5: the first provider that knows the credentials signs the user in', async () => {
      const answer = await signIn(server, ada.email, ada.password)

      expect(answer.outcome).toBe('signed-in')
      if (answer.outcome === 'signed-in') viaPrimary = answer.cookie
      expect(accessClaims(viaPrimary)).toMatchObject({ sub: ada.subject, email: ada.email })
      expect((await openLoginPage(server, viaPrimary)).signedIn).toBe(true)
    })

    it('AUTHN-5: a credentials rejection moves on to the next provider', async () => {
      const answer = await signIn(server, adaElsewhere.email, adaElsewhere.password)

      expect(answer.outcome).toBe('signed-in')
      if (answer.outcome === 'signed-in') viaSecondary = answer.cookie
      expect(server.output()).toContain('[genoacms:auth] provider primary rejected the sign-in: credentials')
    })

    it('AUTHN-5: credentials no provider accepts fail as invalid-credentials', async () => {
      expect(await signIn(server, ada.email, `${ada.password}-wrong`)).toEqual({ outcome: 'failed', status: 400, reason: 'invalid-credentials' })
    })

    it('AUTHN-5: an identity the authorization data does not know fails as invalid-credentials', async () => {
      expect(await signIn(server, stranger.email, stranger.password)).toEqual({ outcome: 'failed', status: 400, reason: 'invalid-credentials' })
    })

    it('AUTHN-7: a refresh revalidates with the recorded provider and carries the email it returned', async () => {
      const page = await refreshed(viaSecondary)

      expect(page.signedIn).toBe(true)
      expect(typeof page.cookie).toBe('string')
      viaSecondary = page.cookie as string
      expect(accessClaims(viaSecondary)).toMatchObject({ sub: ada.subject, email: ada.email })
    })
  })

  describe('with the second provider failing', () => {
    beforeAll(async () => { await serve({ primary: [ada] }) }, BUILD_TIMEOUT_MS)

    it('AUTHN-5: a provider that fails makes the sign-in unavailable, not invalid', async () => {
      expect(await signIn(server, bob.email, bob.password)).toEqual({ outcome: 'failed', status: 400, reason: 'sign-in-unavailable' })
      expect(server.output()).toMatch(/\[genoacms:auth\] provider secondary failed: /)
    })

    it('AUTHN-6, AUTHN-7: a refresh whose provider fails fails the request and leaves the cookie', async () => {
      const page = await refreshed(viaSecondary)

      expect(page.status).toBe(500)
      expect(page.cookie).toBeUndefined()
    })
  })

  describe('with the user renamed at the second provider', () => {
    beforeAll(async () => { await serve({ primary: [ada], secondary: [adaRenamed, bob] }) }, BUILD_TIMEOUT_MS)

    it('AUTHN-7: the renewed access token carries the email the provider now returns', async () => {
      const page = await refreshed(viaSecondary)

      expect(page.signedIn).toBe(true)
      viaSecondary = page.cookie as string
      expect(accessClaims(viaSecondary)).toMatchObject({ sub: ada.subject, email: adaRenamed.email })
    })
  })

  describe('with the user gone from the second provider only', () => {
    beforeAll(async () => { await serve({ primary: [ada], secondary: [bob] }) }, BUILD_TIMEOUT_MS)

    it('AUTHN-6, AUTHN-7: the session the second provider signed in ends, though the first still knows the user', async () => {
      const page = await refreshed(viaSecondary)

      expect(page.signedIn).toBe(false)
      expect(page.cookie).toBeNull()
      expect((await refreshed(viaSecondary)).signedIn).toBe(false)
    })

    it('AUTHN-6, AUTHN-7: the session the first provider signed in goes on', async () => {
      const page = await refreshed(viaPrimary)

      expect(page.signedIn).toBe(true)
      expect(accessClaims(page.cookie as string)).toMatchObject({ sub: ada.subject, email: ada.email })
    })

    it('AUTHN-5: no line the server wrote contains an email or a password', () => {
      const output = [...written, server.output()].join('\n')
      for (const secret of [...secrets, ada.email, adaRenamed.email, bob.email, stranger.email]) expect(output).not.toContain(secret)
    })
  })
})
