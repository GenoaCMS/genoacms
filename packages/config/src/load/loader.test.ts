import { describe, it, expect, afterEach, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, clearLoadCache } from './index.js'
import { ConfigError, type ConfigIssue } from '../errors.js'
import { makeProject, baseConfig, configSource, fakeAdapters, adapterPackage, THROWING_RUNTIME, type ProjectSpec } from '../testing/fixtures.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  clearLoadCache()
  while (cleanups.length > 0) cleanups.pop()?.()
})

function project (spec: Partial<ProjectSpec> & { config: string }) {
  const created = makeProject({ packages: fakeAdapters(), ...spec })
  cleanups.push(created.cleanup)
  return created
}

const silent = (): void => {}

async function issuesOf (config: unknown, mode: 'development' | 'production' = 'development', extra: Partial<ProjectSpec> = {}): Promise<ConfigIssue[]> {
  const { root } = project({ config: configSource(config), ...extra })
  try {
    await loadConfig({ root, mode, onWarning: silent })
  } catch (error) {
    if (error instanceof ConfigError) return [...error.issues]
    throw error
  }
  return []
}

const codesAt = (issues: ConfigIssue[]): string[] => issues.map(issue => `${issue.code} ${issue.path}`)

describe('loading a valid config', () => {
  it('produces one adapter record per distinct descriptor, without loading any runtime', async () => {
    const { root } = project({ config: configSource(baseConfig()) })
    const manifest = await loadConfig({ root, mode: 'development' })
    expect(Object.keys(manifest.adapters).sort()).toEqual(['fake-auth', 'fake-database', 'fake-deployment', 'fake-language', 'fake-secrets', 'fake-storage'])
    expect(manifest.adapters['fake-storage']).toEqual({
      kind: 'storage', runtime: 'fake-storage/runtime', secretOptions: { credentials: 'json' }, developmentOnly: false, package: 'fake-storage', version: '4.5.6'
    })
    expect(manifest.adapters['fake-deployment'].runtime).toBeUndefined()
    expect(manifest.config.storage.providers.gcs.options).toEqual({ projectId: 'p', credentials: { $secret: 'GCS_SA' } })
  })

  it('finds genoa.config/development.ts when genoa.config.ts is absent, and prefers genoa.config.ts', async () => {
    const nested = project({ config: configSource(baseConfig()), configName: 'genoa.config/development.ts' })
    expect((await loadConfig({ root: nested.root, mode: 'production', onWarning: silent })).mode).toBe('production')

    const both = project({ config: configSource(baseConfig()), files: { 'genoa.config/development.ts': 'throw new Error("the directory form must lose")' } })
    await expect(loadConfig({ root: both.root, mode: 'development' })).resolves.toBeDefined()
  })

  it('does not take index.ts or production.ts in genoa.config/ as the default', async () => {
    // A production config is always named explicitly, so the lookup must never land on one.
    for (const configName of ['genoa.config/index.ts', 'genoa.config/production.ts']) {
      const { root } = project({ config: configSource(baseConfig()), configName })
      await expect(loadConfig({ root, mode: 'development' })).rejects.toMatchObject({ code: 'config/not-found' })
    }
  })

  it('records the config file and everything it imports, in development only', async () => {
    const { root, file } = project({
      config: [
        "import credentials from './credentials.json' with { type: 'json' }",
        "import { roles } from './shared/roles'",
        `const config = ${JSON.stringify(baseConfig())}`,
        'config.authentication.providers.array.options.credentials = { $inline: credentials }',
        'config.authorization.roles = roles',
        'export default config'
      ].join('\n'),
      files: {
        'credentials.json': '[{ "subject": "s", "email": "e", "password": "p" }]',
        'shared/roles.ts': "export const roles = { Administrator: [{ permission: '*', resource: '*' }] }\n"
      }
    })
    const manifest = await loadConfig({ root, mode: 'development' })
    expect(manifest.source?.dependencies).toEqual(expect.arrayContaining([file, join(root, 'credentials.json'), join(root, 'shared/roles.ts')]))
    expect(manifest.source?.dependencies[0]).toBe(file)
    expect(manifest.config.authentication.providers.array.options).toEqual({ credentials: { $inline: [{ subject: 's', email: 'e', password: 'p' }] } })

    clearLoadCache()
    expect((await loadConfig({ root, mode: 'production', onWarning: silent })).source).toBeUndefined()
  })

  it('erases a type-only import of an adapter module', async () => {
    const packages = { ...fakeAdapters(), 'typed-adapter': adapterPackage(THROWING_RUNTIME) }
    const { root } = project({ config: `import type {} from 'typed-adapter'\n${configSource(baseConfig())}`, packages })
    await expect(loadConfig({ root, mode: 'development' })).resolves.toBeDefined()
  })

  it('evaluates helpers imported from @genoacms/config', async () => {
    const source = [
      "import { defineConfig, secret, env, inline } from '@genoacms/config'",
      `const config = ${JSON.stringify(baseConfig())}`,
      "config.storage.providers.gcs.options.credentials = secret('GCS_SA')",
      "config.authentication.providers.array.options.credentials = inline([])",
      "config.deployment.targets.local.options.credentials = env('DEPLOY_SA')",
      'export default defineConfig(config)'
    ].join('\n')
    const { root } = project({ config: source, linkConfigPackage: true })
    const manifest = await loadConfig({ root, mode: 'development' })
    expect(manifest.config.storage.providers.gcs.options.credentials).toEqual({ $secret: 'GCS_SA' })
    expect(manifest.config.authentication.providers.array.options.credentials).toEqual({ $inline: [] })
    expect(manifest.config.deployment?.targets.local.options).toEqual({ credentials: { $env: 'DEPLOY_SA' } })
  })
})

