---
title: '@genoacms/config'
---

The package a config is written with, and the loader, host and build integration that read it. What
a config means is under [configuration](/guide/config/structure); this page is the API.

| Entry point | Exports | For |
| :--- | :--- | :--- |
| `@genoacms/config` | `defineConfig`, the provider helpers, `secret`, `env`, `inline`, the config types | config authors |
| `@genoacms/config/load` | `loadConfig`, `LoadOptions` | tooling |
| `@genoacms/config/host` | `createHost` | tooling |
| `@genoacms/config/vite` | `genoa()` | core's Vite config |
| `@genoacms/config/build` | the artifact's `package.json` | the CLI |

## Authoring

`defineConfig(config)` returns its argument. It exists so TypeScript infers each stanza's provider
names and checks every reference to them: a bucket naming a provider that does not exist is a type
error.

@include ../../../../../config/src/config.ts

### Provider helpers

One per service, so an adapter's options are looked up in that service's registry. Each returns
`{ adapter, options }`.

@include ../../../../../config/src/providers.ts

### References

| Helper | Returns | Resolved |
| :--- | :--- | :--- |
| `secret(key)` | `{ $secret: key }` | from the configured secrets provider, when the provider using it is constructed |
| `env(variable)` | `{ $env: variable }` | from `process.env`, at the same moment |
| `inline(value)` | `{ $inline: value }` | never: the value travels with the build |

A credential option's type, `Secret<T>`, admits all three; the secrets provider's own options are
`BootstrapSecret<T>`, which admits `env()` and `inline()` only. See [secrets](/guide/config/secrets).

## Loading

```ts
interface LoadOptions {
  /** Absolute project root. */
  root: string
  /** Absolute config file. Omitted: the default lookup under `root`. */
  file?: string
  mode: 'development' | 'production'
  /** `genoa build --no-inline`: inline() becomes an error in production mode. */
  forbidInline?: boolean
  /** Receives warnings (code 'config/inline'). Default: console.warn. */
  onWarning?: (issue: ConfigIssue) => void
}

declare function loadConfig (options: LoadOptions): Promise<Manifest>
```

`loadConfig` evaluates the config, loads every adapter's descriptor, validates the whole config, and
resolves to a `Manifest`, or rejects with a `ConfigError` holding every problem it found, each with a
code and a path; the codes are listed under
[services](/guide/config/services#When-a-config-does-not-load). It resolves no secret and reaches
no provider. Loads of one file and mode are memoized per process.

@include ../../../../../config/src/manifest.ts

The `RuntimeManifest` is what a build embeds: the deployment stanza and every deployment adapter are
left out, so a target's options, credentials included, never enter the artifact.

## The host

`createHost({ manifest, load })` returns the one object per process that constructs providers. It does
no I/O until a provider is asked for; then it resolves that provider's references, calls its runtime's
`create`, and caches the instance by provider name, so two providers of one adapter are two instances.
Core creates one host per server process, and the CLI one per command. Tooling that needs a
constructed provider outside core — a migration script, a backup — creates its own, with a manifest
from `loadConfig` and `load: specifier => import(specifier)`.

## Build integration

`genoa()` is the Vite plugin core's `vite.config.ts` uses. It loads the config, exposes the runtime
manifest to core as a virtual module, restarts the dev server when the config or anything it imports
changes, and leaves adapter runtimes external to the bundle. The CLI passes it what to load through
four environment variables, the only facts that cross from the CLI into Vite:

| Variable | Holds |
| :--- | :--- |
| `GENOA_PROJECT` | the absolute project root |
| `GENOA_CONFIG` | the absolute config file; unset, the default lookup |
| `GENOA_TARGET` | the deployment target, when building |
| `GENOA_MODE` | `development` or `production` |

A relative path in `GENOA_PROJECT` or `GENOA_CONFIG` is an error. The CLI never lets Vite inherit
these from your shell: it sets each one itself.
