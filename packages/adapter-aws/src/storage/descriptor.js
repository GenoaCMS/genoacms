import { defineStorageAdapter } from '@genoacms/contracts'
import { unknownOptions, requireString } from '../shared.js'

export default defineStorageAdapter({
  runtime: '@genoacms/adapter-aws/storage/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => [...unknownOptions(options, ['region', 'credentials']), ...requireString(options, 'region')]
})
