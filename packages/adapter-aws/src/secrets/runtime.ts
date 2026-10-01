import type { Adapter } from '@genoacms/contracts/secrets'
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient
} from '@aws-sdk/client-secrets-manager'
import { defineRuntime } from '@genoacms/contracts'
import { clientConfig, isAwsError, type AwsCredentials } from '../shared.js'
import type { AwsSecretsOptions } from './descriptor.js'

const NOT_FOUND = 'ResourceNotFoundException'
const EXISTS = 'ResourceExistsException'
const MARKED_FOR_DELETION = 'InvalidRequestException'
const DELETE_POLL_MS = 250
const DELETE_TIMEOUT_MS = 30_000

const sleep = async (ms: number): Promise<void> => { await new Promise(resolve => setTimeout(resolve, ms)) }

export default defineRuntime<AwsSecretsOptions, Adapter>({
  create ({ region, credentials }): Adapter {
    const client = new SecretsManagerClient(clientConfig(region, credentials as AwsCredentials | undefined))

    const put = async (key: string, value: string): Promise<void> => {
      await client.send(new PutSecretValueCommand({ SecretId: key, SecretString: value }))
    }

    const create = async (key: string, value: string): Promise<void> => {
      await client.send(new CreateSecretCommand({ Name: key, SecretString: value }))
    }

    // ASM-2, ASM-3
    const getSecret: Adapter['getSecret'] = async (key) => {
      try {
        const response = await client.send(new GetSecretValueCommand({ SecretId: key }))
        if (response.SecretString === undefined) throw new Error(`secrets/not-a-string: ${key}`)
        return response.SecretString
      } catch (error) {
        if (isAwsError(error, NOT_FOUND)) return undefined
        throw error
      }
    }

    const createOrPut = async (key: string, value: string): Promise<void> => {
      try {
        await create(key, value)
      } catch (error) {
        if (!isAwsError(error, EXISTS)) throw error
        await put(key, value)
      }
    }

    // ASM-4
    const setSecret: Adapter['setSecret'] = async (key, value) => {
      try {
        await put(key, value)
      } catch (error) {
        if (!isAwsError(error, NOT_FOUND)) throw error
        await createOrPut(key, value)
      }
      return true
    }

    // ASM-5
    const setSecretIfAbsent: Adapter['setSecretIfAbsent'] = async (key, value) => {
      try {
        await create(key, value)
        return true
      } catch (error) {
        if (isAwsError(error, EXISTS)) return false
        throw error
      }
    }

    const isGone = async (key: string): Promise<boolean> => {
      try {
        await client.send(new GetSecretValueCommand({ SecretId: key }))
        return true
      } catch (error) {
        if (isAwsError(error, NOT_FOUND)) return true
        if (isAwsError(error, MARKED_FOR_DELETION)) return false
        throw error
      }
    }

    // ASM-6, WD6
    const waitUntilGone = async (key: string): Promise<void> => {
      const deadline = Date.now() + DELETE_TIMEOUT_MS
      while (!await isGone(key)) {
        if (Date.now() >= deadline) throw new Error(`secrets/delete-timeout: ${key}`)
        await sleep(DELETE_POLL_MS)
      }
    }

    // ASM-6
    const deleteSecret: Adapter['deleteSecret'] = async (key) => {
      try {
        await client.send(new DeleteSecretCommand({ SecretId: key, ForceDeleteWithoutRecovery: true }))
      } catch (error) {
        if (isAwsError(error, NOT_FOUND)) return false
        throw error
      }
      await waitUntilGone(key)
      return true
    }

    return { getSecret, setSecret, setSecretIfAbsent, deleteSecret }
  }
})
