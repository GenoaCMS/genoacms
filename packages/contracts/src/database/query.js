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

const PARAMETER_NAMES = ['where', 'limit', 'pageToken']
const LIMIT_MAXIMUM = 1000
const SMALLEST_MAGNITUDE = 1e-130
const LARGEST_MAGNITUDE = 1e126

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
 * @param {unknown[]} array
 * @returns {boolean}
 */
const isDense = (array) => Object.keys(array).length === array.length

/**
 * DATA-8: throws Error('database/invalid-query: <reason>') unless params match the types.
 *
 * @param {import('./types.d.ts').QueryParams | undefined} params
 */
function checkQuery (params) {
  if (params === undefined) return
  if (!isPlainObject(params)) refuseQuery('the parameters are not an object')
  const unknown = Object.keys(params).find(name => !PARAMETER_NAMES.includes(name))
  if (unknown !== undefined) refuseQuery(`unknown parameter ${unknown}`)
  const { where, limit, pageToken } = params
  if (where !== undefined) {
    if (!Array.isArray(where) || !isDense(where)) refuseQuery('where is not a dense array')
    where.forEach(checkCondition)
  }
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1 && limit <= LIMIT_MAXIMUM)) refuseQuery(`limit is not an integer from 1 to ${LIMIT_MAXIMUM}`)
  if (pageToken !== undefined && typeof pageToken !== 'string') refuseQuery('pageToken is not a string')
}

/**
 * @param {number} number
 * @returns {boolean}
 */
const isHoldableNumber = (number) =>
  Number.isFinite(number) &&
  (number === 0 || (Math.abs(number) >= SMALLEST_MAGNITUDE && Math.abs(number) <= LARGEST_MAGNITUDE))

/**
 * @param {string} text
 * @returns {boolean}
 */
const isHoldableString = (text) => text.isWellFormed() && !text.includes('\u0000')

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isHoldableScalar = (value) =>
  value === null ||
  typeof value === 'boolean' ||
  (typeof value === 'string' && isHoldableString(value)) ||
  (typeof value === 'number' && isHoldableNumber(value))

/**
 * @param {string} path
 * @returns {never}
 */
const refuseValue = (path) => {
  throw new Error(`database/unsupported-value: ${path}`)
}

/**
 * @param {unknown[]} array
 * @param {string} path
 * @param {object[]} ancestors
 */
const checkItems = (array, path, ancestors) => {
  if (!isDense(array)) refuseValue(path)
  array.forEach((item, index) => {
    if (Array.isArray(item)) refuseValue(`${path}.${index}`)
    checkValue(item, `${path}.${index}`, ancestors)
  })
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {object[]} ancestors
 */
function checkValue (value, path, ancestors) {
  if (isHoldableScalar(value)) return
  if (typeof value !== 'object' || value === null || ancestors.includes(value)) refuseValue(path)
  if (Array.isArray(value)) return checkItems(value, path, [...ancestors, value])
  if (!isPlainObject(value)) refuseValue(path)
  checkFields(/** @type {Record<string, unknown>} */ (value), `${path}.`, [...ancestors, value])
}

/**
 * @param {Record<string, unknown>} fields
 * @param {string} prefix
 * @param {object[]} ancestors
 */
function checkFields (fields, prefix, ancestors) {
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) checkValue(value, `${prefix}${name}`, ancestors)
  }
}

/**
 * DATA-2: throws Error('database/unsupported-value: <path>') for the first value that is not
 * held by every store.
 *
 * @param {Record<string, unknown>} data
 */
function checkValues (data) {
  checkFields(data, '', [data])
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
