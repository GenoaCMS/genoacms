import type { SecretEncoding } from '@genoacms/contracts'
import type { Adapter as SecretsAdapter } from '@genoacms/contracts/secrets'
import { isEnvRef, isInlineRef, isSecretRef } from '../references.js'
import { HostError } from './errors.js'
import type { SecretCache } from './secretCache.js'

interface ResolveDeps {
  readonly secrets: () => Promise<SecretsAdapter>
  readonly environment: Readonly<Record<string, string | undefined>>
  readonly cache: SecretCache
  readonly timeoutMs: number
}

/** Rejects with `onTimeout()` if `promise` has not settled in `ms`; the timer never outlives the race. */
async function withTimeout<T> (promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(onTimeout()) }, ms) })
  try {
    return await Promise.race([promise, deadline])
  } finally {
    clearTimeout(timer)
  }
}

async function readSecret (key: string, path: string, deps: ResolveDeps): Promise<string> {
  const value = await deps.cache.get(key, async () => await withTimeout(
    deps.secrets().then(async store => await store.getSecret(key)),
    deps.timeoutMs,
    () => new HostError('provider/secret-unavailable', `${path} → ${key}: no answer within ${deps.timeoutMs} ms`)
  ))
  if (value === undefined) {
    throw new HostError('secrets/missing', `${path} points at '${key}', which the configured secret store does not hold. Set it before starting GenoaCMS.`)
  }
  return value
}

function readEnvironment (variable: string, path: string, deps: ResolveDeps): string {
  const value = deps.environment[variable]
  if (value === undefined) throw new HostError('secrets/env-missing', `${path} reads ${variable}, which is not set`)
  return value
}

/** The parse error is dropped on purpose: its message would quote part of the credential. */
function decode (text: string, encoding: SecretEncoding | undefined, path: string): unknown {
  if (encoding !== 'json') return text
  try {
    return JSON.parse(text)
  } catch {
    throw new HostError('secrets/invalid-json', `${path} is declared JSON and is not valid JSON`)
  }
}

async function resolveField (value: unknown, encoding: SecretEncoding | undefined, path: string, deps: ResolveDeps): Promise<unknown> {
  if (isInlineRef(value)) return value.$inline
  if (isEnvRef(value)) return decode(readEnvironment(value.$env, path, deps), encoding, path)
  if (isSecretRef(value)) return decode(await readSecret(value.$secret, path, deps), encoding, path)
  throw new HostError('config/bare-secret', `${path} is a credential field and holds no reference`)
}

/**
 * Replaces every reference in one provider's options with its value. Fields the descriptor does not
 * list as credentials are copied: the loader already refused references anywhere else. All fields
 * resolve concurrently, so a provider costs one round trip of latency.
 */
async function resolveOptions (
  options: Readonly<Record<string, unknown>>,
  secretOptions: Readonly<Record<string, SecretEncoding>>,
  path: string,
  deps: ResolveDeps
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(Object.entries(options).map(async ([key, value]) => {
    if (!Object.hasOwn(secretOptions, key)) return [key, value] as const
    return [key, await resolveField(value, secretOptions[key], `${path}.${key}`, deps)] as const
  }))
  return Object.fromEntries(entries)
}

export { resolveOptions, withTimeout }
export type { ResolveDeps }
