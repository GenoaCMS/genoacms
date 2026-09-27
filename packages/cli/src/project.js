import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { resolveFromProject } from '@genoacms/config/load'

/**
 * Core is the project itself in the monorepo. It has no `exports` field, so it cannot resolve
 * itself by name, and its package.json names it instead.
 */
function isCore (root) {
  const path = join(root, 'package.json')
  return existsSync(path) && JSON.parse(readFileSync(path, 'utf-8')).name === '@genoacms/core'
}

function installedCore (root) {
  try {
    return dirname(resolveFromProject('@genoacms/core/package.json', root))
  } catch (error) {
    throw new Error(`cli/core-not-installed: install @genoacms/core in ${root}`, { cause: error })
  }
}

/**
 * @param {{ cwd: string, config?: string }} request
 * @returns {{ root: string, file?: string, coreDir: string }}
 */
function resolveProject ({ cwd, config }) {
  const root = cwd
  const file = config === undefined ? undefined : resolve(cwd, config)
  const coreDir = isCore(root) ? root : installedCore(root)
  return { root, file, coreDir }
}

export { resolveProject }
