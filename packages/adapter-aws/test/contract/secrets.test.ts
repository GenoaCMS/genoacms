import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SecretsManagerClient, DeleteSecretCommand } from '@aws-sdk/client-secrets-manager'
import type { Adapter } from '@genoacms/contracts/secrets'
import runtime from '../../src/secrets/runtime.js'
import { enabled, region, secretKey } from './aws.js'

const ONE_MINUTE = 60_000
const RECOVERY_WINDOW_DAYS = 7
const VISIBLE_WITHIN_MS = 30_000
const RETRY_EVERY_MS = 1_000

const createdKeys: string[] = []
let client: SecretsManagerClient
let secrets: Adapter

function key (name: string): string {
  const created = secretKey(name)
  createdKeys.push(created)
  return created
}

// ASM-6, WF27
async function deletesAsAbsentWithin (deleted: string, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  for (;;) {
    if (!await secrets.deleteSecret(deleted)) return true
    if (Date.now() >= deadline) return false
    await new Promise(resolve => setTimeout(resolve, RETRY_EVERY_MS))
  }
}

async function forceDelete (created: string): Promise<void> {
  try {
    await client.send(new DeleteSecretCommand({ SecretId: created, ForceDeleteWithoutRecovery: true }))
  } catch (error) {
    if ((error as { name?: string }).name !== 'ResourceNotFoundException') throw error
  }
}

describe.runIf(enabled)('Secrets Manager, against the real service', { timeout: ONE_MINUTE }, () => {
  beforeAll(async () => {
    client = new SecretsManagerClient({ region })
    secrets = await runtime.create({ region }, { name: 'contract', resources: [] })
  }, ONE_MINUTE)

  afterAll(async () => {
    for (const created of createdKeys) await forceDelete(created)
  }, 2 * ONE_MINUTE)

  it('ASM-2, ASM-3: reads a secret that never existed as undefined', async () => {
    expect(await secrets.getSecret(key('never'))).toBeUndefined()
  })

  it('ASM-4: creates a missing secret when overwriting, and overwrites it', async () => {
    const overwritten = key('overwritten')
    expect(await secrets.setSecret(overwritten, 'first')).toBe(true)
    expect(await secrets.getSecret(overwritten)).toBe('first')
    expect(await secrets.setSecret(overwritten, 'second')).toBe(true)
    expect(await secrets.getSecret(overwritten)).toBe('second')
  })

  it('ASM-5: claims an absent key once, and a second claim keeps the first value', async () => {
    const claimed = key('claimed')
    expect(await secrets.setSecretIfAbsent(claimed, 'first')).toBe(true)
    expect(await secrets.setSecretIfAbsent(claimed, 'second')).toBe(false)
    expect(await secrets.getSecret(claimed)).toBe('first')
  })

  it('ASM-6: deletes a secret at once, and reports false for one that does not exist', { timeout: 2 * ONE_MINUTE }, async () => {
    const deleted = key('deleted')
    await secrets.setSecret(deleted, 'value')
    expect(await secrets.deleteSecret(deleted)).toBe(true)
    expect(await secrets.getSecret(deleted)).toBeUndefined()
    expect(await deletesAsAbsentWithin(deleted, VISIBLE_WITHIN_MS)).toBe(true)
    expect(await secrets.deleteSecret(key('never-existed'))).toBe(false)
  })

  it('ASM-3: reads a secret scheduled for deletion as undefined', async () => {
    const scheduled = key('scheduled')
    await secrets.setSecret(scheduled, 'value')
    await client.send(new DeleteSecretCommand({ SecretId: scheduled, RecoveryWindowInDays: RECOVERY_WINDOW_DAYS }))
    expect(await secrets.getSecret(scheduled)).toBeUndefined()
    await forceDelete(scheduled)
  })
})
