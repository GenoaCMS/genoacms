# `@genoacms/contracts`

The only package a GenoaCMS adapter depends on: the service contracts, the adapter descriptor and
runtime types, the secret reference types, and the collection schema helpers. It carries no loader,
no Vite and no rollup.

## Descriptor and runtime

An adapter ships two modules per service.

- The **descriptor** is what a config entry names. It declares the service `kind`, which options are
  credentials (`secretOptions`), whether it is `developmentOnly`, an option validator (`validate`), and the bare
  specifier of its runtime. It must import nothing but this package: the build loads every descriptor
  to validate the config and choose a SvelteKit adapter, and an SDK imported here would load there.
- The **runtime** exports `{ create(options, ctx) }`, called once per configured provider with its
  references already resolved. Two providers naming one adapter are two `create` calls.

```js
export default defineStorageAdapter({
  runtime: '@example/adapter/storage/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => []
})
```

## Typed options

Register an adapter's option type by module augmentation, keyed by its descriptor specifier:

```ts
declare module '@genoacms/contracts' {
  interface StorageAdapters { '@example/adapter/storage': ExampleStorageOptions }
}
```

A credential field is typed `Secret<T>`: it accepts `secret()`, `env()` or `inline()`, never a bare
value.

## The bootstrap rule

The secrets provider resolves every `secret()`, so it cannot be configured with one.
`defineSecretsAdapter` refuses, at compile time, an options type with a `Secret<T>` field anywhere in
it; use `BootstrapSecret<T>` (`env()` or `inline()` only).

See [`docs/architecture/configuration.md`](../../docs/architecture/configuration.md).
