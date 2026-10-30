import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { declareAgent, clearDeclarations, captureConsole } from '#lib/script/testing/host.js'
import { callEndpoint } from '#lib/script/testing/mcp.js'

vi.mock('#lib/script/host.server.js', async (importOriginal) => {
  const { withDeclarations } = await import('#lib/script/testing/host.js')
  const { host } = await importOriginal<typeof import('#lib/script/host.server.js')>()
  return { host: withDeclarations(host) }
})
vi.mock('#lib/script/storage/providers.server.js', async () => (await import('#lib/script/testing/memoryStorage.js')).memoryProviders)
vi.mock('#lib/script/signing/keyResolution.server.js', async () => (await import('#lib/script/testing/signingKeys.js')).testKeyResolution)
vi.mock('#lib/script/securityPolicy/policy.server.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('#lib/script/securityPolicy/policy.server.js')>(),
  loadSecurityPolicy: async () => (await import('#lib/script/testing/signingKeys.js')).testSecurityPolicy
}))

const { load: signInPage } = await import('../../../routes/login/+page.server')

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }

let lines: string[]

beforeEach(() => {
  vi.resetModules()
  memory.clear()
  clearDeclarations()
  lines = captureConsole()
})

afterEach(() => { vi.restoreAllMocks() })

describe('declared agents', () => {
  it('AGT-1: a declared token shorter than 43 characters closes the agent endpoint', async () => {
    const short = 'k'.repeat(42)
    declareAgent('agent:site-builder', short)

    expect((await callEndpoint({ token: short, body: initialize })).status).toBe(503)
    expect(lines.some(line => line.includes('authentication/agent-token-too-short:'))).toBe(true)
    expect((await callEndpoint({ token: short, body: initialize })).status).toBe(503)
    await expect((signInPage as (event: unknown) => Promise<unknown>)({ locals: {} })).resolves.toBeUndefined()
  })

  it('AGT-1: two agents sharing a token are refused', async () => {
    const shared = 's'.repeat(43)
    declareAgent('agent:first', shared)
    declareAgent('agent:second', shared)

    expect((await callEndpoint({ token: shared, body: initialize })).status).toBe(503)
    expect(lines.some(line => line.includes('authentication/agent-token-shared:'))).toBe(true)
  })
})
