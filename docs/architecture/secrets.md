---
type: architecture
title: Secret references and the secrets provider
conforms: false
---

# Secret references and the secrets provider

Part of the configuration architecture, split out of [`configuration.md`](configuration.md) on 2026-10-02 without changing its content. Unprefixed IDs (`U`, `D`, `F`, `R`, `S-`, `C`, `A`, `K`, `P`) are those of the 2026-09 redesign. `configuration.md` lists which document holds each.

How a credential reaches an adapter: the references a config writes (`secret()`, `env()`,
`inline()`), where the host resolves them, the one secrets provider and its bootstrap, and the
development store.

## Decisions

| # | Decision | Consequence |
| :-- | :-- | :-- |
| U3 | Inline credentials stay allowed, but only when written explicitly. | `inline()` exists, and a production build warns once per inline field (*`inline()`*). |
| U11 | `packages/core/.env` holds the dev instance's signing seeds (root, registry sequence, subordinates). The author moves it once, by hand, to `packages/core/.genoacms/secrets.env` when core switches stores. | No path override and no fallback in code. `envDir: false` and `viteConfig.test.ts` are deleted. The core RFC stops for this step, and agents never read or move secret files. |

**D5. Secrets are typed references, resolved by the host just before construction.**
`secret('KEY')`, `env('VAR')` and `inline(value)` are the only ways to fill a credential option. Each
adapter's option types say which fields are credentials, and its descriptor says the same at runtime.
The secrets provider's own options admit `env()` and `inline()` only: the bootstrap rule, enforced by
the type and by the loader.
*Cost:* the first use of each provider costs a secret round trip at cold start, unless `env()` or
ADC is used. A secret several providers use is fetched once, but its timeout fails every provider
waiting on it at the same moment, which reads as correlated failures in the logs.

## Secret references

## Where a reference is resolved, and what holds the value

References are resolved only in `host.resolve`: when the host constructs a provider, and when
`genoa deploy` prepares a target's options. `core/src/lib/script/secrets/references.server.ts` is
deleted, and its "throw naming the field" behavior moves into the resolver.

Resolved values live in exactly three places:
1. the adapter's closure after `create`;
2. the host's per-process secret cache, keyed by secret name, which also collapses concurrent reads of one key;
3. the transient options object passed to `create`.

A value is never held in the manifest (except `inline()`), in the Vite module graph, or in an error
message. Errors name the path and the reference: `storage.providers.gcs.options.credentials →
GCS_SA`.

The signing seeds and the registry sequence, which core reads through `host.secrets()` directly, bypass
this cache. They keep the `getOrClaimSecret` and `setSecretIfAbsent` semantics they have today.

## `inline()`

It is allowed (U3). A bare literal in a secret field is a type error and a load error, and `inline(x)`
is the explicit way to write one. In production mode, `loadConfig` warns once per field:
`storage.providers.gcs.options.credentials is inline: this value is written into the build`.
`genoa build --no-inline` turns the warnings into errors. The runtime manifest therefore holds a
credential only when the operator wrote `inline()`. Inline values under `deployment.targets` do not
warn: deployment options never enter the runtime manifest.

## Bootstrap ordering

```
1. host.secrets()        options: env() / inline() only       → no network before the store exists
2. host.storage(x)       options may contain secret()         → store round trip(s), concurrent per provider
3. host.database(y)      same, on first use
```

The rule is stated three times, and all three agree:
- the `BootstrapSecret` field type, for config authors;
- `defineSecretsAdapter`'s guard, for adapter authors;
- loader rule 5, at runtime.

**Recommended production form:** `@genoacms/adapter-gcp/secrets` with `credentials` omitted, which
uses Application Default Credentials (on Cloud Run, the function's own service account). Every other
credential is then a `secret()`, and no credential exists in the config or the environment at all.

`env()` is not a second store. The single-authority argument is about *writes*: `setSecret` has one
target. `env()` is read-only and resolved by the host, so single-provider stays.

## Failure and latency in production

- `createHost` does no I/O. The first I/O happens in `ensureInstanceInitialized()`: store construction, then the root-seed claim (already a secret read today), then the default bucket's provider.
- A provider's references are fetched concurrently, so a provider costs one round trip of latency. A request that never touches a database never resolves the database's secrets.
- Each `getSecret` is bounded by `secretTimeoutMs`, default 10 s. On timeout or a missing key, the construction rejects with `provider/secret-unavailable` or `secrets/missing`, naming the provider and the reference. The rejection is **not** cached, so the next call retries. `GrantCache` already follows the same rule.
- Callers are unchanged: `ensureInstanceInitialized` catches and logs, and never rejects (K1). A request that needs the provider fails with 500.
- Operators who want no round trip can mount secrets as environment variables (Cloud Run and Lambda both support this natively) and write `env()`.

## Caching and rotation

Resolved values are cached for the life of the process. A constructed client holds its credential no
matter what the cache does, so rotation means reconstructing the provider, and the honest unit of
reconstruction is the process. On serverless platforms the next cold start reads the new version.
A long-running Node server applies rotation on restart, and a deploy restarts it anyway. No TTL, no
reload endpoint, no admin socket.

## Development store

`@genoacms/adapter-secrets-env`:
- Its descriptor is `developmentOnly: true`, so a production build refuses it (R6).
- Its runtime requires `ctx.projectRoot`, which exists in the dev server, the CLI and development builds.
- The default path is `<projectRoot>/.genoacms/secrets.env`, not `.env`. Vite does not watch it, so `envDir: false` and `viteConfig.test.ts` go away (F11).
- Reads check, in order: this instance's own writes, then `process.env`, then the file. Writes update the instance's overlay. Today's adapter writes `process.env` to get the same effect, and without an overlay a shell variable would hide every later write, including a key rotation.
- Nothing is written into `process.env`.
- Cross-process `setSecretIfAbsent` keeps its lock file. File mode stays `0600`.

`.genoacms/` is added to `.gitignore`.

## Non-goals

- Live credential rotation inside a running process. Rotation takes effect on restart (*Caching and rotation*).
- More than one secrets provider.
- Mapping secret-store outages to HTTP 503. Errors stay 500, as today.

## Rejected alternatives

| Alternative | Why rejected |
| :-- | :-- |
| **`secret.json()` or sniffing a value's first character** | Ambiguous. JSON decoding is declared per option in the descriptor. |
| **Several secrets providers** | A write would have no defensible target. `env()` covers read-only platform secrets. |
| **Baking resolved secrets into the build** | The artifact would be a credential. `inline()` is the explicit, warned version of this, for operators who accept the trade. |
| **TTL-based live rotation, reload socket** | Reconstructing live clients under load is a source of bugs, it adds an attack surface, and every target restarts on deploy. Non-goal. |
