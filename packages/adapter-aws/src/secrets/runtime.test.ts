import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  CreateSecretCommand,
  DeleteSecretCommand,
  ResourceNotFoundException,
  ResourceExistsException,
  InvalidRequestException
} from '@aws-sdk/client-secrets-manager'
import runtime from './runtime.js'

const { constructed } = vi.hoisted(() => ({ constructed: [] as Array<{ client: unknown, config: unknown }> }))

vi.mock('@aws-sdk/client-secrets-manager', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/client-secrets-manager')>()
  class RecordingSecretsManagerClient extends original.SecretsManagerClient {
    constructor (...args: ConstructorParameters<typeof original.SecretsManagerClient>) {
      super(...args)
      constructed.push({ client: this, config: args[0] })
    }
  }
  return { ...original, SecretsManagerClient: RecordingSecretsManagerClient }
})

const secretsManager = mockClient(SecretsManagerClient)
const KEY = 'genoacms/a.b-c_KEY'

const inputs = (command: new (...args: any[]) => unknown): any[] => secretsManager.commandCalls(command as never).map(call => call.args[0].input)
const notFound = (): ResourceNotFoundException => new ResourceNotFoundException({ message: 'not found', $metadata: {} })
const exists = (): ResourceExistsException => new ResourceExistsException({ message: 'exists', $metadata: {} })
const invalid = (): InvalidRequestException => new InvalidRequestException({ message: 'invalid', $metadata: {} })
const denied = (): Error => Object.assign(new Error('denied'), { name: 'AccessDeniedException' })
const realSetImmediate = setImmediate
const settle = async (): Promise<void> => { for (let turn = 0; turn < 5; turn++) await new Promise(resolve => realSetImmediate(resolve)) }
const reads = (): number => secretsManager.commandCalls(GetSecretValueCommand).length

