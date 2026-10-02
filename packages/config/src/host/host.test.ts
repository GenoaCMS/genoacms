import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHost, type RuntimeLoader } from './index.js'
import type { RuntimeManifest, AdapterRecord } from '../manifest.js'

const record = (kind: AdapterRecord['kind'], runtime: string, secretOptions: AdapterRecord['secretOptions'] = {}): AdapterRecord =>
  ({ kind, runtime, secretOptions, developmentOnly: false, package: runtime.split('/')[0], version: '1.0.0' })

function manifest (): RuntimeManifest {
  return {
    version: 1,
    mode: 'production',
    adapters: {
      'mem/storage': record('storage', 'mem/storage/runtime', { credentials: 'json' }),
      'mem/database': record('database', 'mem/database/runtime'),
      'mem/auth': record('authentication', 'mem/auth/runtime', { token: 'string' }),
      'mem/secrets': record('secrets', 'mem/secrets/runtime', { credentials: 'json' }),
      'mem/language': record('language', 'mem/language/runtime')
    },
    config: {
      authentication: {
        cookieName: '__session',
        providers: {
          first: { adapter: 'mem/auth', options: { token: { $inline: 'one' } } },
          second: { adapter: 'mem/auth', options: { token: { $inline: 'two' } } }
        }
      },
      database: {
        providers: { db: { adapter: 'mem/database', options: {} } },
        databases: {
          content: { provider: 'db', collections: [{ name: 'articles' } as any] },
          archive: { provider: 'db', collections: [{ name: 'articles' } as any, { name: 'old' } as any] }
        }
      },
      storage: {
        providers: {
          a: { adapter: 'mem/storage', options: { region: 'eu', credentials: { $secret: 'SHARED_SA' } } },
          b: { adapter: 'mem/storage', options: { region: 'us', credentials: { $secret: 'SHARED_SA' } } }
        },
        buckets: { content: { provider: 'a' }, public: { provider: 'a' }, archive: { provider: 'b' } },
        defaultBucket: 'content'
      },
      secrets: { providers: { store: { adapter: 'mem/secrets', options: {} } } },
      languages: { providers: { typescript: { adapter: 'mem/language', options: {} } } },
      authorization: { roles: { Administrator: [{ permission: '*', resource: '*' }] } },
      security: { maxFuel: 5 }
    }
  }
}

/** Records every create call; each instance echoes what it was built from. */
function runtimes (secretValues: Record<string, string | undefined> = { SHARED_SA: '{"k":"v"}' }) {
  const creates: Array<{ specifier: string, options: unknown, ctx: unknown }> = []
  const getSecret = vi.fn(async (key: string) => secretValues[key])
  const echo = (specifier: string) => ({
    create: (options: unknown, ctx: any) => {
      creates.push({ specifier, options, ctx })
      return { options, ctx, language: 'typescript' }
    }
  })
  const modules: Record<string, { create: (options: any, ctx: any) => unknown }> = {
    'mem/storage/runtime': echo('mem/storage/runtime'),
    'mem/database/runtime': echo('mem/database/runtime'),
    'mem/auth/runtime': echo('mem/auth/runtime'),
    'mem/language/runtime': echo('mem/language/runtime'),
    'mem/secrets/runtime': { create: () => ({ getSecret, setSecret: vi.fn(), deleteSecret: vi.fn(), setSecretIfAbsent: vi.fn() }) }
  }
  const load = vi.fn(async (specifier: string) => ({ default: modules[specifier] })) as unknown as RuntimeLoader & ReturnType<typeof vi.fn>
  return { creates, getSecret, load, modules }
}

