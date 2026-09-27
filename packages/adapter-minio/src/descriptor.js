import { defineStorageAdapter } from '@genoacms/contracts'

const ALLOWED = ['endPoint', 'port', 'useSSL', 'region', 'accessKey', 'secretKey']

/**
 * @param {unknown} options
 * @returns {string[]}
 */
function validate (options) {
  const o = /** @type {Record<string, unknown>} */ (options ?? {})
  const reasons = Object.keys(o).filter(key => !ALLOWED.includes(key)).map(key => `unknown option '${key}'`)
  if (typeof o.endPoint !== 'string' || o.endPoint === '') reasons.push('endPoint is required and must be a non-empty string')
  if (o.port !== undefined && (!Number.isInteger(o.port) || o.port < 1 || o.port > 65535)) reasons.push('port must be an integer between 1 and 65535')
  if (o.useSSL !== undefined && typeof o.useSSL !== 'boolean') reasons.push('useSSL must be a boolean')
  if (o.accessKey === undefined) reasons.push('accessKey is required')
  if (o.secretKey === undefined) reasons.push('secretKey is required')
  return reasons
}

export default defineStorageAdapter({
  runtime: '@genoacms/adapter-minio/runtime',
  secretOptions: { accessKey: 'string', secretKey: 'string' },
  validate
})
