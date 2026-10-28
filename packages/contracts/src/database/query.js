const OPERATORS = ['==', '!=', '<', '<=', '>', '>=']
const UNKNOWN_PAGE_TOKEN = 'database/invalid-query: unknown page token'

/**
 * @param {string} reason
 * @returns {never}
 */
const refuseQuery = (reason) => {
  throw new Error(`database/invalid-query: ${reason}`)
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isComparable = (value) =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value))

/**
 * @param {unknown} condition
 * @param {number} index
 */
const checkCondition = (condition, index) => {
  const candidate = /** @type {{ field?: unknown, operator?: unknown, value?: unknown } | null} */ (condition)
  if (typeof candidate !== 'object' || candidate === null) refuseQuery(`where[${index}] is not a condition`)
  if (typeof candidate?.field !== 'string') refuseQuery(`where[${index}].field is not a string`)
  if (!OPERATORS.includes(/** @type {string} */ (candidate?.operator))) refuseQuery(`where[${index}].operator is not one of ${OPERATORS.join(' ')}`)
  if (!isComparable(candidate?.value)) refuseQuery(`where[${index}].value is not a string, a finite number, a boolean or null`)
}

/**
 * DATA-8: throws Error('database/invalid-query: <reason>') unless params match the types.
 *
 * @param {import('./types.d.ts').QueryParams | undefined} params
 */
function checkQuery (params) {
  if (params === undefined) return
  const { where, limit, pageToken } = params
  if (where !== undefined) {
    if (!Array.isArray(where)) refuseQuery('where is not an array')
    where.forEach(checkCondition)
  }
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1)) refuseQuery('limit is not an integer of at least 1')
  if (pageToken !== undefined && typeof pageToken !== 'string') refuseQuery('pageToken is not a string')
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isPlainObject = (value) => {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isJsonScalar = (value) =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value))

/**
 * @param {unknown} value
 * @param {string} path
 */
const checkValue = (value, path) => {
  if (isJsonScalar(value)) return
  if (Array.isArray(value)) return value.forEach((item, index) => checkValue(item, `${path}.${index}`))
  if (!isPlainObject(value)) throw new Error(`database/unsupported-value: ${path}`)
  checkFields(/** @type {Record<string, unknown>} */ (value), `${path}.`)
}

/**
 * @param {Record<string, unknown>} fields
 * @param {string} prefix
 */
const checkFields = (fields, prefix) => {
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) checkValue(value, `${prefix}${name}`)
  }
}

/**
 * DATA-2: throws Error('database/unsupported-value: <path>') for the first value that is not JSON.
 *
 * @param {Record<string, unknown>} data
 */
function checkValues (data) {
  checkFields(data, '')
}

/**
 * @param {string | number | boolean} left
 * @param {string | number | boolean} right
 * @returns {number}
 */
const compare = (left, right) => {
  if (typeof left === 'string') return Buffer.compare(Buffer.from(left), Buffer.from(/** @type {string} */ (right)))
  return Number(left) - Number(right)
}

/**
 * @param {import('./types.d.ts').Condition['operator']} operator
 * @param {number} order
 * @returns {boolean}
 */
const holdsFor = (operator, order) => {
  switch (operator) {
    case '==': return order === 0
    case '!=': return order !== 0
    case '<': return order < 0
    case '<=': return order <= 0
    case '>': return order > 0
    default: return order >= 0
  }
}

/**
 * @param {Record<string, unknown>} data
 * @param {import('./types.d.ts').Condition} condition
 * @returns {boolean}
 */
const matchesCondition = (data, { field, operator, value }) => {
  const stored = Object.hasOwn(data, field) ? data[field] : undefined
  if (stored === undefined || typeof stored !== typeof value) return false
  if (value === null) return stored === null && operator === '=='
  if (stored === null) return false
  return holdsFor(operator, compare(/** @type {string} */ (stored), /** @type {string} */ (value)))
}

/**
 * DATA-9: whether data (with its key field) matches every condition. For adapters that filter in
 * process.
 *
 * @param {Record<string, unknown>} data
 * @param {import('./types.d.ts').Condition[]} conditions
 * @returns {boolean}
 */
function matches (data, conditions) {
  return conditions.every(condition => matchesCondition(data, condition))
}

/**
 * DATA-10: an opaque page token, base64url of the JSON of a value.
 *
 * @param {unknown} value
 * @returns {string}
 */
function encodeToken (value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/**
 * DATA-8: throws Error('database/invalid-query: unknown page token') for what encodeToken did not
 * issue.
 *
 * @param {unknown} token
 * @returns {any}
 */
function decodeToken (token) {
  if (typeof token !== 'string' || token === '') throw new Error(UNKNOWN_PAGE_TOKEN)
  try {
    const value = JSON.parse(Buffer.from(token, 'base64url').toString())
    if (encodeToken(value) !== token) throw new Error(UNKNOWN_PAGE_TOKEN)
    return value
  } catch {
    throw new Error(UNKNOWN_PAGE_TOKEN)
  }
}

export {
  checkQuery,
  checkValues,
  matches,
  encodeToken,
  decodeToken
}
