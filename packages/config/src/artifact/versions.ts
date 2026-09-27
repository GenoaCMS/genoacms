import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** Where Node would look for `pkg` from `dir`: inside a node_modules directory, or in its child. */
const candidateFor = (dir: string, pkg: string): string =>
  basename(dir) === 'node_modules' ? join(dir, pkg, 'package.json') : join(dir, 'node_modules', pkg, 'package.json')

/**
 * The installed version of `pkg` as seen from `fromDir`, following Node's lookup order.
 *
 * The `node_modules` case matters for pnpm, where core's dependencies are its siblings inside
 * `.pnpm/<id>/node_modules` rather than below it.
 */
function installedVersion (pkg: string, fromDir: string): string {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = candidateFor(dir, pkg)
    if (existsSync(candidate)) return String(JSON.parse(readFileSync(candidate, 'utf-8')).version)
    if (dir === dirname(dir)) throw new Error(`build/not-installed: ${pkg} (from ${fromDir})`)
  }
}

export { installedVersion }
