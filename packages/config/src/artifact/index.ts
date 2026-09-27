import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Manifest } from '../manifest.js'
import { scanServerOutput } from './scan.js'
import { installedVersion } from './versions.js'

interface RuntimePackageRequest {
  /** Absolute SvelteKit adapter output directory (the artifact). */
  buildDir: string
  /** Absolute directory of the installed @genoacms/core package; versions of core's externals resolve from here. */
  coreDir: string
  /** Absolute project root. */
  root: string
  manifest: Manifest
}

interface RuntimePackage {
  name: string
  private: true
  type: 'module'
  dependencies: Record<string, string>
}

interface RuntimePackageResult {
  /** The written package.json content. */
  pkg: RuntimePackage
  /** Non-literal import()/require()/createRequire() sites, as "<relative file>: <construct>". Informational. */
  blind: string[]
}

/**
 * Adapter packages are loaded by a specifier the bundler cannot see, so the scan never finds them;
 * the manifest names them instead.
 */
function adapterPackages (manifest: Manifest): Map<string, string> {
  return new Map(Object.values(manifest.adapters)
    .filter(record => record.kind !== 'deployment')
    .map(record => [record.package, record.version]))
}

function mergeDependencies (scanned: string[], adapters: Map<string, string>, coreDir: string): Record<string, string> {
  const dependencies = new Map(adapters)
  for (const pkg of scanned) {
    const version = installedVersion(pkg, coreDir)
    const declared = adapters.get(pkg)
    if (declared !== undefined && declared !== version) throw new Error(`build/version-conflict: ${pkg}`)
    dependencies.set(pkg, version)
  }
  return Object.fromEntries([...dependencies].sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Writes the artifact's package.json: exactly what the server bundle imports, plus the adapters it
 * loads at runtime, pinned to the installed versions. Core's build tooling never appears in it,
 * because nothing in the server output imports it.
 */
async function createRuntimePackage (request: RuntimePackageRequest): Promise<RuntimePackageResult> {
  const scanned = scanServerOutput(request.buildDir)
  const pkg: RuntimePackage = {
    name: 'genoacms-runtime',
    private: true,
    type: 'module',
    dependencies: mergeDependencies(scanned.packages, adapterPackages(request.manifest), request.coreDir)
  }
  writeFileSync(join(request.buildDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  return { pkg, blind: scanned.blind }
}

export { createRuntimePackage }
export type { RuntimePackageRequest, RuntimePackageResult }
