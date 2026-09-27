import type { DeploymentDescriptor } from '@genoacms/contracts'

export interface NodeDeploymentOptions {
  /** Where `genoa deploy` copies the artifact. Relative to the project root. Default 'build'. */
  outDir?: string
}

declare module '@genoacms/contracts' {
  interface DeploymentTargets { '@genoacms/adapter-node': NodeDeploymentOptions }
}

declare const descriptor: DeploymentDescriptor<NodeDeploymentOptions>
export default descriptor
