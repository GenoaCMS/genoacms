import { defineDeploymentTarget, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type ServiceAccount } from '../shared/serviceAccount.js'
import { SETTING_KEYS, validateSettings, type FunctionSettings } from './settings.js'

/** The function's settings; each defaults to today's behavior except `runtime` (architecture GD3). */
export interface GcpDeploymentOptions extends FunctionSettings {
  projectId: string
  region: string
  /** Default 'genoacms'. */
  functionName?: string
  /** Used by `genoa deploy` on the operator's machine only. Never embedded in the build. */
  credentials?: Secret<ServiceAccount>
}

declare module '@genoacms/contracts' {
  interface DeploymentTargets { '@genoacms/adapter-gcp/deployment': GcpDeploymentOptions }
}

/**
 * SDK-free: the build loads this to choose the SvelteKit adapter. Both loaders are lazy imports
 * resolved from this package, so neither the SvelteKit adapter nor the Cloud Functions SDK loads
 * until it is needed.
 */
export default defineDeploymentTarget<GcpDeploymentOptions>({
  svelteKitAdapter: async () => await import('@genoacms/sveltekit-adapter-cloud-run-functions'),
  svelteKitOptions: (_options, { outDir }) => ({ out: outDir }),
  procedure: async () => await import('./procedure.js'),
  secretOptions: { credentials: 'json' },
  validate: options => [
    ...unknownOptions(options, ['projectId', 'region', 'functionName', 'credentials', ...SETTING_KEYS]),
    ...requireString(options, 'projectId'),
    ...requireString(options, 'region'),
    ...validateSettings(options)
  ]
})
