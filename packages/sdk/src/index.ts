/**
 * The GenoaCMS client SDK.
 *
 * The package root is the **web** SDK: it fetches, verifies, executes and renders. Executing a
 * `web-esmodule` needs an ES module host and rendering is framework-specific, so neither is portable
 * and neither pretends to be — other platforms are third-party work against the verification
 * specification, and `@genoacms/sdk/verify` is the half that specification describes.
 *
 * Execution and rendering arrive with the later steps of this phase; until then the root re-exports
 * verification so a consumer has one import to start from.
 */

export * from './verify/index.js'
