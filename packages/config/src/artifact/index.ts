import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Manifest } from '../manifest.js'
import { scanServerOutput } from './scan.js'
import { installedVersion } from './versions.js'
import { vendorPackages } from './vendor.js'

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
  /** Every vendored package → its tarball; present only when something was vendored (architecture D9). */
  overrides?: Record<string, string>
}

interface RuntimePackageResult {
  /** The written package.json content. */
  pkg: RuntimePackage
  /** Non-literal import()/require()/createRequire() sites, as "<relative file>: <construct>". Informational. */
  blind: string[]
  /** Names of the packages packed into `vendor/`, sorted. */
  vendored: string[]
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

/** Points each vendored direct dependency at its tarball. Adds no keys, so the order stays sorted. */
function applyVendored (dependencies: Record<string, string>, specs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(dependencies).map(([name, version]) => [name, specs[name] ?? version]))
}

/**
 * Writes the artifact's package.json: exactly what the server bundle imports, plus the adapters it
 * loads at runtime, pinned to the installed versions. Core's build tooling never appears in it,
 * because nothing in the server output imports it. Adapters, and local packages reachable from them
 * or from the bundle, are packed into `vendor/` and installed from there (architecture D9).
 */
async function createRuntimePackage (request: RuntimePackageRequest): Promise<RuntimePackageResult> {
  const scanned = scanServerOutput(request.buildDir)
  const adapters = adapterPackages(request.manifest)
  const dependencies = mergeDependencies(scanned.packages, adapters, request.coreDir)
  const vendored = await vendorPackages({
    buildDir: request.buildDir, root: request.root, coreDir: request.coreDir, adapters: [...adapters.keys()], scanned: scanned.packages
  })
  const specs = Object.fromEntries(vendored.map(entry => [entry.name, entry.spec]))
  const pkg: RuntimePackage = {
    name: 'genoacms-runtime',
    private: true,
    type: 'module',
    dependencies: applyVendored(dependencies, specs),
    ...(vendored.length > 0 ? { overrides: specs } : {})
  }
  writeFileSync(join(request.buildDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  return { pkg, blind: scanned.blind, vendored: vendored.map(entry => entry.name) }
}

export { createRuntimePackage }
export type { RuntimePackageRequest, RuntimePackageResult }
