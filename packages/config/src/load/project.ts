import { resolve as resolveEsm } from 'import-meta-resolve'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

/**
 * Resolves a bare specifier as if imported from `<root>/package.json`: Node's ESM algorithm,
 * anchored at the project rather than at wherever this package is installed.
 *
 * In the monorepo this package and the CLI are separate workspace packages that do not depend on
 * core's adapters, so an `import()` from here would not find them.
 */
function resolveFromProject (specifier: string, root: string): string {
  return fileURLToPath(resolveEsm(specifier, pathToFileURL(join(root, 'package.json')).href))
}

/**
 * A native import of the project-resolved file. Its own relative and bare imports then resolve
 * normally from its package, which is what a descriptor's lazy `import()` of its SvelteKit adapter
 * relies on. Not Vite's module runner: it closes after use and such a lazy import would fail.
 */
async function importFromProject<T = unknown> (specifier: string, root: string): Promise<T> {
  return await import(pathToFileURL(resolveFromProject(specifier, root)).href) as T
}

/** '@scope/name/sub' → '@scope/name'; 'name/sub' → 'name'. */
function packageNameOf (specifier: string): string {
  const segments = specifier.split('/')
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
}

const readPackageJson = (path: string): { name?: unknown, version?: unknown } =>
  JSON.parse(readFileSync(path, 'utf-8'))

/**
 * Walks up from `file` to the nearest package.json whose "name" equals `packageName`.
 *
 * Comparing names skips nested package.json files without one, which dual-format packages use to
 * mark a directory's module type.
 */
function findPackageJson (file: string, packageName: string): { path: string, version: string } {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) {
      const pkg = readPackageJson(candidate)
      if (pkg.name === packageName) return { path: candidate, version: String(pkg.version) }
    }
    if (dir === dirname(dir)) throw new Error(`config/package-not-found: no package.json named ${packageName} above ${file}`)
  }
}

export { resolveFromProject, importFromProject, packageNameOf, findPackageJson }
