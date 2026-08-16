/**
 * Where signing keys live in the secrets service.
 *
 * Pure and free of configuration, so the naming rules can be tested without booting a secrets
 * provider — and so nothing that only needs to know *where* a key is stored has to import the
 * machinery that reaches it.
 *
 * Names must satisfy the portable secret-key rule (`[A-Za-z_][A-Za-z0-9_]*`), which is the
 * intersection of what the secret managers accept. A `keyId` is lowercase hex, so a prefix plus an
 * id always does.
 */

/** The root trust anchor's seed. One per instance, for the lifetime of the trust anchor. */
const ROOT_SEED_SECRET = 'GENOACMS_ROOT_KEY_SEED'

/**
 * Subordinate seeds are named by `keyId`, one secret per key.
 *
 * That makes rotation additive: a new key writes a name nothing else uses, so rotating is never a
 * read-modify-write and cannot lose a key. Because `keyId` derives from the public key, the name is
 * a function of the key itself — a name already taken means two seeds produced one key, which is a
 * collision rather than a rotation.
 */
const SUBORDINATE_SEED_PREFIX = 'GENOACMS_SUBORDINATE_KEY_SEED_'

function subordinateSeedSecret (keyId: string): string {
  return `${SUBORDINATE_SEED_PREFIX}${keyId}`
}

/**
 * The highest key-registry sequence ever observed.
 *
 * Held here rather than beside the registry precisely because the secrets service is outside the
 * bucket: a high-water mark stored in the bucket could be rolled back together with the registry it
 * is supposed to date, which would leave it attesting to nothing.
 */
const REGISTRY_SEQUENCE_SECRET = 'GENOACMS_KEY_REGISTRY_SEQUENCE'

export {
  ROOT_SEED_SECRET,
  SUBORDINATE_SEED_PREFIX,
  REGISTRY_SEQUENCE_SECRET,
  subordinateSeedSecret
}
