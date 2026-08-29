/**
 * Types only — see `languageAdapter.d.ts`.
 *
 * A runtime module exists so that importing this subpath resolves at runtime as well as in the type
 * checker. Without it a bundler following the package's `import` condition would fail on a path
 * that has no JavaScript behind it.
 */

/**
 * The capability parameter every component's signature ends with.
 *
 * Shared rather than defined per package: the adapter emits it, the registrar refuses an attribute
 * that would collide with it, and the SDK supplies its value. Three packages, one spelling.
 *
 * The reservation is of the **identifier**, so `Passthrough` is a different parameter and is allowed.
 */
const PASSTHROUGH_PARAMETER = 'passthrough'

export { PASSTHROUGH_PARAMETER }
