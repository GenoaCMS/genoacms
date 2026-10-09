import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const auth = vi.hoisted(() => ({ constructed: [] as unknown[], token: 'adc-token' as string | Error | Promise<string> }))

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor (options: unknown) { auth.constructed.push(options) }
    async getAccessToken (): Promise<string> {
      if (auth.token instanceof Error) throw auth.token
      return await auth.token
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
const text = (status: number, content: string) => async (): Promise<Response> => new Response(content, { status })
const outcome = async (promise: Promise<unknown>): Promise<unknown> => await promise.then(value => ({ resolved: value }), (error: Error) => error.message)
const timeoutError = (): DOMException => new DOMException('The operation was aborted due to timeout', 'TimeoutError')
const failingBody = (error: Error) => async (): Promise<Response> => new Response(new ReadableStream({ pull (controller) { controller.error(error) } }), { status: 200 })
const stringOf = (value: unknown): string => {
  try {
    return typeof value === 'string' ? value : String(JSON.stringify(value))
  } catch {
    return String(value)
  }
}
const heldValues = (target: object): string[] => {
  const values: string[] = []
  for (let holder: object | null = target; holder !== null; holder = Object.getPrototypeOf(holder)) {
    const descriptors: Record<PropertyKey, PropertyDescriptor> = Object.getOwnPropertyDescriptors(holder)
    for (const key of Reflect.ownKeys(descriptors)) {
      values.push(stringOf(descriptors[key].value), stringOf(descriptors[key].get?.call(target)))
    }
  }
  return values
}
const replaceTimeout = (): AbortController[] => {
  const controllers: AbortController[] = []
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
    const controller = new AbortController()
    controllers.push(controller)
    return controller.signal
  })
  return controllers
}

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

  it('AUTH-2: sends the JSON content type with and without an API key', async () => {
    await provider({ apiKey: 'api-key' }).authenticate('ada@example.com', 'lovelace')
    await provider().authenticate('ada@example.com', 'lovelace')

    expect(sent).toHaveLength(2)
    for (const request of sent) expect(new Headers(request.init.headers).get('content-type')).toBe('application/json')
  })

  it('AUTH-2, AUTH-7: a network error or a 5xx is not retried', async () => {
    const cases: Array<[() => Promise<Response>, string]> = [
      [async () => { throw new TypeError('fetch failed') }, 'authentication/provider-failed: network fetch failed'],
      [toolkitError(503, 'UNAVAILABLE'), 'authentication/provider-failed: 503 UNAVAILABLE']
    ]
    for (const [answer, message] of cases) {
      sent = []
      reply = answer
      expect(await outcome(provider({ apiKey: 'k' }).authenticate('ada@example.com', 'lovelace'))).toBe(message)
      expect(sent).toHaveLength(1)
    }
  })

  it('AUTH-2, AUTH-7: the 10-second limit covers the ADC token', async () => {
    const controllers = replaceTimeout()
    auth.token = new Promise<string>(() => {})
    const calls = [
      async () => await provider().authenticate('ada@example.com', 'lovelace'),
      async () => await provider().getIdentity('uid-ada')
    ]
    for (const [index, call] of calls.entries()) {
      const pending = outcome(call())
      await vi.waitFor(() => { expect(controllers).toHaveLength(index + 1) })
      const error = timeoutError()
      controllers[index].abort(error)

      expect(await pending).toBe(`authentication/provider-failed: network ${error.message}`)
    }
    expect(sent).toHaveLength(0)
  })

  it('AUTH-2, AUTH-7: the request and the body read share the 10-second signal', async () => {
    const controllers = replaceTimeout()
    await provider().authenticate('ada@example.com', 'lovelace')

    expect(controllers).toHaveLength(1)
    expect(sent[0].init.signal).toBe(controllers[0].signal)

    const error = timeoutError()
    reply = failingBody(error)
    expect(await outcome(provider().authenticate('ada@example.com', 'lovelace'))).toBe(`authentication/provider-failed: network ${error.message}`)
    expect(await outcome(provider().getIdentity('uid-ada'))).toBe(`authentication/provider-failed: network ${error.message}`)
  })

  it('AUTH-3: the subject and email come from the response, not the request', async () => {
    reply = json(200, { localId: 'uid-ada', email: 'ada@example.com' })

    expect(await provider().authenticate('Ada@Example.com', 'lovelace')).toEqual({ subject: 'uid-ada', email: 'ada@example.com' })
  })

  it('AUTH-3, AUTH-7: a 200 without a usable body is a provider failure', async () => {
    const answers = [
      text(200, '<html>OK</html>'),
      json(200, {}),
      json(200, null),
      json(200, []),
      json(200, { email: 'ada@example.com' }),
      json(200, { localId: 'uid-ada' }),
      json(200, { localId: 7, email: 'ada@example.com' }),
      json(200, { localId: 'uid-ada', email: '' })
    ]
    for (const answer of answers) {
      reply = answer
      expect(await outcome(provider({ apiKey: 'k' }).authenticate('ada@example.com', 'lovelace'))).toBe('authentication/provider-failed: 200 malformed response')
    }
  })

  it('AUTH-4: a second factor is recognised by mfaPendingCredential alone', async () => {
    reply = json(200, { localId: 'uid-ada', email: 'ada@example.com', mfaInfo: [{ mfaEnrollmentId: 'factor', phoneInfo: '+1*******00' }] })
    expect(await provider().authenticate('ada@example.com', 'lovelace')).toEqual({ subject: 'uid-ada', email: 'ada@example.com' })

    reply = json(200, { mfaPendingCredential: 'pending' })
    expect(await provider().authenticate('ada@example.com', 'lovelace')).toEqual({ rejected: 'second-factor-required' })
  })

  it('AUTH-5, AUTH-7: the error code is the message up to " : ", compared exactly', async () => {
    for (const message of ['INVALID_PASSWORD extra', 'INVALID_PASSWORD:extra', 'INVALID_PASSWORDS', 'OPERATION_NOT_ALLOWED', 'INVALID_ID_TOKEN']) {
      reply = toolkitError(400, message)
      expect(await outcome(provider().authenticate('ada@example.com', 'lovelace'))).toBe(`authentication/provider-failed: 400 ${message}`)
    }
  })

  it('AUTH-7: the message is the status and the response\'s message, and nothing else', async () => {
    reply = toolkitError(403, 'PERMISSION_DENIED')
    expect(await outcome(provider().authenticate('ada@example.com', 'lovelace'))).toBe('authentication/provider-failed: 403 PERMISSION_DENIED')

    reply = text(502, '<html>Bad gateway</html>')
    expect(await outcome(provider().authenticate('ada@example.com', 'lovelace'))).toBe('authentication/provider-failed: 502 ')
  })

  it('AUTH-8: no property of the result holds a token, and nothing is written anywhere', async () => {
    const consoleFunctions = Object.keys(console).filter(key => typeof (console as unknown as Record<string, unknown>)[key] === 'function')
    const written = [
      ...consoleFunctions.map(key => vi.spyOn(console as unknown as Record<string, () => void>, key).mockImplementation(() => {})),
      vi.spyOn(process.stdout, 'write'),
      vi.spyOn(process.stderr, 'write')
    ]

    const result = await provider().authenticate('ada@example.com', 'lovelace')
    const calls = written.map(spy => spy.mock.calls.length)
    for (const spy of written) spy.mockRestore()

    expect(calls).toEqual(written.map(() => 0))
    expect(heldValues(result).filter(value => /id-token|refresh-token/.test(value))).toEqual([])
  })

  it('AUTH-2, AUTH-10: a call that times out is not sent again', async () => {
    const error = timeoutError()
    reply = async () => { throw error }
    const calls = [
      async () => await provider().authenticate('ada@example.com', 'lovelace'),
      async () => await provider().getIdentity('uid-ada')
    ]
    for (const call of calls) {
      sent = []
      expect(await outcome(call())).toBe(`authentication/provider-failed: network ${error.message}`)
      expect(sent).toHaveLength(1)
    }
  })

  it('AUTH-7: the message is the error\'s own, without its cause', async () => {
    reply = async () => { throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }) }

    expect(await outcome(provider().authenticate('ada@example.com', 'lovelace'))).toBe('authentication/provider-failed: network fetch failed')
  })

  it('AUTH-7: a provider failure keeps the whole response message', async () => {
    reply = toolkitError(400, 'OPERATION_NOT_ALLOWED : Password sign-in is disabled')

    expect(await outcome(provider().authenticate('ada@example.com', 'lovelace'))).toBe('authentication/provider-failed: 400 OPERATION_NOT_ALLOWED : Password sign-in is disabled')
  })

  it('AUTH-3, AUTH-7: an empty localId or a non-string email is malformed', async () => {
    for (const answer of [json(200, { localId: '', email: 'ada@example.com' }), json(200, { localId: 'uid-ada', email: 7 })]) {
      reply = answer
      expect(await outcome(provider().authenticate('ada@example.com', 'lovelace'))).toBe('authentication/provider-failed: 200 malformed response')
    }
  })

  it('AUTH-3: the email is the response\'s, as it is', async () => {
    reply = json(200, { localId: 'uid-ada', email: 'Ada.Lovelace@Example.org' })

    expect(await provider().authenticate('ada@example.com', 'lovelace')).toEqual({ subject: 'uid-ada', email: 'Ada.Lovelace@Example.org' })
  })

  it('AUTH-4: a null mfaPendingCredential still requires the second factor', async () => {
    reply = json(200, { localId: 'uid-ada', email: 'ada@example.com', mfaPendingCredential: null })

    expect(await provider().authenticate('ada@example.com', 'lovelace')).toEqual({ rejected: 'second-factor-required' })
  })

  it('AUTH-2, AUTH-7: an ADC token that resolves empty is a provider failure, and nothing is sent', async () => {
    for (const token of [null, undefined, '']) {
      auth.token = Promise.resolve(token as never)
      expect(await outcome(provider().authenticate('ada@example.com', 'lovelace'))).toBe('authentication/provider-failed: network no access token')
    }
    expect(sent).toHaveLength(0)
  })
})