describe('host construction', () => {
  it('1: performs no I/O when created', () => {
    const { load, creates } = runtimes()
    createHost({ manifest: manifest(), load })
    expect(load).not.toHaveBeenCalled()
    expect(creates).toEqual([])
  })

  it('2: builds two instances of one adapter, each with its own options and resources, and caches by name', async () => {
    const { load, creates } = runtimes()
    const host = createHost({ manifest: manifest(), load })
    const a = await host.storage('a') as any
    const b = await host.storage('b') as any
    await host.storage('a')
    expect(creates.filter(c => c.specifier === 'mem/storage/runtime')).toHaveLength(2)
    expect(a).not.toBe(b)
    expect(a.options).toEqual({ region: 'eu', credentials: { k: 'v' } })
    expect(a.ctx).toMatchObject({ name: 'a', resources: ['content', 'public'] })
    expect(b.ctx).toMatchObject({ name: 'b', resources: ['archive'] })
  })

  it('3: shares one construction between concurrent first calls', async () => {
    const { load, creates } = runtimes()
    const host = createHost({ manifest: manifest(), load })
    await Promise.all([host.storage('a'), host.storage('a'), host.storage('a')])
    expect(creates.filter(c => c.specifier === 'mem/storage/runtime')).toHaveLength(1)
  })

  it('4: retries a construction that failed', async () => {
    const { load, modules } = runtimes()
    const create = modules['mem/database/runtime'].create
    let attempts = 0
    modules['mem/database/runtime'].create = (options, ctx) => {
      attempts++
      if (attempts === 1) throw new Error('transient')
      return create(options, ctx)
    }
    const host = createHost({ manifest: manifest(), load })
    await expect(host.database('db')).rejects.toThrow('transient')
    await expect(host.database('db')).resolves.toBeDefined()
    expect(attempts).toBe(2)
  })

  it('14: close() forgets constructed providers', async () => {
    const { load, creates } = runtimes()
    const host = createHost({ manifest: manifest(), load })
    await host.storage('a')
    await host.close()
    await host.storage('a')
    expect(creates.filter(c => c.specifier === 'mem/storage/runtime')).toHaveLength(2)
  })
})

describe('reference resolution', () => {
  it('5: passes inline values through, reads env() and secret(), and decodes declared JSON only', async () => {
    const { load, getSecret } = runtimes({ SHARED_SA: '{"k":"v"}', PLAIN: '{"not":"decoded"}' })
    const host = createHost({ manifest: manifest(), load, environment: { JSON_VAR: '{"from":"env"}', TEXT_VAR: '{"raw"' } })
    expect(await host.resolve({ credentials: { $inline: '{"stays":"a string"}' } }, { credentials: 'json' }, 'x')).toEqual({ credentials: '{"stays":"a string"}' })
    expect(await host.resolve({ credentials: { $env: 'JSON_VAR' } }, { credentials: 'json' }, 'x')).toEqual({ credentials: { from: 'env' } })
    expect(await host.resolve({ token: { $env: 'TEXT_VAR' } }, { token: 'string' }, 'x')).toEqual({ token: '{"raw"' })
    expect(await host.resolve({ token: { $secret: 'PLAIN' }, other: 1 }, { token: 'string' }, 'x')).toEqual({ token: '{"not":"decoded"}', other: 1 })
    expect(getSecret).toHaveBeenCalledWith('PLAIN')
  })

  it('6: reports missing values and invalid JSON without echoing the value', async () => {
    const sentinel = 'SENTINEL-do-not-print'
    const { load } = runtimes({ BAD_JSON: `{${sentinel}` })
    const host = createHost({ manifest: manifest(), load, environment: {} })
    await expect(host.resolve({ c: { $env: 'UNSET' } }, { c: 'string' }, 'p')).rejects.toMatchObject({ code: 'secrets/env-missing' })
    await expect(host.resolve({ c: { $secret: 'ABSENT' } }, { c: 'string' }, 'p')).rejects.toMatchObject({ code: 'secrets/missing' })
    const error = await host.resolve({ c: { $secret: 'BAD_JSON' } }, { c: 'json' }, 'p').catch(e => e)
    expect(error.code).toBe('secrets/invalid-json')
    expect(error.message).not.toContain(sentinel)
  })

  it('7: times out a slow secret store, and does not cache that failure', async () => {
    const { load, getSecret } = runtimes()
    getSecret.mockImplementationOnce(async () => await new Promise(() => {}))
    const host = createHost({ manifest: manifest(), load, secretTimeoutMs: 20 })
    await expect(host.storage('a')).rejects.toMatchObject({ code: 'provider/secret-unavailable' })
    await expect(host.storage('a')).resolves.toBeDefined()
  })

  it('8: fetches a secret shared by two providers once', async () => {
    const { load, getSecret } = runtimes()
    const host = createHost({ manifest: manifest(), load })
    await Promise.all([host.storage('a'), host.storage('b')])
    expect(getSecret).toHaveBeenCalledTimes(1)
  })

  it('9: refuses secret() in the secrets provider without asking any store', async () => {
    const { load, getSecret } = runtimes()
    const m = manifest()
    ;(m.config.secrets.providers.store.options as any).credentials = { $secret: 'STORE_SA' }
    const host = createHost({ manifest: m, load })
    await expect(host.secrets()).rejects.toMatchObject({ code: 'config/bootstrap-secret' })
    expect(getSecret).not.toHaveBeenCalled()
  })
})

