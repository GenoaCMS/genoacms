import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { memory } from '$lib/script/testing/memoryStorage'
import { declared, declareAgent, clearDeclarations, captureConsole } from '$lib/script/testing/host'
import { callEndpoint } from '$lib/script/testing/mcp'

vi.mock('$lib/script/host.server', async (importOriginal) => {
  const { withDeclarations } = await import('$lib/script/testing/host')
  const { host } = await importOriginal<typeof import('$lib/script/host.server')>()
  return { host: withDeclarations(host) }
})
vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)
vi.mock('$lib/script/signing/keyResolution.server', async () => (await import('$lib/script/testing/signingKeys')).testKeyResolution)
vi.mock('$lib/script/securityPolicy/policy.server', async (importOriginal) => ({
  ...await importOriginal<typeof import('$lib/script/securityPolicy/policy.server')>(),
  loadSecurityPolicy: async () => (await import('$lib/script/testing/signingKeys')).testSecurityPolicy
}))

const TOKEN = 'declared-token-of-the-site-builder-0123456789'
const WRONG = 'gat_this-token-was-never-issued-to-any-agent-00'

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }
const listTools = { jsonrpc: '2.0', id: 2, method: 'tools/list' }
const initialized = { jsonrpc: '2.0', method: 'notifications/initialized' }

async function expectUnauthorized (response: Response): Promise<void> {
  expect(response.status).toBe(401)
  expect(response.headers.get('www-authenticate')).toBe('Bearer realm="genoacms"')
  const body = await response.text()
  expect(body.includes('jsonrpc')).toBe(false)
}

beforeEach(() => {
  memory.clear()
  clearDeclarations()
  declared.roles['Page builder'] = [{ permission: 'pages:read', resource: '*' }]
  declareAgent('agent:site-builder', TOKEN, ['Page builder'])
})

afterEach(() => { vi.restoreAllMocks() })

describe('the MCP endpoint', () => {
  it('MCP-2: no header, a wrong token and a cookie alone each answer 401 with WWW-Authenticate', async () => {
    await expectUnauthorized(await callEndpoint({ body: initialize }))
    await expectUnauthorized(await callEndpoint({ token: WRONG, body: initialize }))
    await expectUnauthorized(await callEndpoint({ cookie: `__session=${TOKEN}`, body: initialize }))
    await expectUnauthorized(await callEndpoint({ authorization: `Basic ${TOKEN}`, body: initialize }))

    expect((await callEndpoint({ token: TOKEN, body: initialize })).status).toBe(200)
  })

  it('MCP-1: GET and DELETE answer 405; a notification 202; never Mcp-Session-Id', async () => {
    const responses: Response[] = []
    const call = async (...args: Parameters<typeof callEndpoint>): Promise<Response> => {
      const response = await callEndpoint(...args)
      responses.push(response)
      return response
    }

    expect((await call({ method: 'GET', token: TOKEN })).status).toBe(405)
    expect((await call({ method: 'DELETE', token: TOKEN })).status).toBe(405)

    const notification = await call({ token: TOKEN, body: initialized })
    expect(notification.status).toBe(202)
    expect(await notification.text()).toBe('')

    const answered = await call({ token: TOKEN, body: initialize })
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await answered.json()).toMatchObject({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'genoacms' } } })

    for (const response of responses) expect(response.headers.has('mcp-session-id')).toBe(false)
  })

  it('MCP-2: no log line holds the token', async () => {
    const lines = captureConsole()

    await expectUnauthorized(await callEndpoint({ token: WRONG, body: initialize }))
    const admitted = await callEndpoint({ token: TOKEN, body: listTools })
    expect(admitted.status).toBe(200)
    await callEndpoint({ token: TOKEN, body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_page', arguments: { name: 'absent' } } } })

    for (const line of lines) {
      expect(line).not.toContain(TOKEN)
      expect(line).not.toContain(WRONG)
    }
  })
})