describe('file-level failures', () => {
  it('reports a missing config file', async () => {
    const { root } = project({ config: '', configName: 'not-a-config.ts' })
    await expect(loadConfig({ root, mode: 'development' })).rejects.toMatchObject({ code: 'config/not-found' })
  })

  it('reports a config that throws while evaluating', async () => {
    const { root } = project({ config: "throw new Error('boom')" })
    await expect(loadConfig({ root, mode: 'development' })).rejects.toMatchObject({ code: 'config/evaluation-failed' })
  })

  it('reports a config whose default export is not an object', async () => {
    const { root } = project({ config: 'export default 42' })
    await expect(loadConfig({ root, mode: 'development' })).rejects.toMatchObject({ code: 'config/not-an-object' })
  })

  it('reports a descriptor that is not installed, naming it', async () => {
    const config = baseConfig()
    config.storage.providers.gcs.adapter = 'not-installed/storage'
    const issues = await issuesOf(config)
    expect(codesAt(issues)).toContain('config/descriptor-not-found storage.providers.gcs.adapter')
    expect(issues.find(issue => issue.code === 'config/descriptor-not-found')?.message).toContain('not-installed/storage')
  })
})

describe('loader rules', () => {
  it('1: requires every stanza', async () => {
    const config = baseConfig()
    delete config.security
    expect(codesAt(await issuesOf(config))).toContain('config/missing-stanza security')
  })

  it('1b: refuses a malformed provider entry', async () => {
    const config = baseConfig()
    config.storage.providers.gcs = { adapter: 'fake-storage' }
    expect(codesAt(await issuesOf(config))).toContain('config/invalid-provider-entry storage.providers.gcs')
  })

  it('2: refuses values that do not survive JSON, including undefined properties', async () => {
    const source = [
      `const config = ${JSON.stringify(baseConfig())}`,
      'config.security.fetchOrigins = undefined',
      'config.security.extra = () => 1',
      'config.security.when = new Date(0)',
      'export default config'
    ].join('\n')
    const { root } = project({ config: source })
    const error = await loadConfig({ root, mode: 'development' }).catch(e => e)
    expect(codesAt(error.issues)).toEqual(expect.arrayContaining([
      'config/not-serializable security.fetchOrigins',
      'config/not-serializable security.extra',
      'config/not-serializable security.when'
    ]))
    expect(error.issues[0].message).toContain('remove the key')
  })

  it('3: refuses an adapter configured under the wrong service', async () => {
    const config = baseConfig()
    config.database.providers.db.adapter = 'fake-storage'
    config.database.providers.db.options = { projectId: 'p' }
    expect(codesAt(await issuesOf(config))).toContain('config/kind-mismatch database.providers.db.adapter')
  })

  it("4: reports each of the descriptor's validation reasons", async () => {
    const config = baseConfig()
    delete config.storage.providers.gcs.options.projectId
    const issues = await issuesOf(config)
    expect(issues).toContainEqual({ code: 'config/invalid-options', path: 'storage.providers.gcs.options', message: 'projectId is required' })
  })

  it('5: refuses a bare value in a credential field', async () => {
    const config = baseConfig()
    config.storage.providers.gcs.options.credentials = { client_email: 'e' }
    expect(codesAt(await issuesOf(config))).toContain('config/bare-secret storage.providers.gcs.options.credentials')
  })

  it('6: refuses references outside declared credential fields', async () => {
    const config = baseConfig()
    config.security.maxFuel = { $env: 'FUEL' }
    config.storage.providers.gcs.options.projectId = { $env: 'PROJECT' }
    expect(codesAt(await issuesOf(config))).toEqual(expect.arrayContaining([
      'config/misplaced-reference storage.providers.gcs.options.projectId',
      'config/misplaced-reference security.maxFuel'
    ]))
  })

  it('7: refuses secret() in the secrets provider', async () => {
    const config = baseConfig()
    config.secrets.providers.local.options.credentials = { $secret: 'STORE_SA' }
    const codes = codesAt(await issuesOf(config))
    expect(codes).toContain('config/bootstrap-secret secrets.providers.local.options.credentials')
    expect(codes.filter(code => code.startsWith('config/misplaced-reference'))).toEqual([])
  })

  it('8: refuses a secret key outside the portable pattern', async () => {
    const config = baseConfig()
    config.storage.providers.gcs.options.credentials = { $secret: 'gcs-sa' }
    expect(codesAt(await issuesOf(config))).toContain('config/invalid-secret-key storage.providers.gcs.options.credentials')
  })

  it('9: requires exactly one secrets provider', async () => {
    const config = baseConfig()
    config.secrets.providers.second = { adapter: 'fake-secrets', options: {} }
    expect(codesAt(await issuesOf(config))).toContain('config/secrets-provider-count secrets.providers')
  })

  it('10: refuses references to providers and targets that do not exist', async () => {
    const config = baseConfig()
    config.storage.buckets.genoacms.provider = 'gcs-typo'
    config.database.databases.main.provider = 'db-typo'
    config.deployment.default = 'nowhere'
    expect(codesAt(await issuesOf(config))).toEqual(expect.arrayContaining([
      'config/unknown-provider storage.buckets.genoacms.provider',
      'config/unknown-provider database.databases.main.provider',
      'config/unknown-provider deployment.default'
    ]))
  })

  it('11: requires the default bucket to be a declared bucket', async () => {
    const config = baseConfig()
    config.storage.defaultBucket = 'elsewhere'
    expect(codesAt(await issuesOf(config))).toContain('config/unknown-bucket storage.defaultBucket')
  })

  it('12: refuses integer-like keys', async () => {
    const config = baseConfig()
    config.authentication.providers = { 1: config.authentication.providers.array }
    expect(codesAt(await issuesOf(config))).toContain('config/integer-key authentication.providers.1')
  })

  it('13: refuses a development-only adapter in production only', async () => {
    const config = baseConfig()
    config.secrets.providers.local.adapter = 'fake-dev-secrets'
    expect(codesAt(await issuesOf(config, 'production'))).toContain('config/development-only secrets.providers.local.adapter')
    clearLoadCache()
    expect(await issuesOf(config, 'development')).toEqual([])
  })

  it('14: warns per inline value in production, never for deployment targets, and refuses under forbidInline', async () => {
    const config = baseConfig()
    config.deployment.targets.local.options.credentials = { $inline: { key: 'deploy' } }
    const { root } = project({ config: configSource(config) })

    const production: ConfigIssue[] = []
    await loadConfig({ root, mode: 'production', onWarning: warning => production.push(warning) })
    expect(codesAt(production)).toEqual(['config/inline authentication.providers.array.options.credentials'])

    const development: ConfigIssue[] = []
    await loadConfig({ root, mode: 'development', onWarning: warning => development.push(warning) })
    expect(development).toEqual([])

    await expect(loadConfig({ root, mode: 'production', forbidInline: true, onWarning: silent }))
      .rejects.toMatchObject({ issues: [expect.objectContaining({ code: 'config/inline-forbidden' })] })
  })

  it('reports every problem at once', async () => {
    const config = baseConfig()
    config.storage.defaultBucket = 'elsewhere'
    config.secrets.providers.second = { adapter: 'fake-secrets', options: {} }
    delete config.security
    const codes = (await issuesOf(config)).map(issue => issue.code)
    expect(codes).toEqual(expect.arrayContaining(['config/missing-stanza', 'config/secrets-provider-count', 'config/unknown-bucket']))
  })
})

describe('memoization', () => {
  it('returns the same promise per file and mode until the cache is cleared', async () => {
    const { root } = project({ config: configSource(baseConfig()) })
    const first = loadConfig({ root, mode: 'development' })
    expect(loadConfig({ root, mode: 'development' })).toBe(first)
    await first
    clearLoadCache()
    const second = loadConfig({ root, mode: 'development' })
    expect(second).not.toBe(first)
    await second
  })

  it('forgets a failed load, so a fixed config loads', async () => {
    const { root, file } = project({ config: "throw new Error('not yet')" })
    await expect(loadConfig({ root, mode: 'development' })).rejects.toBeInstanceOf(ConfigError)
    writeFileSync(file, configSource(baseConfig()))
    await expect(loadConfig({ root, mode: 'development' })).resolves.toBeDefined()
  })

  it('prints warnings once per load, not once per call', async () => {
    const { root } = project({ config: configSource(baseConfig()) })
    const warn = vi.fn()
    await loadConfig({ root, mode: 'production', onWarning: warn })
    await loadConfig({ root, mode: 'production', onWarning: warn })
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
