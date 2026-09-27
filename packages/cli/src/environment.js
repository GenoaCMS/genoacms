/**
 * The facts the CLI hands across the process boundary to Vite and SvelteKit (architecture D7). Only
 * defined values are set, so an unset key means "use the default lookup", never an empty string.
 *
 * @param {{ root: string, file?: string, target?: string, mode: 'development'|'production' }} facts
 * @returns {Record<string, string>}
 */
function genoaEnvironment ({ root, file, target, mode }) {
  return {
    GENOA_PROJECT: root,
    GENOA_MODE: mode,
    ...(file === undefined ? {} : { GENOA_CONFIG: file }),
    ...(target === undefined ? {} : { GENOA_TARGET: target })
  }
}

export { genoaEnvironment }
