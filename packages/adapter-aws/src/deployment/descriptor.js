import { defineDeploymentTarget } from '@genoacms/contracts'
import { unknownOptions, requireString } from '../shared.js'

const ALLOWED = ['region', 'role', 'accountId', 'artifactBucket', 'functionName', 'credentials']

/**
 * Lambda behind API Gateway. SDK-free: both loaders are lazy imports resolved from this package.
 */
export default defineDeploymentTarget({
  svelteKitAdapter: async () => await import('@sveltejs/adapter-node'),
  svelteKitOptions: (_options, { outDir }) => ({ out: outDir }),
  procedure: async () => await import('./procedure.js'),
  secretOptions: { credentials: 'json' },
  validate: options => [
    ...unknownOptions(options, ALLOWED),
    ...['region', 'role', 'accountId', 'artifactBucket'].flatMap(key => requireString(options, key))
  ]
})
