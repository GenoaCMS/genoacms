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

/*
 * **Nothing platform-specific belongs here.** A `dom` parameter carrying DOM constructors lived in
 * this file for part of 1 September 2026, which was wrong: this vocabulary is shared by every
 * adapter and every target, and GenoaCMS is headless — a consumer may be a native application with
 * no `Element` in it. `passthrough` stays because it is a plain object a consumer chooses to fill,
 * which means the same thing on any platform. What an adapter reserves beyond it is that adapter's,
 * and is refused where that adapter emits its signature.
 */

export { PASSTHROUGH_PARAMETER }
