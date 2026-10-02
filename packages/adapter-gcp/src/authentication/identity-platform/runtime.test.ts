import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const auth = vi.hoisted(() => ({ constructed: [] as unknown[], token: 'adc-token' as string | Error }))

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor (options: unknown) { auth.constructed.push(options) }
    async getAccessToken (): Promise<string> {
      if (auth.token instanceof Error) throw auth.token
      return auth.token
    }
  }
}))

const { default: runtime } = await import('./runtime.js')

interface Sent { url: URL, init: RequestInit & { headers: Record<string, string> } }
let sent: Sent[]
let reply: () => Promise<Response>

const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status })
const toolkitError = (status: number, message: string) => json(status, { error: { code: status, message } })
const body = (index = 0): Record<string, unknown> => JSON.parse(String(sent[index].init.body))
const ctx = { name: 'identity-platform', resources: [] }
const provider = (options: Record<string, unknown> = {}) => runtime.create({ projectId: 'genoacms', ...options } as never, ctx) as Awaited<ReturnType<typeof runtime.create>>

beforeEach(() => {
  sent = []
  auth.constructed.length = 0
  auth.token = 'adc-token'
  reply = json(200, { localId: 'uid-ada', email: 'ada@example.com', idToken: 'id-token', refreshToken: 'refresh-token' })
  vi.stubGlobal('fetch', vi.fn(async (url: URL, init: Sent['init']) => { sent.push({ url, init }); return await reply() }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('signing in', () => {
  it('AUTH-2: makes one POST to signInWithPassword, with the API key as key and no token', async () => {
    await provider({ apiKey: 'api-key' }).authenticate('ada@example.com', 'lovelace')

    expect(sent).toHaveLength(1)
    expect(sent[0].url.origin + sent[0].url.pathname).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword')
    expect(sent[0].url.searchParams.get('key')).toBe('api-key')
    expect(sent[0].init.method).toBe('POST')
    expect(sent[0].init.headers.authorization).toBeUndefined()
    expect(body()).toEqual({ email: 'ada@example.com', password: 'lovelace', returnSecureToken: true })
  })

  it('AUTH-2: without an API key, carries an ADC token with the identitytoolkit scope', async () => {
    const credentials = { client_email: 'sa@genoacms.iam.gserviceaccount.com', private_key: 'k' }
    await provider({ credentials }).authenticate('ada@example.com', 'lovelace')

    expect(sent[0].url.searchParams.has('key')).toBe(false)
    expect(sent[0].init.headers.authorization).toBe('Bearer adc-token')
    expect(auth.constructed).toEqual([{ scopes: ['https://www.googleapis.com/auth/identitytoolkit'], projectId: 'genoacms', credentials }])
  })

  it('AUTH-2: sends the tenant when configured', async () => {
    await provider({ tenantId: 'cms-tenant' }).authenticate('ada@example.com', 'lovelace')

    expect(body()).toEqual({ email: 'ada@example.com', password: 'lovelace', returnSecureToken: true, tenantId: 'cms-tenant' })
  })

  it('AUTH-2, AUTH-7: abandons a call after 10 seconds and fails as a provider failure', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    reply = async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') }

    await expect(provider().authenticate('ada@example.com', 'lovelace')).rejects.toThrow(/^authentication\/provider-failed: network The operation was aborted/)
    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(sent[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it('AUTH-3: a 200 returns the subject and email it carries', async () => {
    expect(await provider().authenticate('ada@example.com', 'lovelace')).toEqual({ subject: 'uid-ada', email: 'ada@example.com' })
  })

  it('AUTH-4: a pending second factor is rejected as second-factor-required', async () => {
    reply = json(200, { localId: 'uid-ada', email: 'ada@example.com', mfaPendingCredential: 'pending', mfaInfo: [] })

    expect(await provider().authenticate('ada@example.com', 'lovelace')).toEqual({ rejected: 'second-factor-required' })
  })

  it('AUTH-5: every credential error code is rejected for credentials, suffix or not', async () => {
    for (const code of ['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_EMAIL', 'MISSING_PASSWORD', 'USER_DISABLED']) {
      for (const message of [code, `${code} : The user account has been disabled by an administrator.`]) {
        reply = toolkitError(400, message)
        expect(await provider().authenticate('ada@example.com', 'wrong')).toEqual({ rejected: 'credentials' })
      }
    }
  })

  it('AUTH-6: too many attempts throws authentication/throttled', async () => {
    reply = toolkitError(400, 'TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled')

    await expect(provider().authenticate('ada@example.com', 'wrong')).rejects.toThrow(/^authentication\/throttled$/)
  })

  it('AUTH-7: any other outcome throws a provider failure with its status and message', async () => {
    const cases: Array<[() => Promise<Response>, string]> = [
      [toolkitError(400, 'API_KEY_INVALID'), 'authentication/provider-failed: 400 API_KEY_INVALID'],
      [toolkitError(400, 'MISSING_RECAPTCHA_TOKEN'), 'authentication/provider-failed: 400 MISSING_RECAPTCHA_TOKEN'],
      [toolkitError(403, 'PERMISSION_DENIED'), 'authentication/provider-failed: 403 PERMISSION_DENIED'],
      [async () => new Response('<html>Bad gateway</html>', { status: 502 }), 'authentication/provider-failed: 502 '],
      [async () => { throw new TypeError('fetch failed') }, 'authentication/provider-failed: network fetch failed']
    ]
    for (const [answer, message] of cases) {
      reply = answer
      await expect(provider({ apiKey: 'k' }).authenticate('ada@example.com', 'lovelace')).rejects.toThrow(message)
    }
  })

  it('AUTH-7: an ADC token that cannot be obtained is a provider failure, and nothing is sent', async () => {
    auth.token = new Error('Could not load the default credentials')

    await expect(provider().authenticate('ada@example.com', 'lovelace')).rejects.toThrow('authentication/provider-failed: network Could not load the default credentials')
    expect(sent).toHaveLength(0)
  })

  it('AUTH-8: the tokens of the response are neither returned nor logged', async () => {
    const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map(level => vi.spyOn(console, level).mockImplementation(() => {}))

    const result = await provider().authenticate('ada@example.com', 'lovelace')

    expect(JSON.stringify(result)).not.toMatch(/id-token|refresh-token/)
    for (const spy of logged) expect(spy).not.toHaveBeenCalled()
  })
})

describe('the provider', () => {
  it('AUTH-9: offers no management capability', () => {
    expect(Object.keys(provider()).sort()).toEqual(['authenticate', 'getIdentity'])
  })
})

describe('looking a subject up', () => {
  it('AUTH-10: makes one POST to accounts:lookup with the project and tenant, carrying an ADC token even with an API key', async () => {
    reply = json(200, { users: [{ localId: 'uid-ada', email: 'ada@example.com' }] })

    expect(await provider({ apiKey: 'api-key', tenantId: 'cms-tenant' }).getIdentity('uid-ada')).toEqual({ subject: 'uid-ada', email: 'ada@example.com' })
    expect(sent).toHaveLength(1)
    expect(sent[0].url.href).toBe('https://identitytoolkit.googleapis.com/v1/accounts:lookup')
    expect(sent[0].init.headers.authorization).toBe('Bearer adc-token')
    expect(body()).toEqual({ localId: ['uid-ada'], targetProjectId: 'genoacms', tenantId: 'cms-tenant' })
  })

  it('AUTH-10: returns null for no entry, a disabled entry and an entry without an email', async () => {
    for (const users of [undefined, [], [{ localId: 'uid-ada', email: 'ada@example.com', disabled: true }], [{ localId: 'uid-ada' }]]) {
      reply = json(200, users === undefined ? {} : { users })
      expect(await provider().getIdentity('uid-ada')).toBeNull()
    }
  })

  it('AUTH-10: any other outcome throws as a provider failure', async () => {
    reply = toolkitError(403, 'CONFIGURATION_NOT_FOUND')

    await expect(provider().getIdentity('uid-ada')).rejects.toThrow('authentication/provider-failed: 403 CONFIGURATION_NOT_FOUND')
  })
})
