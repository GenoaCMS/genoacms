import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ConfigError } from '@genoacms/config'
import { locateConfigFile } from '@genoacms/config/load'

const PRODUCTION_CONFIG = 'genoa.config/production.ts'

const refusesDevelopmentOnly = (error) => error instanceof ConfigError && error.issues.some(issue => issue.code === 'config/development-only')

const runLine = (command, target) => `Run: genoa ${[command, target].filter(Boolean).join(' ')} --config ${PRODUCTION_CONFIG}`

/**
 * The lines naming the default-found config and the production one, or `undefined` when the error
 * is not a refusal of a development-only adapter (CLI-19, LD4).
 *
 * @returns {string[] | undefined}
 */
function productionConfigHint ({ root, command, target, error }) {
  if (!refusesDevelopmentOnly(error)) return undefined
  const loaded = relative(root, locateConfigFile(root))
  return [
    `The config loaded was ${loaded}, found by default; a production config is named explicitly.`,
    ...(existsSync(join(root, PRODUCTION_CONFIG)) ? [runLine(command, target)] : [])
  ]
}

export { productionConfigHint }
