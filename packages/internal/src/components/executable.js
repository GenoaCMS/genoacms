/**
 * Types only — see `executable.d.ts`.
 *
 * A runtime module exists so that importing this subpath resolves at runtime as well as in the type
 * checker. Without it a bundler following the package's `import` condition would fail on a path
 * that has no JavaScript behind it.
 */

export {}
