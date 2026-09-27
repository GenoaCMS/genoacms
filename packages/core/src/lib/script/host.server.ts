import { createHost } from '@genoacms/config/host'
import { manifest } from 'virtual:genoa/manifest'

/**
 * The one host of this process: every provider comes from here, and no other module reads the
 * manifest.
 *
 * The loader lives in core, not in @genoacms/config, because the specifier must stay opaque to the
 * bundler: SvelteKit's adapters would otherwise pull each adapter, and its cloud SDK, into the
 * server bundle. At runtime the specifier resolves from the artifact's node_modules, which the
 * generated package.json provides.
 */
export const host = createHost({
  manifest,
  load: async (specifier) => await import(/* @vite-ignore */ specifier)
})
