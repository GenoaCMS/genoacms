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

    /** gRPC status codes. */
    const NOT_FOUND = 5
    const ALREADY_EXISTS = 6

    const parent = `projects/${projectId}`
    const secretName = (key: string): string => `${parent}/secrets/${key}`
    const latestVersionName = (key: string): string => `${secretName(key)}/versions/latest`

    /** A destroyed version stays disabled this long before Secret Manager destroys it (architecture GD4). */
    const VERSION_DESTROY_TTL = { seconds: 7 * 24 * 60 * 60 }

    /** The secret resource every create path uses. */
    const newSecret = () => ({ replication: { automatic: {} }, versionDestroyTtl: VERSION_DESTROY_TTL })

    /** The number at the end of a version resource name. */
    function versionNumber (name: string): number {
      const number = Number(name.split('/').at(-1))
      if (!Number.isInteger(number) || number < 1) throw new Error(`secrets/unexpected-version-name: ${name}`)
      return number
    }

    /** Destroys every enabled version of `key` numbered below `added`, so a concurrent newer write survives. */
    async function destroySuperseded (key: string, added: string): Promise<void> {
      const addedNumber = versionNumber(added)
      const [versions] = await client.listSecretVersions({ parent: secretName(key), filter: 'state:ENABLED' })
      for (const version of versions) {
        if (typeof version.name === 'string' && versionNumber(version.name) < addedNumber) {
          await client.destroySecretVersion({ name: version.name })
        }
      }
    }

    /**
     * Reports instead of failing: the new value is already written and is `latest`. The next overwrite
     * retries, because it destroys every lower enabled version, not only the previous one.
     */
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

    /**
     * Creating on demand keeps `setSecret` a single call for the caller. A concurrent create losing the
     * race is not a failure — the secret it wanted now exists.
     */
    async function ensureSecretExists (key: string): Promise<void> {
      try {
        await client.getSecret({ name: secretName(key) })
      } catch (error) {
        if (!hasStatusCode(error, NOT_FOUND)) throw error
        try {
          await client.createSecret({
            parent,
            secretId: key,
            secret: newSecret()
          })
        } catch (createError) {
          if (!hasStatusCode(createError, ALREADY_EXISTS)) throw createError
        }
      }
    }

    /**
     * Resolves to `undefined` only when the secret does not exist.
     *
     * Every other failure propagates, including a `latest` version that has been disabled or destroyed.
     * Reporting that as absence would be worse than failing: a caller reads absence as "not configured
     * yet" and generates a replacement, so a disabled key would quietly become a *new* key rather than
     * an error.
     */
    const getSecret: Adapter.getSecret = async (key: string) => {
      assertValidSecretKey(key)
      try {
        const [version] = await client.accessSecretVersion({ name: latestVersionName(key) })
        const data = version.payload?.data
        if (data === null || data === undefined) return undefined
        return typeof data === 'string' ? data : Buffer.from(data).toString('utf-8')
      } catch (error) {
        if (hasStatusCode(error, NOT_FOUND)) return undefined
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

    /**
     * Claims a key, atomically.
     *
     * `createSecret` is the primitive: the name is unique within the project, so exactly one concurrent
     * caller creates it and the rest receive `ALREADY_EXISTS`. Creating the name and writing its value
     * are two calls, so a crash between them leaves a name holding nothing — the caller is responsible
     * for polling and failing rather than reading that as absence.
     */
    const setSecretIfAbsent: Adapter.setSecretIfAbsent = async (key: string, value: string) => {
      assertValidSecretKey(key)
      try {
        await client.createSecret({
          parent,
          secretId: key,
          secret: newSecret()
        })
      } catch (error) {
        if (hasStatusCode(error, ALREADY_EXISTS)) return false
        throw error
      }
      await client.addSecretVersion({
        parent: secretName(key),
        payload: { data: Buffer.from(value, 'utf-8') }
      })
      return true
    }

    /** Removes the secret and every version of it. Resolves `false` when it was already absent. */
    const deleteSecret: Adapter.deleteSecret = async (key: string) => {
      assertValidSecretKey(key)
      try {
        await client.deleteSecret({ name: secretName(key) })
        return true
      } catch (error) {
        if (hasStatusCode(error, NOT_FOUND)) return false
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
