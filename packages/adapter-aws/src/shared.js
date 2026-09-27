const asRecord = (options) => typeof options === 'object' && options !== null ? options : {}

/**
 * Reasons for option keys outside `allowed`. Every descriptor rejects unknown keys so typos fail the build.
 *
 * @param {unknown} options
 * @param {readonly string[]} allowed
 * @returns {string[]}
 */
export function unknownOptions (options, allowed) {
  return Object.keys(asRecord(options)).filter(key => !allowed.includes(key)).map(key => `unknown option '${key}'`)
}

/**
 * @param {unknown} options
 * @param {string} key
 * @returns {string[]}
 */
export function requireString (options, key) {
  const value = asRecord(options)[key]
  return typeof value === 'string' && value !== '' ? [] : [`${key} is required and must be a non-empty string`]
}

/**
 * An AWS client configuration. Omitted credentials mean the SDK's default provider chain: the
 * runtime's own role on AWS, the operator's profile elsewhere.
 *
 * @param {string} region
 * @param {import('./shared.js').AwsCredentials} [credentials]
 */
export function clientConfig (region, credentials) {
  return credentials === undefined ? { region } : { region, credentials }
}
