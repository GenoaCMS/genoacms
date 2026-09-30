import { describe, it, expect, beforeEach } from 'vitest'
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

const secretsManager = mockClient(SecretsManagerClient)
const KEY = 'genoacms/a.b-c_KEY'

const inputs = (command: new (...args: any[]) => unknown): any[] => secretsManager.commandCalls(command as never).map(call => call.args[0].input)
const notFound = (): ResourceNotFoundException => new ResourceNotFoundException({ message: 'not found', $metadata: {} })
const exists = (): ResourceExistsException => new ResourceExistsException({ message: 'exists', $metadata: {} })
const invalid = (): InvalidRequestException => new InvalidRequestException({ message: 'invalid', $metadata: {} })

async function provider () {
  return await runtime.create({ region: 'eu-central-1' }, { name: 'secrets', resources: [] })
}

beforeEach(() => { secretsManager.reset() })

describe('the Secrets Manager runtime', () => {
  it('ASM-2, ASM-3: reads SecretString by the key unchanged', async () => {
    secretsManager.on(GetSecretValueCommand).resolves({ SecretString: 'value' })
    const secrets = await provider()
    expect(await secrets.getSecret(KEY)).toBe('value')
    expect(inputs(GetSecretValueCommand)).toEqual([expect.objectContaining({ SecretId: KEY })])
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
    expect(await secrets.deleteSecret(KEY)).toBe(true)
    expect(inputs(DeleteSecretCommand)).toEqual([expect.objectContaining({ SecretId: KEY, ForceDeleteWithoutRecovery: true })])

    expect(await secrets.deleteSecret(KEY)).toBe(false)
  })
})
