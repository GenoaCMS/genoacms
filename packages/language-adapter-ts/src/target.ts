/**
 * The ECMAScript level output is lowered to when the instance does not choose one.
 *
 * Its own module, and not `config.ts`, because it is a constant rather than a setting: reading it
 * should not require an instance to exist. `config.ts` reaches `genoa.config` the moment it is
 * imported, so anything re-exporting a value from there drags a deployment's configuration into
 * every consumer of this package — including the evidence harness, which measures the ruleset and
 * has no target to speak of.
 */
const DEFAULT_TARGET = 'es2020'

export { DEFAULT_TARGET }
