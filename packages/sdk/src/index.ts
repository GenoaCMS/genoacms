/**
 * The GenoaCMS client SDK.
 *
 * The package root is the **web** SDK: it fetches, verifies, executes and renders. Executing a
 * `web-esmodule` needs an ES module host and rendering is framework-specific, so neither is portable
 * and neither pretends to be — other platforms are third-party work against the verification
 * specification, and `@genoacms/sdk/verify` is the half that specification describes.
 *
 * A consumer that only wants a verdict imports `./verify` and never ships an executor it cannot use.
 * One that renders imports this, and the two halves meet at `renderPage`, which takes a `Verifier`
 * and a tree that verifier has already accepted.
 */

export * from './verify/index.js'
export { renderPage, renderResolved, isNode } from './execute/render.js'
export { resolvePage, isChildren, componentsUsed, missingComponents } from './execute/resolve.js'
export { loadModule, entryFunction, defaultLoader } from './execute/module.js'
export type {
  Rendered, RenderOptions, PrebuiltComponents, ComponentFunction, NodeFailure
} from './execute/render.js'
export type { ResolvedNode, ResolvedValue, Resolved } from './execute/resolve.js'
export type { ModuleLoader, ModuleNamespace, Loaded } from './execute/module.js'
