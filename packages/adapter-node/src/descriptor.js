import { isAbsolute, normalize } from 'node:path'
import { defineDeploymentTarget } from '@genoacms/contracts'

/**
 * @param {unknown} options
 * @returns {string[]}
 */
function validate (options) {
  const o = /** @type {Record<string, unknown>} */ (options ?? {})
  const reasons = Object.keys(o).filter(key => key !== 'outDir').map(key => `unknown option '${key}'`)
  if (o.outDir === undefined) return reasons
  if (typeof o.outDir !== 'string' || o.outDir === '') return [...reasons, 'outDir must be a non-empty string']
  const normalized = normalize(o.outDir)
  if (isAbsolute(o.outDir) || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    reasons.push('outDir must be a directory inside the project, given relative to its root')
  }
  return reasons
}

/**
 * Deploys by copying the build artifact into the project, for a Node server to run.
 *
 * SDK-free: both loaders are lazy imports resolved from this package, which is what declares the
 * dependency on `@sveltejs/adapter-node`.
 */
export default defineDeploymentTarget({
  svelteKitAdapter: async () => await import('@sveltejs/adapter-node'),
  svelteKitOptions: (_options, { outDir }) => ({ out: outDir }),
  procedure: async () => await import('./procedure.js'),
  validate
})
