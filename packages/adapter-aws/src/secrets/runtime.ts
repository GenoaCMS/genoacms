import type { Adapter } from '@genoacms/contracts/secrets'
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient
} from '@aws-sdk/client-secrets-manager'
import { defineRuntime } from '@genoacms/contracts'
import { clientConfig, isAwsError, type AwsCredentials } from '../shared.js'
import type { AwsSecretsOptions } from './descriptor.js'

const NOT_FOUND = 'ResourceNotFoundException'
const EXISTS = 'ResourceExistsException'
const INVALID_REQUEST = 'InvalidRequestException'

export default defineRuntime<AwsSecretsOptions, Adapter>({
  create ({ region, credentials }): Adapter {
    const client = new SecretsManagerClient(clientConfig(region, credentials as AwsCredentials | undefined))

    const put = async (key: string, value: string): Promise<void> => {
      await client.send(new PutSecretValueCommand({ SecretId: key, SecretString: value }))
    }

    const create = async (key: string, value: string): Promise<void> => {
      await client.send(new CreateSecretCommand({ Name: key, SecretString: value }))
    }

    // WD6
    const isAbsentOrScheduledForDeletion = async (key: string): Promise<boolean> => {
      try {
        const response = await client.send(new DescribeSecretCommand({ SecretId: key }))
        return response.DeletedDate !== undefined
      } catch (error) {
        if (isAwsError(error, NOT_FOUND)) return true
        throw error
      }
    }

    // ASM-2, ASM-3
    const getSecret: Adapter['getSecret'] = async (key) => {
      try {
        const response = await client.send(new GetSecretValueCommand({ SecretId: key }))
        if (response.SecretString === undefined) throw new Error(`secrets/not-a-string: ${key}`)
        return response.SecretString
      } catch (error) {
        if (isAwsError(error, NOT_FOUND)) return undefined
        if (isAwsError(error, INVALID_REQUEST) && await isAbsentOrScheduledForDeletion(key)) return undefined
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

    // ASM-6, WD6
    const deleteSecret: Adapter['deleteSecret'] = async (key) => {
      if (await isAbsentOrScheduledForDeletion(key)) return false
      try {
        await client.send(new DeleteSecretCommand({ SecretId: key, ForceDeleteWithoutRecovery: true }))
        return true
      } catch (error) {
        if (isAwsError(error, NOT_FOUND)) return false
        throw error
      }
    }

    return { getSecret, setSecret, setSecretIfAbsent, deleteSecret }
  }
})
