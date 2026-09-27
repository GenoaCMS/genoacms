import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { singleIssueError } from '../errors.js'

const CANDIDATES = [
  'genoa.config.ts',
  'genoa.config.mts',
  'genoa.config.js',
  'genoa.config.mjs',
  'genoa.config/index.ts',
  'genoa.config/index.mts',
  'genoa.config/index.js',
  'genoa.config/index.mjs'
]

/** The first existing config file under `root`, in the order above. */
function locateConfigFile (root: string): string {
  const found = CANDIDATES.map(candidate => join(root, candidate)).find(path => existsSync(path))
  if (found !== undefined) return found
  throw singleIssueError('config/not-found', '', `no config file under ${root}; looked for: ${CANDIDATES.join(', ')}`)
}

export { locateConfigFile }