describe('routing and reads', () => {
  it('10: routes buckets and collections to providers', async () => {
    const { load } = runtimes()
    const host = createHost({ manifest: manifest(), load })
    expect(((await host.storageForBucket('archive')) as any).ctx.name).toBe('b')
    await expect(host.storageForBucket('nowhere')).rejects.toMatchObject({ code: 'bucket/not-found' })
    expect(((await host.databaseForCollection('old')) as any).ctx.resources).toEqual(['content', 'archive'])
    await expect(host.databaseForCollection('nowhere')).rejects.toMatchObject({ code: 'database/not-found' })
  })

  it('11: explains an unconfigured language as core always has, and refuses a mismatch', async () => {
    const { load, modules } = runtimes()
    const host = createHost({ manifest: manifest(), load })
    await expect(host.language('kotlin')).rejects.toThrow("No language adapter is configured for 'kotlin'. Configured languages: typescript.")
    const none = manifest()
    none.config.languages.providers = {}
    await expect(createHost({ manifest: none, load }).language('kotlin')).rejects.toThrow('No language adapters are configured at all.')

    modules['mem/language/runtime'].create = () => ({ language: 'kotlin' })
    await expect(createHost({ manifest: manifest(), load }).language('typescript')).rejects.toMatchObject({ code: 'language/mismatch' })
  })

  it('12: reads data stanzas from the manifest on every access', () => {
    const { load } = runtimes()
    const m = manifest()
    const host = createHost({ manifest: m, load })
    expect(host.pathDelimiter).toBe('|->')
    expect(host.cookieName).toBe('__session')
    expect(host.defaultBucket).toBe('content')
    expect(host.buckets).toEqual(['content', 'public', 'archive'])
    expect(host.databases).toEqual(['content', 'archive'])
    expect(host.collections.map(c => c.name)).toEqual(['articles', 'articles', 'old'])
    expect(host.security).toEqual({ maxFuel: 5 })
    ;(m.config.authorization as any).roles = { Editor: [] }
    expect(host.authorization.roles).toEqual({ Editor: [] })
  })

  it('13: lists the authentication provider keys in config key order, constructing nothing', async () => {
    const { load } = runtimes()
    const loaded: string[] = []
    const m = manifest()
    const { first, second } = (m.config.authentication as any).providers
    ;(m.config.authentication as any).providers = { second, first }
    const host = createHost({ manifest: m, load: async (specifier) => { loaded.push(specifier); return await load(specifier) } })
    expect(host.authenticationProviderKeys).toEqual(['second', 'first'])
    expect(loaded).toEqual([])
  })
})

describe('import hygiene', () => {
  it('15: the host imports nothing that cannot ship inside a server bundle', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const sources = readdirSync(here).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    for (const file of sources) {
      const text = readFileSync(join(here, file), 'utf-8')
      for (const forbidden of ["from 'vite'", "from 'node:fs'", "from 'node:path'", 'import-meta-resolve', "'../load/"]) {
        expect(text, `${file} must not import ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})
