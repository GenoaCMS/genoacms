---
title: Deployment contract
---

A deployment target has no runtime. Its descriptor carries what `genoa build` and `genoa deploy` need:
the SvelteKit adapter that shapes the build for the platform, and the procedure that publishes it. A
worked example is under [adapters](/guide/adapters#A-deployment-target).

```ts
interface DeploymentDescriptor<O extends object> {
  readonly kind: 'deployment'
  readonly svelteKitAdapter: () => Promise<{ default: SvelteKitAdapterFactory }>
  readonly svelteKitOptions?: (options: O, ctx: { outDir: string }) => Record<string, unknown>
  readonly procedure: () => Promise<{ default: DeployProcedure<O> }>
  readonly secretOptions?: { readonly [K in keyof O]?: SecretEncoding }
  readonly validate?: (options: unknown) => string[]
}

interface DeployContext {
  readonly projectRoot: string
  readonly buildDir: string
  readonly workDir: string
  readonly target: string
}

type DeployProcedure<O extends object> = (options: Resolved<O>, ctx: DeployContext) => Promise<void>
```

- `svelteKitOptions` receives the target's options **unresolved**: credentials never influence a build.
- The procedure receives them resolved, on the operator's machine, with `buildDir` the artifact, `workDir` an empty scratch directory the deploy owns, and `target` the target's key.

The declarations as `@genoacms/contracts` ships them, with the descriptors of the other services:

@include ../../../../../../contracts/src/adapter.d.ts
