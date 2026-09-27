import type { Plugin, ViteDevServer } from 'vite'
import { loadConfig, clearLoadCache } from '../load/index.js'
import { readGenoaEnvironment, type GenoaEnvironment } from '../environment.js'
import { toRuntimeManifest, type Manifest } from '../manifest.js'

const MANIFEST_ID = 'virtual:genoa/manifest'
const RESOLVED_MANIFEST_ID = `\0${MANIFEST_ID}`

interface GenoaPluginOptions {
  /** Override GENOA_PROJECT; tests use it. */
  root?: string
  /** Override GENOA_CONFIG; tests use it. */
  file?: string
}

const manifestModule = (manifest: Manifest): string =>
  `export const manifest = ${JSON.stringify(toRuntimeManifest(manifest))}\n`

/**
 * Restarting, rather than invalidating the virtual module, is deliberate: constructed providers hold
 * clients built from the old options, and every module that imported the host holds the old host.
 */
function watchConfig (server: ViteDevServer, dependencies: readonly string[]): void {
  const watched = new Set(dependencies)
  server.watcher.add([...watched])
  server.watcher.on('change', (changed) => {
    if (!watched.has(changed)) return
    clearLoadCache()
    void server.restart()
  })
}

/**
 * Serves the runtime manifest as `virtual:genoa/manifest`.
 *
 * The config is loaded once per process and mode: SvelteKit resolves the Vite config several times
 * per build, and each resolution reaches `configResolved`.
 */
function genoa (options: GenoaPluginOptions = {}): Plugin {
  let environment: GenoaEnvironment
  let manifest: Manifest

  return {
    name: 'genoacms',
    enforce: 'pre',

    config (_config, { command }) {
      const read = readGenoaEnvironment(command === 'serve' ? 'development' : 'production')
      environment = {
        ...read,
        root: options.root ?? read.root,
        ...(options.file === undefined ? {} : { file: options.file })
      }
    },

    async configResolved () {
      manifest = await loadConfig({ root: environment.root, file: environment.file, mode: environment.mode })
    },

    resolveId (id) {
      return id === MANIFEST_ID ? RESOLVED_MANIFEST_ID : null
    },

    load (id) {
      return id === RESOLVED_MANIFEST_ID ? manifestModule(manifest) : null
    },

    configureServer (server) {
      watchConfig(server, manifest.source?.dependencies ?? [])
    }
  }
}

export { genoa }
export type { GenoaPluginOptions }
