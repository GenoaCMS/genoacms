import { describe, it, expect } from 'vitest'
import { importModule } from '$lib/script/testing/requests'

const tokens = async () => await importModule('$lib/script/agents/tokens')

describe('agent tokens', () => {
  it.fails('AGT-3: a new token is gat_ and 43 base64url characters, and its hash is SHA-256 hex', async () => {
    const { generateAgentToken, hashAgentToken, AGENT_TOKEN_MIN_LENGTH } = await tokens()
    const issued = Array.from({ length: 1000 }, () => generateAgentToken() as string)

    expect(new Set(issued).size).toBe(1000)
    for (const token of issued) expect(token).toMatch(/^gat_[A-Za-z0-9_-]{43}$/)
    expect(hashAgentToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(AGENT_TOKEN_MIN_LENGTH).toBe(43)
  })
})