describe('the provider', () => {
  it('AUTH-9: offers no management capability', () => {
    expect(Object.keys(provider()).sort()).toEqual(['authenticate', 'getIdentity'])
  })

  it('AUTH-9: management is not reachable on the instance', () => {
    expect('management' in provider()).toBe(false)
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

  it('AUTH-10, AUTH-7: a 200 without a usable body is a provider failure', async () => {
    const malformed = [
      text(200, '<html>OK</html>'),
      json(200, null),
      json(200, []),
      json(200, { users: {} }),
      json(200, { users: [{ email: 'ada@example.com' }] }),
      json(200, { users: [{ localId: '', email: 'ada@example.com' }] })
    ]
    for (const answer of malformed) {
      reply = answer
      expect(await outcome(provider().getIdentity('uid-ada'))).toBe('authentication/provider-failed: 200 malformed response')
    }
    for (const answer of [json(200, {}), json(200, { users: [] })]) {
      reply = answer
      expect(await outcome(provider().getIdentity('uid-ada'))).toEqual({ resolved: null })
    }
  })

  it('AUTH-10, AUTH-7: a failed lookup never returns null', async () => {
    const cases: Array<[() => void, string]> = [
      [() => { reply = toolkitError(400, 'INVALID_ID_TOKEN') }, 'authentication/provider-failed: 400 INVALID_ID_TOKEN'],
      [() => { reply = toolkitError(404, 'NOT_FOUND') }, 'authentication/provider-failed: 404 NOT_FOUND'],
      [() => { reply = async () => { throw new TypeError('fetch failed') } }, 'authentication/provider-failed: network fetch failed'],
      [() => { auth.token = new Error('Could not load the default credentials') }, 'authentication/provider-failed: network Could not load the default credentials']
    ]
    for (const [arrange, message] of cases) {
      sent = []
      arrange()
      expect(await outcome(provider().getIdentity('uid-ada'))).toBe(message)
      expect(sent.length).toBeLessThanOrEqual(1)
    }
  })

  it('AUTH-10, AUTH-7: a 5xx lookup is a provider failure with its status, sent once', async () => {
    reply = toolkitError(503, 'UNAVAILABLE')

    expect(await outcome(provider().getIdentity('uid-ada'))).toBe('authentication/provider-failed: 503 UNAVAILABLE')
    expect(sent).toHaveLength(1)
  })

  it('AUTH-10: the lookup has the 10-second limit and the JSON content type', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    reply = json(200, { users: [] })
    await provider().getIdentity('uid-ada')

    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(new Headers(sent[0].init.headers).get('content-type')).toBe('application/json')
  })

  it('AUTH-10, AUTH-7: a null users, a null entry, or a disabled entry without localId is malformed', async () => {
    for (const answer of [json(200, { users: null }), json(200, { users: [null] }), json(200, { users: [{ disabled: true, email: 'ada@example.com' }] })]) {
      reply = answer
      expect(await outcome(provider().getIdentity('uid-ada'))).toBe('authentication/provider-failed: 200 malformed response')
    }
  })
})

describe('the authentication contract', () => {
  const failures: Array<[string, () => void]> = [
    ['a network error', () => { reply = async () => { throw new TypeError('fetch failed') } }],
    ['a timeout', () => { reply = async () => { throw timeoutError() } }],
    ['a 5xx', () => { reply = toolkitError(503, 'UNAVAILABLE') }],
    ['a refusal', () => { reply = toolkitError(403, 'PERMISSION_DENIED') }],
    ['a misconfiguration', () => { reply = toolkitError(400, 'CONFIGURATION_NOT_FOUND') }],
    ['a malformed answer', () => { reply = text(200, '<html>OK</html>') }],
    ['an ADC token that cannot be obtained', () => { auth.token = new Error('Could not load the default credentials') }]
  ]

  const failureOf = async (promise: Promise<unknown>): Promise<unknown> =>
    await promise.then(value => ({ resolved: value }), (error: unknown) => error)

  it('AUTHN-3: authenticate throws an Error starting with authentication/ when its service fails, never a Rejection', async () => {
    for (const [name, arrange] of failures) {
      auth.token = 'adc-token'
      arrange()
      const failure = await failureOf(provider().authenticate('ada@example.com', 'lovelace'))
      expect(failure, name).toBeInstanceOf(Error)
      expect((failure as Error).message, name).toMatch(/^authentication\//)
    }
  })

  it('AUTHN-3: getIdentity throws an Error starting with authentication/ when its service fails, never null', async () => {
    for (const [name, arrange] of failures) {
      auth.token = 'adc-token'
      arrange()
      const failure = await failureOf(provider().getIdentity('uid-ada'))
      expect(failure, name).toBeInstanceOf(Error)
      expect((failure as Error).message, name).toMatch(/^authentication\//)
    }
  })
})

describe('the cases GS13 found untested', () => {
  const statuses = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index)

  it('AUTH-10, AUTH-7: any non-200 lookup status throws and is sent once', async () => {
    for (const status of statuses(400, 599)) {
      sent = []
      reply = toolkitError(status, 'FAILURE')
      expect(await outcome(provider().getIdentity('uid-ada'))).toBe(`authentication/provider-failed: ${status} FAILURE`)
      expect(sent).toHaveLength(1)
    }
  })

  it('AUTH-2, AUTH-7: any sign-in status other than the mapped ones is sent once', async () => {
    const answers: Array<[number, string]> = [[400, 'OPERATION_NOT_ALLOWED'], ...statuses(401, 599).map((status): [number, string] => [status, 'FAILURE'])]
    for (const [status, message] of answers) {
      sent = []
      reply = toolkitError(status, message)
      expect(await outcome(provider({ apiKey: 'k' }).authenticate('ada@example.com', 'lovelace'))).toBe(`authentication/provider-failed: ${status} ${message}`)
      expect(sent).toHaveLength(1)
    }
  })

  it('AUTH-2, AUTH-10: the tenant is sent on both calls, with and without an API key', async () => {
    for (const apiKey of ['api-key', undefined]) {
      sent = []
      const tenantProvider = provider(apiKey === undefined ? { tenantId: 'cms-tenant' } : { tenantId: 'cms-tenant', apiKey })
      reply = json(200, { localId: 'uid-ada', email: 'ada@example.com', idToken: 'id-token', refreshToken: 'refresh-token' })
      await tenantProvider.authenticate('ada@example.com', 'lovelace')
      reply = json(200, { users: [{ localId: 'uid-ada', email: 'ada@example.com' }] })
      await tenantProvider.getIdentity('uid-ada')

      expect(sent).toHaveLength(2)
      expect(body(0).tenantId).toBe('cms-tenant')
      expect(body(1).tenantId).toBe('cms-tenant')
    }
  })

  it('AUTH-2: the password is sent exactly as given', async () => {
    await provider().authenticate('ada@example.com', '  pass word\t')

    expect(body().password).toBe('  pass word\t')
  })

  it('AUTH-6, AUTH-7: only a 400 with TOO_MANY_ATTEMPTS_TRY_LATER is throttled', async () => {
    const cases: Array<[() => Promise<Response>, string]> = [
      [toolkitError(429, 'RESOURCE_EXHAUSTED'), 'authentication/provider-failed: 429 RESOURCE_EXHAUSTED'],
      [toolkitError(503, 'TOO_MANY_ATTEMPTS_TRY_LATER'), 'authentication/provider-failed: 503 TOO_MANY_ATTEMPTS_TRY_LATER']
    ]
    for (const [answer, message] of cases) {
      reply = answer
      expect(await outcome(provider().authenticate('ada@example.com', 'lovelace'))).toBe(message)
    }
  })
})
