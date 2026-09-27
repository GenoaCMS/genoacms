import { mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { basename, join, sep } from 'node:path'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { installedPackageDir } from './versions.js'

const execFile = promisify(execFileCallback)

interface VendorRequest {
  /** Absolute artifact directory. `vendor/` is created inside it. */
  buildDir: string
  /** Absolute project root. Adapter packages resolve from here. */
  root: string
  /** Absolute core directory. Scanned externals resolve from here. */
  coreDir: string
  /** Package names of the manifest's runtime adapters (deployment targets excluded). */
  adapters: string[]
  /** Package names found by scanServerOutput. */
  scanned: string[]
}

interface VendoredPackage {
  name: string
  version: string
  /** Tarball file name inside `<buildDir>/vendor/`, as npm pack reports it. */
  filename: string
  /** `file:vendor/<filename>` */
  spec: string
}

interface PackResult {
  name: string
  version: string
  filename: string
  files: string[]
}

interface PackageJson {
  name: string
  main?: unknown
  exports?: unknown
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const SECRET_FILES = new Set(['serviceAccount.json', 'credentials.json', 'authCredentials.js', 'secrets.env'])
const UNINSTALLABLE_PROTOCOL = /^(workspace|catalog|link|portal|patch):/

const readPackageJson = (dir: string): PackageJson => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))

/** A package is local when nothing on its real path is a node_modules directory (architecture D9). */
function isLocal (dir: string): boolean {
  return !realpathSync(dir).split(sep).includes('node_modules')
}

function addUnique (map: Map<string, string>, name: string, realDir: string): void {
  const existing = map.get(name)
  if (existing !== undefined && existing !== realDir) throw new Error(`build/vendor-conflict: ${name} is installed from ${existing} and from ${realDir}`)
  map.set(name, realDir)
}

/** Optional and peer dependencies may legitimately be absent; a missing regular dependency is an error. */
function resolveDependency (dep: string, fromDir: string, required: boolean): string | undefined {
  try {
    return installedPackageDir(dep, fromDir)
  } catch (error) {
    if (!required && error instanceof Error && error.message.startsWith('build/not-installed')) return undefined
    throw error
  }
}

/** Every dependency a package installs at runtime, with whether it must be present. devDependencies are never installed. */
function runtimeDependencies (pkg: PackageJson): Array<[string, boolean]> {
  return [
    ...Object.keys(pkg.dependencies ?? {}).map((name): [string, boolean] => [name, true]),
    ...Object.keys(pkg.optionalDependencies ?? {}).map((name): [string, boolean] => [name, false]),
    ...Object.keys(pkg.peerDependencies ?? {}).map((name): [string, boolean] => [name, false])
  ]
}

/** The local packages a collected package depends on, as name and real directory. */
function localDependencies (realDir: string): Array<[string, string]> {
  return runtimeDependencies(readPackageJson(realDir))
    .map(([dep, required]): [string, string | undefined] => [dep, resolveDependency(dep, realDir, required)])
    .filter((entry): entry is [string, string] => entry[1] !== undefined && isLocal(entry[1]))
    .map(([dep, dir]) => [dep, realpathSync(dir)])
}

/**
 * Adapters are vendored however they were installed, because yarn v1 hides a local `file:` package
 * inside node_modules (S-8). Everything else is vendored only when local.
 */
function seeds (request: VendorRequest): Map<string, string> {
  const collected = new Map<string, string>()
  for (const name of request.adapters) addUnique(collected, name, realpathSync(installedPackageDir(name, request.root)))
  for (const name of request.scanned) {
    const dir = installedPackageDir(name, request.coreDir)
    if (isLocal(dir)) addUnique(collected, name, realpathSync(dir))
  }
  return collected
}

/** Package name → real directory of every package D9 selects, breadth-first from the seeds. */
function collectVendored (request: VendorRequest): Map<string, string> {
  const collected = seeds(request)
  const queue = [...collected.values()]
  for (let realDir = queue.shift(); realDir !== undefined; realDir = queue.shift()) {
    for (const [dep, depDir] of localDependencies(realDir)) {
      if (!collected.has(dep)) queue.push(depDir)
      addUnique(collected, dep, depDir)
    }
  }
  return collected
}

