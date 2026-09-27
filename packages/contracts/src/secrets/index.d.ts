import type { Adapter } from './adapter.d.ts'

/**
 * The portable key rule every adapter enforces: the intersection of what the secret managers
 * accept, so a key valid in development stays valid in production.
 */
declare const SECRET_KEY_PATTERN: RegExp
declare function isValidSecretKey (key: string): boolean
declare function assertValidSecretKey (key: string): void

export { SECRET_KEY_PATTERN, isValidSecretKey, assertValidSecretKey }

/**
 * A secret store backing this instance.
 *
 * Unlike storage and database, **exactly one provider is expected**. A secret store is a single
 * authority: with two configured, `setSecret` has no defensible answer to "written where?", and a
 * key present in one but not the other would make authorization depend on lookup order. The
 * service treats more than one as a configuration error rather than picking.
 */
export type { Adapter }
