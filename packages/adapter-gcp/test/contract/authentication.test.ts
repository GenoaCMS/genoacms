import { describe, it, expect, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { GoogleAuth } from 'google-auth-library'
import { runAuthenticationConformance } from '@genoacms/conformance'
import type { Adapter } from '@genoacms/contracts/authentication'
import runtime from '../../src/authentication/identity-platform/runtime.js'
import { enabled, projectId, runId } from './gcp.js'

// GU10, GU11
const identityEnabled = enabled && process.env.GENOACMS_TEST_GCP_IDENTITY === '1'

const ADMIN = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`
const ctx = { name: 'contract', resources: [] }

interface Throwaway { email: string, password: string, subject: string }

const admin = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'], projectId })
const created: string[] = []

async function call (method: string, body: object): Promise<Record<string, unknown>> {
  const response = await fetch(`${ADMIN}${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await admin.getAccessToken()}` },
    body: JSON.stringify(body)
  })
  const answer = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(`${method} ${response.status} ${JSON.stringify(answer)}`)
  return answer
}

async function throwaway (name: string, disabled: boolean): Promise<Throwaway> {
  const email = `${name}-${runId}@genoacms-contract.example.com`
  const password = randomBytes(18).toString('base64url')
  const { localId } = await call('', { email, password }) as { localId: string }
  created.push(localId)
  if (disabled) await call(':update', { localId, disableUser: true })
  return { email, password, subject: localId }
}

const fixture = identityEnabled ? { identity: await throwaway('ada', false), disabled: await throwaway('bob', true) } : undefined

describe.skipIf(fixture === undefined)('Identity Platform, against the real service', () => {
  const unused: Throwaway = { email: '', password: '', subject: '' }
  const { identity, disabled } = fixture ?? { identity: unused, disabled: unused }
  const provider = runtime.create({ projectId }, ctx) as Adapter

  afterAll(async () => {
    for (const localId of created) await call(':delete', { localId })
  }, 60_000)

  it('AUTH-2, AUTH-3: signs a user in with the runtime identity', async () => {
    expect(await provider.authenticate(identity.email, identity.password)).toEqual({ subject: identity.subject, email: identity.email })
  })

  it('AUTH-5: a wrong password, an unknown email and a disabled user are rejected for credentials', async () => {
    expect(await provider.authenticate(identity.email, `${identity.password}-wrong`)).toEqual({ rejected: 'credentials' })
    expect(await provider.authenticate(`nobody-${runId}@genoacms-contract.example.com`, identity.password)).toEqual({ rejected: 'credentials' })
    expect(await provider.authenticate(disabled.email, disabled.password)).toEqual({ rejected: 'credentials' })
  })

  it('AUTH-7: an invalid API key is a provider failure, not a rejection', async () => {
    const keyed = runtime.create({ projectId, apiKey: 'genoacms-contract-invalid-key' }, ctx) as Adapter
    await expect(keyed.authenticate(identity.email, identity.password)).rejects.toThrow(/^authentication\/provider-failed: 400 /)
  })

  it('AUTH-10: looks a user up, and finds neither an unknown nor a disabled one', async () => {
    expect(await provider.getIdentity(identity.subject)).toEqual({ subject: identity.subject, email: identity.email })
    expect(await provider.getIdentity(`nobody${runId}`)).toBeNull()
    expect(await provider.getIdentity(disabled.subject)).toBeNull()
  })

  describe('CONF-4: Identity Platform conformance', () => {
    if (fixture !== undefined) runAuthenticationConformance(provider, fixture, { runs: 5 })
  })
})
