import type { DeploymentDescriptor } from '@genoacms/contracts'

export interface NodeDeploymentOptions {
  /** Where `genoa deploy` copies the artifact. Relative to the project root. Default 'build'. */
  outDir?: string
  /** Given to the build as SvelteKit's paths.origin: the origin browsers use. Needed when the server is reached over plain HTTP (architecture build.md U20). */
  origin?: string
}

declare module '@genoacms/contracts' {
  interface DeploymentTargets { '@genoacms/adapter-node': NodeDeploymentOptions }
}

declare const descriptor: DeploymentDescriptor<NodeDeploymentOptions>
export default descriptor
