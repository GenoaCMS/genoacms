import { defineAuthenticationAdapter } from '@genoacms/contracts'

/**
 * @param {unknown} options
 * @returns {string[]}
 */
function validate (options) {
    const o = /** @type {Record<string, unknown>} */ (options ?? {})
    const reasons = Object.keys(o).filter(key => key !== 'credentials').map(key => `unknown option '${key}'`)
    if (o.credentials === undefined) reasons.push('credentials is required')
    return reasons
}

/** Credentials from a fixed list: a JSON array of { subject, email, password }. */
export default defineAuthenticationAdapter({
    runtime: '@genoacms/authentication-adapter-array/runtime',
    secretOptions: { credentials: 'json' },
    validate
})
