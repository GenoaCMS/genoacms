import { ConfigError, type ConfigIssue } from '../errors.js'
import type { Manifest } from '../manifest.js'
import { locateConfigFile } from './locate.js'
import { evaluateConfigModule } from './evaluate.js'
import { loadDescriptors, loadDescriptor } from './descriptors.js'
import { checkConfig } from './rules.js'
import { buildManifest } from './manifest.js'
import { resolveFromProject, importFromProject } from './project.js'

interface LoadOptions {
  /** Absolute project root. */
  root: string
  /** Absolute config file. Omitted: the default lookup under `root`. */
  file?: string
  mode: 'development' | 'production'
  /** `genoa build --no-inline`: inline() becomes an error in production mode. */
  forbidInline?: boolean
  /** Receives warnings (code 'config/inline'). Default: console.warn. */
  onWarning?: (issue: ConfigIssue) => void
}

const WARNING_CODES: ReadonlySet<string> = new Set(['config/inline'])

const warnOnConsole = (issue: ConfigIssue): void => {
  console.warn(`[genoacms] ${issue.path === '' ? '' : `${issue.path} `}${issue.message}`)
}

/**
 * One load per file and mode per process. SvelteKit resolves the Vite config several times per
 * build, and every resolution reaching the loader must not re-evaluate the user's config.
 */
const cache = new Map<string, Promise<Manifest>>()

function remember (key: string, load: () => Promise<Manifest>): Promise<Manifest> {
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const loading = load()
  cache.set(key, loading)
  loading.catch(() => { if (cache.get(key) === loading) cache.delete(key) })
  return loading
}

/** Drops memoized manifests. The Vite plugin calls it when a watched file changes. */
function clearLoadCache (): void {
  cache.clear()
}

async function load (file: string, options: LoadOptions): Promise<Manifest> {
  const evaluated = await evaluateConfigModule(file, options.root)
  const descriptors = await loadDescriptors(evaluated.value, options.root)
  const issues = [
    ...descriptors.issues,
    ...checkConfig(evaluated.value, descriptors.bySpecifier, options.mode, options.forbidInline === true)
  ]
  const errors = issues.filter(issue => !WARNING_CODES.has(issue.code))
  issues.filter(issue => WARNING_CODES.has(issue.code)).forEach(options.onWarning ?? warnOnConsole)
  if (errors.length > 0) throw new ConfigError('config/invalid', errors)
  return buildManifest(evaluated, descriptors.bySpecifier, options.mode, options.root, file)
}

/**
 * Evaluates, validates and serializes the project's config. Rejects with every problem found.
 *
 * Deliberately not `async`: callers loading the same file and mode receive the very same promise.
 */
function loadConfig (options: LoadOptions): Promise<Manifest> {
  let file: string
  try {
    file = options.file ?? locateConfigFile(options.root)
  } catch (error) {
    return Promise.reject(error)
  }
  const key = `${file}\0${options.mode}\0${options.forbidInline === true}`
  return remember(key, async () => await load(file, options))
}

export { loadConfig, clearLoadCache, locateConfigFile, loadDescriptor, resolveFromProject, importFromProject }
export type { LoadOptions }