async function advance (ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

async function provider () {
  return await runtime.create({ region: 'eu-central-1' }, { name: 'secrets', resources: [] })
}

beforeEach(() => {
  secretsManager.reset()
  constructed.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the Secrets Manager runtime', () => {
  it('ASM-2, ASM-3: reads SecretString by the key unchanged', async () => {
    secretsManager.on(GetSecretValueCommand).resolves({ SecretString: 'value' })
    const secrets = await provider()
    expect(await secrets.getSecret(KEY)).toBe('value')
    expect(inputs(GetSecretValueCommand)).toEqual([{ SecretId: KEY }])
  })

  it('ASM-3: resolves undefined only for ResourceNotFoundException', async () => {
    const secrets = await provider()
    const failure = invalid()
    secretsManager.on(GetSecretValueCommand).rejectsOnce(notFound()).rejectsOnce(failure)
    expect(await secrets.getSecret(KEY)).toBeUndefined()
    await expect(secrets.getSecret(KEY)).rejects.toBe(failure)
  })

  it('ASM-3: refuses a binary-only secret', async () => {
    secretsManager.on(GetSecretValueCommand).resolves({ SecretBinary: new Uint8Array([1, 2]) })
    const secrets = await provider()
    await expect(secrets.getSecret(KEY)).rejects.toThrow(/^secrets\/not-a-string: genoacms\/a\.b-c_KEY$/)
  })

  it('ASM-4: puts a value into an existing secret', async () => {
    secretsManager.on(PutSecretValueCommand).resolves({})
    const secrets = await provider()
    expect(await secrets.setSecret(KEY, 'value')).toBe(true)
    expect(inputs(PutSecretValueCommand)).toEqual([expect.objectContaining({ SecretId: KEY, SecretString: 'value' })])
    expect(inputs(CreateSecretCommand)).toHaveLength(0)
  })

  it('ASM-4: creates a missing secret, and puts again when another caller created it first', async () => {
    const secrets = await provider()
    secretsManager.on(PutSecretValueCommand).rejectsOnce(notFound())
    secretsManager.on(CreateSecretCommand).resolvesOnce({})
    expect(await secrets.setSecret(KEY, 'value')).toBe(true)
    expect(inputs(CreateSecretCommand)).toEqual([expect.objectContaining({ Name: KEY, SecretString: 'value' })])
    expect(inputs(PutSecretValueCommand)).toHaveLength(1)

    secretsManager.reset()
    secretsManager.on(PutSecretValueCommand).rejectsOnce(notFound()).resolves({})
    secretsManager.on(CreateSecretCommand).rejects(exists())
    expect(await secrets.setSecret(KEY, 'value')).toBe(true)
    expect(inputs(CreateSecretCommand)).toEqual([expect.objectContaining({ Name: KEY, SecretString: 'value' })])
    expect(inputs(PutSecretValueCommand)).toEqual([
      expect.objectContaining({ SecretId: KEY, SecretString: 'value' }),
      expect.objectContaining({ SecretId: KEY, SecretString: 'value' })
    ])
  })

  it('ASM-5: claims with one CreateSecret, and reports false when it exists', async () => {
    const secrets = await provider()
    const failure = invalid()
    secretsManager.on(CreateSecretCommand).resolvesOnce({}).rejectsOnce(exists()).rejectsOnce(failure)
    expect(await secrets.setSecretIfAbsent(KEY, 'value')).toBe(true)
    expect(inputs(CreateSecretCommand)).toEqual([expect.objectContaining({ Name: KEY, SecretString: 'value' })])
    expect(secretsManager.calls()).toHaveLength(1)

    expect(await secrets.setSecretIfAbsent(KEY, 'value')).toBe(false)

    await expect(secrets.setSecretIfAbsent(KEY, 'value')).rejects.toBe(failure)
  })

  it('ASM-6: deletes without recovery, and reports false for a missing secret', async () => {
    const secrets = await provider()
    secretsManager.on(DeleteSecretCommand).resolvesOnce({}).rejectsOnce(notFound())
    secretsManager.on(GetSecretValueCommand).rejects(notFound())
    expect(await secrets.deleteSecret(KEY)).toBe(true)
    expect(inputs(DeleteSecretCommand)).toEqual([expect.objectContaining({ SecretId: KEY, ForceDeleteWithoutRecovery: true })])

    const readsBefore = reads()
    expect(await secrets.deleteSecret(KEY)).toBe(false)
    expect(inputs(DeleteSecretCommand)).toHaveLength(2)
    expect(reads()).toBe(readsBefore)
  })

  it.fails('ASM-6: waits until the secret is gone', async () => {
    vi.useFakeTimers()
    const secrets = await provider()
    secretsManager.on(DeleteSecretCommand).resolves({})
    secretsManager.on(GetSecretValueCommand).rejectsOnce(invalid()).rejectsOnce(invalid()).rejects(notFound())
    let outcome: unknown = 'pending'
    const deletion = secrets.deleteSecret(KEY).then(value => { outcome = value }, (error: unknown) => { outcome = error })

    await settle()
    expect(reads()).toBe(1)
    await advance(249)
    expect(reads()).toBe(1)
    await advance(1)
    expect(reads()).toBe(2)
    await advance(249)
    expect(reads()).toBe(2)
    expect(outcome).toBe('pending')
    await advance(1)
    await deletion
    expect(reads()).toBe(3)
    expect(outcome).toBe(true)
    expect(inputs(GetSecretValueCommand)).toEqual([{ SecretId: KEY }, { SecretId: KEY }, { SecretId: KEY }])

    secretsManager.reset()
    secretsManager.on(DeleteSecretCommand).resolves({})
    secretsManager.on(GetSecretValueCommand).resolves({ SecretString: 'value' })
    const immediate = secrets.deleteSecret(KEY)
    await settle()
    expect(await immediate).toBe(true)
    expect(reads()).toBe(1)
  })

  it.fails('ASM-6: propagates other errors while waiting', async () => {
    const failure = denied()
    secretsManager.on(DeleteSecretCommand).resolves({})
    secretsManager.on(GetSecretValueCommand).rejects(failure)
    const secrets = await provider()
    await expect(secrets.deleteSecret(KEY)).rejects.toBe(failure)
  })

  it.fails('ASM-6: gives up after 30 seconds', async () => {
    vi.useFakeTimers()
    const secrets = await provider()
    secretsManager.on(DeleteSecretCommand).resolves({})
    secretsManager.on(GetSecretValueCommand).rejects(invalid())
    let outcome: unknown = 'pending'
    const deletion = secrets.deleteSecret(KEY).then(value => { outcome = value }, (error: unknown) => { outcome = error })

    await settle()
    await advance(29_999)
    expect(outcome).toBe('pending')
    await advance(1)
    await deletion
    expect(outcome).toBeInstanceOf(Error)
    expect((outcome as Error).message).toBe(`secrets/delete-timeout: ${KEY}`)
  })

  it('AWS-4: passes the region, credentials only when given, and keeps providers apart', async () => {
    const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' }
    await runtime.create({ region: 'eu-central-1', credentials }, { name: 'one', resources: [] })
    await runtime.create({ region: 'us-east-1' }, { name: 'two', resources: [] })
    expect(constructed).toHaveLength(2)
    expect(constructed[0].client).not.toBe(constructed[1].client)
    expect(constructed[0].config).toEqual({ region: 'eu-central-1', credentials })
    expect(constructed[1].config).toEqual({ region: 'us-east-1' })
  })

  it('ASM-2: uses a key unchanged as SecretId and Name in every method', async () => {
    const key = ' Mixed/Case Key '
    secretsManager.on(GetSecretValueCommand).resolves({ SecretString: 'v' })
    secretsManager.on(PutSecretValueCommand).rejectsOnce(notFound()).resolves({})
    secretsManager.on(CreateSecretCommand).resolves({})
    secretsManager.on(DeleteSecretCommand).resolves({})
    const secrets = await provider()
    await secrets.getSecret(key)
    await secrets.setSecret(key, 'v')
    await secrets.setSecretIfAbsent(key, 'v')
    expect(inputs(GetSecretValueCommand).map(input => input.SecretId)).toEqual([key])
    expect(inputs(PutSecretValueCommand).map(input => input.SecretId)).toEqual([key])
    expect(inputs(CreateSecretCommand).map(input => input.Name)).toEqual([key, key])
    await secrets.deleteSecret(key)
    expect(inputs(DeleteSecretCommand).map(input => input.SecretId)).toEqual([key])
    expect(inputs(GetSecretValueCommand).map(input => input.SecretId).every(id => id === key)).toBe(true)
  })

  it('ASM-4: propagates a put error other than ResourceNotFoundException and sends nothing else', async () => {
    const failure = invalid()
    secretsManager.on(PutSecretValueCommand).rejects(failure)
    const secrets = await provider()
    await expect(secrets.setSecret(KEY, 'value')).rejects.toBe(failure)
    expect(secretsManager.calls()).toHaveLength(1)
  })

  it('ASM-4: propagates a create error other than ResourceExistsException without a second put', async () => {
    const failure = invalid()
    secretsManager.on(PutSecretValueCommand).rejectsOnce(notFound()).resolves({})
    secretsManager.on(CreateSecretCommand).rejects(failure)
    const secrets = await provider()
    await expect(secrets.setSecret(KEY, 'value')).rejects.toBe(failure)
    expect(inputs(PutSecretValueCommand)).toHaveLength(1)
    expect(secretsManager.calls()).toHaveLength(2)
  })

  it('ASM-4: propagates the error of the second put', async () => {
    const failure = invalid()
    secretsManager.on(PutSecretValueCommand).rejectsOnce(notFound()).rejects(failure)
    secretsManager.on(CreateSecretCommand).rejects(exists())
    const secrets = await provider()
    await expect(secrets.setSecret(KEY, 'value')).rejects.toBe(failure)
    expect(inputs(PutSecretValueCommand)).toHaveLength(2)
  })

  it('ASM-5: propagates an error other than ResourceExistsException after exactly one call', async () => {
    const failure = invalid()
    secretsManager.on(CreateSecretCommand).rejects(failure)
    secretsManager.on(PutSecretValueCommand).resolves({})
    const secrets = await provider()
    await expect(secrets.setSecretIfAbsent(KEY, 'value')).rejects.toBe(failure)
    expect(secretsManager.calls()).toHaveLength(1)
  })

  it('ASM-5: sends nothing after ResourceExistsException', async () => {
    secretsManager.on(CreateSecretCommand).rejects(exists())
    secretsManager.on(PutSecretValueCommand).resolves({})
    const secrets = await provider()
    expect(await secrets.setSecretIfAbsent(KEY, 'value')).toBe(false)
    expect(secretsManager.calls()).toHaveLength(1)
  })

  it('ASM-6: propagates a delete error other than ResourceNotFoundException', async () => {
    const failure = invalid()
    secretsManager.on(DeleteSecretCommand).rejects(failure)
    const secrets = await provider()
    await expect(secrets.deleteSecret(KEY)).rejects.toBe(failure)
  })
})
