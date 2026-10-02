import { defineAuthenticationAdapter, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type ServiceAccount } from '../../shared/serviceAccount.js'

export interface GcpIdentityPlatformOptions {
  projectId: string
  /** An Identity Platform tenant. Omit for the project's own user pool. */
  tenantId?: string
  /** An API key restricted to the Identity Toolkit API. Omit to sign in with the runtime identity. */
  apiKey?: Secret<string>
  /** Omit for Application Default Credentials; only for running outside GCP. */
  credentials?: Secret<ServiceAccount>
}

declare module '@genoacms/contracts' {
  interface AuthenticationAdapters { '@genoacms/adapter-gcp/authentication/identity-platform': GcpIdentityPlatformOptions }
}

const OPTIONS = ['projectId', 'tenantId', 'apiKey', 'credentials'] as const

// AUTH-1
function optionalString (options: unknown, key: string): string[] {
  const value = (options as Record<string, unknown> | null)?.[key]
  return value === undefined || (typeof value === 'string' && value !== '') ? [] : [`${key} must be a non-empty string`]
}

// AUTH-1, COM-2, COM-3
export default defineAuthenticationAdapter<GcpIdentityPlatformOptions>({
  runtime: '@genoacms/adapter-gcp/authentication/identity-platform/runtime',
  secretOptions: { apiKey: 'string', credentials: 'json' },
  validate: options => [...unknownOptions(options, OPTIONS), ...requireString(options, 'projectId'), ...optionalString(options, 'tenantId')]
})
