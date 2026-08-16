import { isSecretReference, type SecretReference } from '@genoacms/cloudabstraction/secrets'
import { getSecret } from './providers.server'

/**
 * Resolving the secret references that `genoa.config` carries in place of credentials.
 *
 * Keeping the value out of the configuration file is the point: `genoa.config` is committed to a
 * repository, so anything literal in it is a credential in version control.
 */

/**
 * Resolves a reference, or fails with a message an operator can act on.
 *
 * A missing secret **throws** rather than resolving to `undefined`. Every caller of this wants a
 * value it is about to depend on, and the alternative failure — carrying `undefined` into a signing
 * or verification routine — surfaces later, somewhere unrelated, as a cryptographic error rather
 * than as a configuration one.
 *
 * @param reference the configured pointer
 * @param field where it came from, so the error names the setting rather than just the key
 */
async function resolveSecretReference (reference: SecretReference, field: string): Promise<string> {
  if (!isSecretReference(reference)) {
    throw new Error(
      `secrets/invalid-reference: ${field} must be a secret reference such as { secret: 'MY_KEY' }, ` +
      'not a literal value'
    )
  }

  const value = await getSecret(reference.secret)
  if (value === undefined) {
    throw new Error(
      `secrets/missing: ${field} points at '${reference.secret}', which the configured secret store ` +
      'does not hold. Set it before starting GenoaCMS.'
    )
  }
  return value
}

export {
  resolveSecretReference
}
