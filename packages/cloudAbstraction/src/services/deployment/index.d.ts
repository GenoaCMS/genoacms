import type Adapter from './adapter.d.ts'

declare module '@genoacms/adapter-*/deployment' {
  import type Adapter from './adapter.d.ts'
  const svelteKitAdapter: Adapter.svelteKitAdapter
  const deployProcedure: Adapter.deployProcedure
  export {
    svelteKitAdapter,
    deployProcedure
  }
}

type DeploymentProvider<Extension extends object = object> = Extension & {
  name: string
  adapterPath: string
  adapter: Promise<typeof Adapter>
}

export type {
  Adapter,
  DeploymentProvider
}
