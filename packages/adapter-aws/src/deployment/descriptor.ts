import { defineDeploymentTarget, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type AwsCredentials } from '../shared.js'
import { SETTING_KEYS, validateSettings, type FunctionSettings } from './settings.js'

const REQUIRED = ['region', 'role', 'artifactBucket']

export interface AwsDeploymentOptions extends FunctionSettings {
  region: string
  /** The execution role's ARN. */
  role: string
  /** The S3 bucket the deployment archive is uploaded to. */
  artifactBucket: string
  /** Used by `genoa deploy` on the operator's machine only. Omitted: the SDK's default chain. */
  credentials?: Secret<AwsCredentials>
}

declare module '@genoacms/contracts' {
  interface DeploymentTargets { '@genoacms/adapter-aws/deployment': AwsDeploymentOptions }
}

// LMB-1, LMB-2
export default defineDeploymentTarget<AwsDeploymentOptions>({
  svelteKitAdapter: async () => await import('@sveltejs/adapter-node'),
  svelteKitOptions: (_options, { outDir }) => ({ out: outDir }),
  procedure: async () => await import('./procedure.js'),
  secretOptions: { credentials: 'json' },
  validate: options => [
    ...unknownOptions(options, [...REQUIRED, 'credentials', ...SETTING_KEYS]),
    ...REQUIRED.flatMap(key => requireString(options, key)),
    ...validateSettings(options)
  ]
})
