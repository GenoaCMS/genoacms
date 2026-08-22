/**
 * The package entry point.
 *
 * Deliberately empty: the package is created before the modules that will live in it, so that each
 * of those arrives as a move with its own history rather than as part of a larger change.
 *
 * Modules are exported both from here and under their own subpath — `./authorization`, and so on —
 * following `@genoacms/cloudabstraction`, so a consumer can import one contract without loading the
 * rest. See the README for what belongs here.
 */

export {}
