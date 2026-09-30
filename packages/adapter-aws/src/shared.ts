/** The SDK's static credentials. */
export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

const asRecord = (options: unknown): Record<string, unknown> =>
  typeof options === 'object' && options !== null ? options as Record<string, unknown> : {}

// AWS-2
export function unknownOptions (options: unknown, allowed: readonly string[]): string[] {
  return Object.keys(asRecord(options))
    .filter(key => !allowed.includes(key))
    .map(key => `unknown option '${key}'`)
}

// AWS-3
export function requireString (options: unknown, key: string): string[] {
  const value = asRecord(options)[key]
  return typeof value === 'string' && value !== '' ? [] : [`${key} is required and must be a non-empty string`]
}

// AWS-4
export function clientConfig (region: string, credentials?: AwsCredentials): { region: string, credentials?: AwsCredentials } {
  return credentials === undefined ? { region } : { region, credentials }
}
