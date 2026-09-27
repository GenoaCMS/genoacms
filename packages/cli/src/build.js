import { join } from 'node:path'
import { log } from '@clack/prompts'
import { ConfigError } from '@genoacms/config'
import { loadConfig } from '@genoacms/config/load'
import { createRuntimePackage } from '@genoacms/config/build'
import { spawnVite } from './vite.js'
import { genoaEnvironment } from './environment.js'

const targetError = (code, message) => new ConfigError(code, [{ code, path: 'deployment.targets', message }])

/** The requested target, else `deployment.default`, else the first declared one. */
function chooseTarget (manifest, target) {
  const targets = manifest.config.deployment?.targets ?? {}
  const names = Object.keys(targets)
  if (names.length === 0) throw targetError('config/no-deployment-target', 'the config declares no deployment target to build for')
  const chosen = target ?? manifest.config.deployment.default ?? names[0]
  if (Object.hasOwn(targets, chosen)) return chosen
  throw targetError('config/unknown-target', `${chosen} is not a deployment target; known: ${names.join(', ')}`)
}

/** The scan cannot see these imports, so a missing package would only show at runtime. */
function reportBlindImports (blind) {
  if (blind.length === 0) return
  log.warn('These imports are invisible to the dependency scan; confirm each resolves at runtime:')
  for (const entry of blind) log.warn(entry)
}

/**
 * @returns {Promise<{ manifest: import('@genoacms/config').Manifest, target: string, buildDir: string }>}
 */
async function build ({ root, file, coreDir, target, mode, noInline }) {
  const manifest = await loadConfig({ root, file, mode, forbidInline: noInline })
  const chosen = chooseTarget(manifest, target)
  await spawnVite(coreDir, ['build'], genoaEnvironment({ root, file, target: chosen, mode }))
  const buildDir = join(root, '.genoacms', 'build')
  const { blind } = await createRuntimePackage({ buildDir, coreDir, root, manifest })
  reportBlindImports(blind)
  return { manifest, target: chosen, buildDir }
}

export { build, chooseTarget }
