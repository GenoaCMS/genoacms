import type { Resolved, SecretEncoding } from './references.js'

/** SDK-free. The module at the specifier a config entry names. */
interface AdapterDescriptor<Kind extends string, O extends object> {
  readonly kind: Kind
  /** Bare specifier of the runtime module, e.g. '@genoacms/adapter-gcp/storage/runtime'. Never relative. */
  readonly runtime: string
  /** Top-level options that hold references, and how to decode them. A reference anywhere else is refused. */
  readonly secretOptions?: { readonly [K in keyof O]?: SecretEncoding }
  /** Refused by a production build. */
  readonly developmentOnly?: boolean
  /** Checks unresolved options. Returns the reasons they are invalid; an empty array means valid. */
  readonly validate?: (options: unknown) => string[]
}

interface AdapterContext {
  /** The provider's key in the config. For log lines and error messages, never for lookup. */
  readonly name: string
  /** Resources bound to this provider: bucket names for storage, database names for a database, otherwise empty. */
  readonly resources: readonly string[]
  /** Present in the dev server, the CLI and development builds. Absent in a production artifact. */
  readonly projectRoot?: string
}

/** Default export of a runtime module. */
interface AdapterRuntime<O extends object, Instance> {
  readonly create: (options: Resolved<O>, ctx: AdapterContext) => Instance | Promise<Instance>
}

/**
 * A SvelteKit adapter factory, typed structurally so this package needs no dependency on @sveltejs/kit.
 * `adapt` takes `never`: a real adapter's `adapt(builder: Builder)` is assignable to it, where it would
 * not be to `(builder: unknown) => unknown`.
 */
type SvelteKitAdapterFactory = (options?: Record<string, unknown>) => { name: string, adapt: (builder: never) => unknown }

/**
 * Both loaders are functions written inside the descriptor module, so each specifier resolves from
 * the adapter package that declares the dependency. Importing a SvelteKit adapter by name from core
 * fails under strict pnpm, where it is a dependency of the adapter package and of nothing else.
 */
interface DeploymentDescriptor<O extends object> {
  readonly kind: 'deployment'
  readonly svelteKitAdapter: () => Promise<{ default: SvelteKitAdapterFactory }>
  /** Receives unresolved options: credentials never influence the build. */
  readonly svelteKitOptions?: (options: O, ctx: { outDir: string }) => Record<string, unknown>
  readonly procedure: () => Promise<{ default: DeployProcedure<O> }>
  readonly secretOptions?: { readonly [K in keyof O]?: SecretEncoding }
  readonly validate?: (options: unknown) => string[]
}

interface DeployContext {
  readonly projectRoot: string
  /** Absolute path of the build artifact. */
  readonly buildDir: string
  /** Absolute scratch directory owned by this deploy. It exists and is empty when the procedure starts. */
  readonly workDir: string
  /** The target's key in `deployment.targets`. */
  readonly target: string
}

type DeployProcedure<O extends object> = (options: Resolved<O>, ctx: DeployContext) => Promise<void>

export type { AdapterDescriptor, AdapterContext, AdapterRuntime, SvelteKitAdapterFactory, DeploymentDescriptor, DeployContext, DeployProcedure }
