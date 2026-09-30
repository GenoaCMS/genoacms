import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import type { Adapter } from '@genoacms/contracts/secrets'
import runtime from '../../src/secrets/runtime.js'
import { enabled, projectId, secretKey, GRPC_NOT_FOUND } from './gcp.js'

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60
const ONE_DAY_MS = 24 * 60 * 60 * 1000
// GF27
const PROPAGATION_MS = 30_000

const createdKeys: string[] = []
let client: SecretManagerServiceClient
let secrets: Adapter

function key (name: string): string {
  const created = secretKey(name)
  createdKeys.push(created)
  return created
}

const outcome = async (read: Promise<unknown>): Promise<'resolved' | 'rejected'> => await read.then(() => 'resolved', () => 'rejected')

const secretName = (created: string): string => `projects/${projectId}/secrets/${created}`

async function versions (created: string) {
  const [list] = await client.listSecretVersions({ parent: secretName(created) })
  return list
}

async function expectRecoveryWindow (created: string): Promise<void> {
  const [secret] = await client.getSecret({ name: secretName(created) })
  expect(secret.replication?.automatic).toBeDefined()
  expect(Number(secret.versionDestroyTtl?.seconds)).toBe(SEVEN_DAYS_SECONDS)
}

async function deleteIfPresent (created: string): Promise<void> {
  try {
    await client.deleteSecret({ name: secretName(created) })
  } catch (error) {
    if ((error as { code?: number }).code !== GRPC_NOT_FOUND) throw error
  }
}

describe.runIf(enabled)('Secret Manager, against the real service', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    client = new SecretManagerServiceClient({ projectId })
    secrets = await runtime.create({ projectId }, { name: 'contract', resources: [] })
  }, 60_000)

  afterAll(async () => {
    for (const created of createdKeys) await deleteIfPresent(created)
  }, 120_000)

  it('SEC-3, SEC-4: reads a secret that never existed as undefined', async () => {
    expect(await secrets.getSecret(key('NEVER'))).toBeUndefined()
  })

  it('SEC-3: reads back the latest value as UTF-8', async () => {
    const utf8 = key('UTF8')
    await secrets.setSecret(utf8, 'ž€ genoacms')
    expect(await secrets.getSecret(utf8)).toBe('ž€ genoacms')
  })

  it('SEC-4: propagates the failure to read a disabled latest version', async () => {
    const disabled = key('DISABLED')
    await secrets.setSecret(disabled, 'value')
    const [only] = await versions(disabled)
    await client.disableSecretVersion({ name: only.name })
    await expect.poll(() => outcome(secrets.getSecret(disabled)), { timeout: PROPAGATION_MS, interval: 1000 }).toBe('rejected')
  })

  it('SEC-5, SEC-7: creates a missing secret when overwriting, with automatic replication and a seven-day destroy TTL', async () => {
    const created = key('CREATED')
    expect(await secrets.setSecret(created, 'a')).toBe(true)
    expect(await secrets.getSecret(created)).toBe('a')
    await expectRecoveryWindow(created)
  })

  it('SEC-5: overwrites an existing secret', async () => {
    const overwritten = key('OVERWRITTEN')
    await secrets.setSecret(overwritten, 'a')
    await secrets.setSecret(overwritten, 'b')
    expect(await secrets.getSecret(overwritten)).toBe('b')
  })

  it('SEC-6, SEC-7: claims an absent key once, and a second claim keeps the first value', async () => {
    const claimed = key('CLAIMED')
    expect(await secrets.setSecretIfAbsent(claimed, 'a')).toBe(true)
    await expectRecoveryWindow(claimed)
    expect(await secrets.setSecretIfAbsent(claimed, 'b')).toBe(false)
    expect(await secrets.getSecret(claimed)).toBe('a')
  })

  it('SEC-8: leaves only the newest version enabled after overwrites', async () => {
    const rotated = key('ROTATED')
    for (const value of ['1', '2', '3']) await secrets.setSecret(rotated, value)
    const all = await versions(rotated)
    const number = (name: string | null | undefined): number => Number(name?.split('/').at(-1))
    const enabled = all.filter(version => version.state === 'ENABLED')
    expect(enabled.map(version => number(version.name))).toEqual([Math.max(...all.map(version => number(version.name)))])
    const superseded = all.filter(version => version.state !== 'ENABLED')
    expect(superseded).toHaveLength(2)
    for (const version of superseded) {
      expect(version.state).toBe('DISABLED')
      const destroyAt = Number(version.scheduledDestroyTime?.seconds) * 1000
      expect(Math.abs(destroyAt - (Date.now() + SEVEN_DAYS_SECONDS * 1000))).toBeLessThan(ONE_DAY_MS)
    }
  })

  it('SEC-11: deletes a secret, and reports false for one that does not exist', async () => {
    const deleted = key('DELETED')
    await secrets.setSecret(deleted, 'a')
    expect(await secrets.deleteSecret(deleted)).toBe(true)
    expect(await secrets.getSecret(deleted)).toBeUndefined()
    expect(await secrets.deleteSecret(deleted)).toBe(false)
  })
})
