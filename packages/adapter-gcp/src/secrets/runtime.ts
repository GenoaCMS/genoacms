import type { Adapter } from '@genoacms/contracts/secrets'
import { defineRuntime } from '@genoacms/contracts'
import { assertValidSecretKey } from '@genoacms/contracts/secrets'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import type { GcpSecretsOptions } from './descriptor.js'

/**
 * The GenoaCMS `secrets` service backed by GCP Secret Manager.
 *
 * Secret Manager is versioned; this contract is not. Writes add a version and reads always take
 * `latest`, so version history exists but is never consulted. That is deliberate — building the
 * contract on a provider-specific behavior would leave the abstraction unimplementable elsewhere.
 * `setSecret` therefore destroys the versions it supersedes (architecture GD4). Secrets created here
 * keep a destroyed version disabled for seven days before it is gone, so a bad overwrite can be undone
 * by hand.
 */

export default defineRuntime<GcpSecretsOptions, Adapter>({
  create ({ projectId, credentials }): Adapter {
    const client = new SecretManagerServiceClient({
      projectId,
      ...(credentials === undefined ? {} : { credentials })
    })

    const GRPC_NOT_FOUND = 5
    const GRPC_ALREADY_EXISTS = 6

    const parent = `projects/${projectId}`
    const secretName = (key: string): string => `${parent}/secrets/${key}`
    const latestVersionName = (key: string): string => `${secretName(key)}/versions/latest`

    // SEC-7, GD4
    const VERSION_DESTROY_TTL = { seconds: 7 * 24 * 60 * 60 }

    // SEC-7
    const newSecret = () => ({ replication: { automatic: {} }, versionDestroyTtl: VERSION_DESTROY_TTL })

    // SEC-8, SEC-9
    function versionNumber (name: string): number {
      const number = Number(name.split('/').at(-1))
      if (!Number.isInteger(number) || number < 1) throw new Error(`secrets/unexpected-version-name: ${name}`)
      return number
    }

    // SEC-8
    async function destroySuperseded (key: string, added: string): Promise<void> {
      const addedNumber = versionNumber(added)
      const [versions] = await client.listSecretVersions({ parent: secretName(key), filter: 'state:ENABLED' })
      for (const version of versions) {
        if (typeof version.name === 'string' && versionNumber(version.name) < addedNumber) {
          await client.destroySecretVersion({ name: version.name })
        }
      }
    }

    // SEC-9, GD4
    async function cleanUp (key: string, added: string): Promise<void> {
      try {
        await destroySuperseded(key, added)
      } catch (error) {
        console.warn(`secrets/cleanup-failed: ${key}: ${(error as Error).message}`)
      }
    }

    function hasStatusCode (error: unknown, code: number): boolean {
      return typeof error === 'object' && error !== null && (error as { code?: number }).code === code
    }

    // SEC-5
    async function ensureSecretExists (key: string): Promise<void> {
      try {
        await client.getSecret({ name: secretName(key) })
      } catch (error) {
        if (!hasStatusCode(error, GRPC_NOT_FOUND)) throw error
        try {
          await client.createSecret({
            parent,
            secretId: key,
            secret: newSecret()
          })
        } catch (createError) {
          if (!hasStatusCode(createError, GRPC_ALREADY_EXISTS)) throw createError
        }
      }
    }

    // SEC-3, SEC-4
    const getSecret: Adapter.getSecret = async (key: string) => {
      assertValidSecretKey(key)
      try {
        const [version] = await client.accessSecretVersion({ name: latestVersionName(key) })
        const data = version.payload?.data
        if (data === null || data === undefined) return undefined
        return typeof data === 'string' ? data : Buffer.from(data).toString('utf-8')
      } catch (error) {
        if (hasStatusCode(error, GRPC_NOT_FOUND)) return undefined
        throw error
      }
    }

    const setSecret: Adapter.setSecret = async (key: string, value: string) => {
      assertValidSecretKey(key)
      await ensureSecretExists(key)
      const [version] = await client.addSecretVersion({
        parent: secretName(key),
        payload: { data: Buffer.from(value, 'utf-8') }
      })
      if (typeof version.name === 'string') await cleanUp(key, version.name)
      return true
    }

    // SEC-6, SEC-10
    const setSecretIfAbsent: Adapter.setSecretIfAbsent = async (key: string, value: string) => {
      assertValidSecretKey(key)
      try {
        await client.createSecret({
          parent,
          secretId: key,
          secret: newSecret()
        })
      } catch (error) {
        if (hasStatusCode(error, GRPC_ALREADY_EXISTS)) return false
        throw error
      }
      await client.addSecretVersion({
        parent: secretName(key),
        payload: { data: Buffer.from(value, 'utf-8') }
      })
      return true
    }

    // SEC-11
    const deleteSecret: Adapter.deleteSecret = async (key: string) => {
      assertValidSecretKey(key)
      try {
        await client.deleteSecret({ name: secretName(key) })
        return true
      } catch (error) {
        if (hasStatusCode(error, GRPC_NOT_FOUND)) return false
        throw error
      }
    }

    return {
      getSecret,
      setSecret,
      deleteSecret,
      setSecretIfAbsent
    }
  }
})
