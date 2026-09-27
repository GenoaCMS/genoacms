import { building } from '$app/environment'
import { createHost } from '@genoacms/config/host'
import { manifest } from 'virtual:genoa/manifest'

/**
 * The specifier must stay opaque to the bundler: SvelteKit's adapters would otherwise pull each
 * adapter, and its cloud SDK, into the server bundle. At runtime the specifier resolves from the
 * artifact's node_modules, which the generated package.json provides.
 *
 * Refuses while SvelteKit analyses the build (architecture D8). Module-scope code that reaches a
 * provider must check `building` itself; this makes forgetting to do so fail the build by name,
 * rather than read from or write to a live instance.
 */
async function loadRuntime (specifier: string) {
  if (building) throw new Error(`host/building: ${specifier} was requested while SvelteKit analyses the build; module-scope provider I/O must check building`)
  return await import(/* @vite-ignore */ specifier)
}

/**
 * The one host of this process: every provider comes from here, and no other module reads the
 * manifest.
 *
 * The loader lives in core, not in @genoacms/config, so that the specifier stays opaque to the
 * bundler (see loadRuntime).
 */
export const host = createHost({
  manifest,
  load: loadRuntime
})
