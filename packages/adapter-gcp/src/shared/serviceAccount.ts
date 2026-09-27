/** The fields of a Google service-account key file that the client libraries read. */
export interface ServiceAccount {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri?: string
  token_uri?: string
  auth_provider_x509_cert_url?: string
  client_x509_cert_url?: string
  universe_domain?: string
}

const asRecord = (options: unknown): Record<string, unknown> =>
  typeof options === 'object' && options !== null ? options as Record<string, unknown> : {}

/** Reasons for option keys outside `allowed`. Every descriptor rejects unknown keys so typos fail the build. */
export function unknownOptions (options: unknown, allowed: readonly string[]): string[] {
  return Object.keys(asRecord(options))
    .filter(key => !allowed.includes(key))
    .map(key => `unknown option '${key}'`)
}

/** Reason when `options[key]` is not a non-empty string, else []. */
export function requireString (options: unknown, key: string): string[] {
  const value = asRecord(options)[key]
  return typeof value === 'string' && value !== '' ? [] : [`${key} is required and must be a non-empty string`]
}
