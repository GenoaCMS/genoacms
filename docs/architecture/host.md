---
type: architecture
title: The host
conforms: false
---

# The host

Part of the configuration architecture, split out of [`configuration.md`](configuration.md) on 2026-10-02 without changing its content. Unprefixed IDs (`U`, `D`, `F`, `R`, `S-`, `C`, `A`, `K`, `P`) are those of the 2026-09 redesign. `configuration.md` lists which document holds each.

The per-process object that holds the manifest and constructs providers on first use. Core, the CLI
and the deploy create one; adapters never see it.

## Decisions

**D3. The host constructs providers; adapters never see the config.** A per-process host holds the
manifest. For each provider entry it resolves the secret references, loads the runtime by specifier
and calls `create`. It caches the **promise** of each construction per provider name, and drops a
promise that rejects.
*Why:* two entries naming one adapter become two `create` calls (F5). No self-identifying string (F3),
no shared mutable state (F4).
*Cost:* first use of a provider is async and can fail. The host is one more object to hand to tests.

## Types: the host (`@genoacms/config/host`)

```ts
type RuntimeLoader = (specifier: string) => Promise<{ default: AdapterRuntime<object, unknown> }>

interface HostOptions {
  manifest: RuntimeManifest | Manifest
  /** Injected by the caller. In core and the CLI it is `s => import(/* @vite-ignore */ s)`. */
  load: RuntimeLoader
  /** Defaults to manifest.source?.root. */
  projectRoot?: string
  /** Per getSecret call. Default 10 000. */
  secretTimeoutMs?: number
  environment?: Record<string, string | undefined>   // default process.env; injectable for tests
}

interface Host {
  storage (provider: string): Promise<StorageAdapter>
  database (provider: string): Promise<DatabaseAdapter>
  authentication (provider: string): Promise<AuthenticationAdapter>
  language (language: string): Promise<LanguageAdapter>   // checks adapter.language === key
  secrets (): Promise<SecretsAdapter>                     // the sole store; constructed from env()/inline() only

  storageForBucket (bucket: string): Promise<StorageAdapter>
  databaseForCollection (collection: string): Promise<DatabaseAdapter>
  authenticationProviders (): Promise<AuthenticationAdapter[]>   // in key order

  readonly authorization: AuthorizationConfig
  readonly security: SecurityConfig
  readonly cookieName: string
  readonly defaultBucket: string
  readonly pathDelimiter: string
  readonly buckets: readonly string[]
  readonly collections: readonly CollectionReference[]

  /** Resolves one options object against a descriptor's secretOptions. Used by `genoa deploy`. */
  resolve<O extends object> (options: O, secretOptions: Record<string, SecretEncoding>, path: string): Promise<Resolved<O>>
  /** Awaits pending constructions and drops them. CLI only; a server never calls it. */
  close (): Promise<void>
}
declare function createHost (options: HostOptions): Host   // performs no I/O
```

**Construction, per provider name:**

```
host.storage(name)
  cached = constructions.get(name);  if cached: return cached          ← the promise, not the instance
  p = (async () => {
        entry    = manifest.config.storage.providers[name]   ?? throw provider/not-found
        meta     = manifest.adapters[entry.adapter]
        options  = await resolve(entry.options, meta.secretOptions)       ← may call host.secrets()
        runtime  = (await load(meta.runtime)).default
        return runtime.create(options, { name, resources: bucketsOf(name), projectRoot })
      })()
  constructions.set(name, p)
  p.catch(() => constructions.delete(name))                              ← failures are retried
  return p
```

Caching by provider name, and by nothing else, is the whole of the "two instances" fix.
`host.secrets()` follows the same pattern, except that it resolves only `env()` and `inline()`, so it
never calls itself.

## Rejected alternatives

| Alternative | Why rejected |
| :-- | :-- |
| **Eager resolution of every provider at cold start** | Pays for providers a request never uses, and makes readiness depend on every key existing. |
