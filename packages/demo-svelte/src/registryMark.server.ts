import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

const MARK_FORMAT = /^(0|[1-9][0-9]*)$/

let client: SecretManagerServiceClient | undefined

const clientFor = (credentials: string): SecretManagerServiceClient => {
  client ??= credentials === ''
    ? new SecretManagerServiceClient()
    : new SecretManagerServiceClient({ credentials: JSON.parse(credentials) as Record<string, string> })
  return client
}

const markOf = (stored: string | undefined): number => {
  const mark = stored === undefined || !MARK_FORMAT.test(stored) ? Number.NaN : Number(stored)
  if (!Number.isSafeInteger(mark)) throw new Error('demo/registry-mark-malformed')
  return mark
}

/**
 * The instance's key registry mark (REG-4), read from the named Secret Manager version with the
 * credentials the bucket reader uses. Throws when it cannot be read or is malformed.
 */
const readRegistryMark = async (versionName: string, credentials: string): Promise<number> => {
  const [version] = await clientFor(credentials).accessSecretVersion({ name: versionName })
  return markOf(version.payload?.data?.toString())
}

export { readRegistryMark }
