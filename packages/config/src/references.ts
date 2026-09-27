import { assertValidSecretKey } from '@genoacms/contracts/secrets'
import type { SecretRef, EnvRef, InlineRef } from '@genoacms/contracts'

/** A pointer to a value in the configured secret store. The key must follow the portable key rule. */
function secret (key: string): SecretRef {
  assertValidSecretKey(key)
  return { $secret: key }
}

/** A pointer to a process environment variable, read when the provider is constructed. */
function env (variable: string): EnvRef {
  if (variable === '') throw new Error('config/invalid-env-reference: env() needs a variable name')
  return { $env: variable }
}

/** A literal credential that travels with the build. The production build warns once per field. */
function inline<T> (value: T): InlineRef<T> {
  return { $inline: value }
}

function isPlainObject (value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Exactly one own key. An object with extra keys is not a reference, so a hand-written
 * `{ $secret: 'K', note: '…' }` is refused as a misplaced value rather than half-understood.
 */
const hasOnlyKey = (value: unknown, key: string): value is Record<string, unknown> =>
  isPlainObject(value) && Object.keys(value).length === 1 && Object.hasOwn(value, key)

const isSecretRef = (value: unknown): value is SecretRef =>
  hasOnlyKey(value, '$secret') && typeof value.$secret === 'string'

const isEnvRef = (value: unknown): value is EnvRef =>
  hasOnlyKey(value, '$env') && typeof value.$env === 'string'

const isInlineRef = (value: unknown): value is InlineRef<unknown> =>
  hasOnlyKey(value, '$inline')

const isReference = (value: unknown): value is SecretRef | EnvRef | InlineRef<unknown> =>
  isSecretRef(value) || isEnvRef(value) || isInlineRef(value)

export { secret, env, inline, isSecretRef, isEnvRef, isInlineRef, isReference, isPlainObject }
