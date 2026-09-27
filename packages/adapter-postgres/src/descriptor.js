import { defineDatabaseAdapter } from '@genoacms/contracts'

const ALLOWED = ['host', 'port', 'database', 'user', 'password']

const isNonEmptyString = (value) => typeof value === 'string' && value !== ''

/**
 * @param {unknown} options
 * @returns {string[]}
 */
function validate (options) {
  const o = /** @type {Record<string, unknown>} */ (options ?? {})
  const reasons = Object.keys(o).filter(key => !ALLOWED.includes(key)).map(key => `unknown option '${key}'`)
  for (const key of ['host', 'database', 'user']) {
    if (!isNonEmptyString(o[key])) reasons.push(`${key} is required and must be a non-empty string`)
  }
  if (o.password === undefined) reasons.push('password is required')
  if (o.port !== undefined && !Number.isInteger(o.port)) reasons.push('port must be an integer')
  return reasons
}

export default defineDatabaseAdapter({
  runtime: '@genoacms/adapter-postgres/runtime',
  secretOptions: { password: 'string' },
  validate
})
