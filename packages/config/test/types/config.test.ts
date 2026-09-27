/**
 * Type-level tests, checked by `tsc` (`pnpm run check`). A line after `@ts-expect-error` must fail to
 * compile; if it ever compiles, `tsc` reports the directive as unused and the check fails.
 */
import { defineConfig, storageProvider, secretsProvider, databaseProvider, authenticationProvider, languageProvider, deploymentTarget, secret, inline } from '@genoacms/config'
import type { Secret, BootstrapSecret } from '@genoacms/contracts'

declare module '@genoacms/contracts' {
  interface StorageAdapters { 'a/storage': { projectId: string, credentials?: Secret<{ k: string }> } }
  interface SecretsAdapters { 'a/secrets': { credentials?: BootstrapSecret<{ k: string }> } }
}

const stanzas = {
  authentication: { cookieName: '__session', providers: { array: authenticationProvider('unregistered/auth', { anything: [1, 2] }) } },
  database: { providers: { db: databaseProvider('unregistered/db', {}) }, databases: { main: { provider: 'db' as const, collections: [] } } },
  languages: { providers: { typescript: languageProvider('unregistered/lang', {}) } },
  authorization: {},
  security: {}
}

// Positive: registered adapters with references, an unregistered adapter with arbitrary options.
defineConfig({
  ...stanzas,
  secrets: { providers: { store: secretsProvider('a/secrets', {}) } },
  storage: {
    providers: { gcs: storageProvider('a/storage', { projectId: 'p', credentials: inline({ k: 'x' }) }) },
    buckets: { b: { provider: 'gcs' } },
    defaultBucket: 'b'
  },
  deployment: { targets: { local: deploymentTarget('unregistered/node', {}) }, default: 'local' }
})

// Negative: a bucket naming a provider that does not exist.
defineConfig({
  ...stanzas,
  secrets: { providers: { store: secretsProvider('a/secrets', {}) } },
  storage: {
    providers: { gcs: storageProvider('a/storage', { projectId: 'p' }) },
    // @ts-expect-error
    buckets: { b: { provider: 'typo' } },
    defaultBucket: 'b'
  }
})

// Negative: a bare object in a Secret field.
// @ts-expect-error
storageProvider('a/storage', { projectId: 'p', credentials: { k: 'x' } })

// Negative: secret() in the secrets provider (the bootstrap rule).
// @ts-expect-error
secretsProvider('a/secrets', { credentials: secret('K') })

// Negative: deployment.default naming a missing target.
defineConfig({
  ...stanzas,
  secrets: { providers: { store: secretsProvider('a/secrets', {}) } },
  storage: { providers: { gcs: storageProvider('a/storage', { projectId: 'p' }) }, buckets: { b: { provider: 'gcs' } }, defaultBucket: 'b' },
  // @ts-expect-error
  deployment: { targets: { local: deploymentTarget('unregistered/node', {}) }, default: 'nowhere' }
})
