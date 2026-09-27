/** A value fetched from the configured secrets provider when a provider is constructed. */
interface SecretRef { readonly $secret: string }
/** A value read from the process environment when a provider is constructed. */
interface EnvRef { readonly $env: string }
/** A literal that travels with the build. Visible by design: a search for `inline(` finds every one. */
interface InlineRef<T> { readonly $inline: T }

/** An option that holds a credential. `T` is the resolved type: `string`, or an object for JSON credentials. */
type Secret<T = string> = SecretRef | EnvRef | InlineRef<T>
/** A credential the secrets provider itself may take. It cannot reference the store it configures. */
type BootstrapSecret<T = string> = EnvRef | InlineRef<T>

/** How a `secret()` or `env()` string becomes the option's value. `inline()` values are never decoded. */
type SecretEncoding = 'string' | 'json'

type ResolvedValue<V> =
  [V] extends [SecretRef | EnvRef | InlineRef<infer T>] ? T :
  V extends ReadonlyArray<infer E> ? Array<ResolvedValue<E>> :
  V extends object ? Resolved<V> : V

/** Options as `create` receives them: every reference replaced by its value. Optional fields stay optional. */
type Resolved<O> = {
  [K in keyof O]: ResolvedValue<NonNullable<O[K]>> | (undefined extends O[K] ? undefined : never)
}

/** True when any field of O, at any depth, accepts a SecretRef. */
type ContainsSecretRef<O> = true extends {
  [K in keyof O]-?: [Extract<NonNullable<O[K]>, SecretRef>] extends [never]
    ? (NonNullable<O[K]> extends object ? ContainsSecretRef<NonNullable<O[K]>> : false)
    : true
}[keyof O] ? true : false

export type { SecretRef, EnvRef, InlineRef, Secret, BootstrapSecret, SecretEncoding, ResolvedValue, Resolved, ContainsSecretRef }
