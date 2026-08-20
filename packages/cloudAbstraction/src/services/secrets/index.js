/**
 * The portable secret-key rule, shared by every secrets adapter.
 *
 * Secret managers disagree about what a key may be called: GCP allows `-`, AWS allows `/` and `.`,
 * and an environment variable allows neither. The contract therefore fixes the **intersection**,
 * so a key that works against the `.env` emulator in development still works against a cloud
 * secret manager in production. An adapter widening this on its own would make that stop being
 * true, silently and only after deployment.
 */
const SECRET_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * @param {string} key
 * @returns {boolean}
 */
function isValidSecretKey (key) {
  return SECRET_KEY_PATTERN.test(key)
}

/**
 * Throws rather than normalising. Folding `a-b` and `a_b` onto one name would silently merge two
 * distinct secrets, and the one that lost would look like it had simply never been written.
 *
 * @param {string} key
 */
function assertValidSecretKey (key) {
  if (!isValidSecretKey(key)) {
    throw new Error(`invalid-secret-key: '${key}' must match ${SECRET_KEY_PATTERN.source}`)
  }
}

/**
 * Whether a configuration value is a pointer to a secret rather than the secret itself.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isSecretReference (value) {
  return typeof value === 'object' &&
    value !== null &&
    typeof (/** @type {{ secret?: unknown }} */ (value).secret) === 'string'
}

export {
  SECRET_KEY_PATTERN,
  isValidSecretKey,
  assertValidSecretKey,
  isSecretReference
}