/** Scripts are not run: a registry package's prepack may need devDependencies it does not have. */
async function packPackage (dir: string, vendorDir: string): Promise<PackResult> {
  try {
    const { stdout } = await execFile('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', vendorDir], { cwd: dir })
    const [packed] = JSON.parse(stdout) as Array<{ name: string, version: string, filename: string, files: Array<{ path: string }> }>
    return { name: packed.name, version: packed.version, filename: packed.filename, files: packed.files.map(file => file.path) }
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? (error as Error).message)
    throw new Error(`build/vendor-pack-failed: ${dir}: ${stderr.trim().split('\n')[0]}`)
  }
}

/** String leaves of an exports map, skipping type declarations, which are never loaded at runtime. */
function exportLeaves (value: unknown, key = ''): string[] {
  if (key === 'types') return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(item => exportLeaves(item))
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([k, v]) => exportLeaves(v, k))
  return []
}

function exportTargets (pkg: PackageJson): string[] {
  const leaves = [...exportLeaves(pkg.exports), ...(typeof pkg.main === 'string' ? [pkg.main] : [])]
  return leaves.filter(leaf => !leaf.includes('*')).map(leaf => leaf.replace(/^\.\//, ''))
}

function checkComplete (packed: PackResult, pkg: PackageJson): void {
  const files = new Set(packed.files)
  const missing = exportTargets(pkg).find(target => !files.has(target))
  if (missing !== undefined) throw new Error(`build/vendor-incomplete: ${packed.name} lacks ${missing}; build the package before deploying`)
}

const isSecretFile = (path: string): boolean => {
  const name = basename(path)
  return SECRET_FILES.has(name) || (/^\.env(\..+)?$/.test(name) && !name.endsWith('.example'))
}

function checkNoSecrets (packed: PackResult): void {
  const secret = packed.files.find(isSecretFile)
  if (secret !== undefined) throw new Error(`build/vendor-secret: ${packed.name} would ship ${secret}`)
}

/** npm cannot parse these protocols; overrides replace them only for names that are vendored (S-8). */
function checkProtocols (pkg: PackageJson, vendoredNames: Set<string>): void {
  const specs = { ...pkg.peerDependencies, ...pkg.optionalDependencies, ...pkg.dependencies }
  const bad = Object.entries(specs).find(([dep, spec]) => UNINSTALLABLE_PROTOCOL.test(spec) && !vendoredNames.has(dep))
  if (bad !== undefined) throw new Error(`build/vendor-protocol: ${pkg.name} depends on ${bad[0]}@${bad[1]}, which npm cannot install; vendor or publish ${bad[0]}`)
}

function freshVendorDir (buildDir: string): string {
  const vendorDir = join(buildDir, 'vendor')
  rmSync(vendorDir, { recursive: true, force: true })
  mkdirSync(vendorDir, { recursive: true })
  return vendorDir
}

function checkPacked (packed: PackResult, realDir: string, vendoredNames: Set<string>): void {
  const pkg = readPackageJson(realDir)
  checkComplete(packed, pkg)
  checkNoSecrets(packed)
  checkProtocols(pkg, vendoredNames)
}

/** Packs every package D9 selects into `<buildDir>/vendor/`, checked, sorted by name. */
async function vendorPackages (request: VendorRequest): Promise<VendoredPackage[]> {
  const collected = collectVendored(request)
  const vendorDir = freshVendorDir(request.buildDir)
  const names = [...collected.keys()].sort((a, b) => a.localeCompare(b))
  const vendored: VendoredPackage[] = []
  for (const name of names) {
    const realDir = collected.get(name) as string
    const packed = await packPackage(realDir, vendorDir)
    checkPacked(packed, realDir, new Set(names))
    vendored.push({ name, version: packed.version, filename: packed.filename, spec: `file:vendor/${packed.filename}` })
  }
  return vendored
}

export { vendorPackages }
export type { VendorRequest, VendoredPackage }
