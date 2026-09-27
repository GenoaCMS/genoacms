import { defineDatabaseAdapter } from '@genoacms/contracts'
import { unknownOptions, requireString } from '../shared.js'

export default defineDatabaseAdapter({
  runtime: '@genoacms/adapter-aws/database/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => [...unknownOptions(options, ['region', 'credentials']), ...requireString(options, 'region')]
})
