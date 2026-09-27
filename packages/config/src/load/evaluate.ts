import { runnerImport } from 'vite'
import { singleIssueError } from '../errors.js'
import { isPlainObject } from '../references.js'

interface EvaluatedConfig {
  readonly value: Record<string, unknown>
  /** The config file first, then every file it imported. */
  readonly dependencies: string[]
}

const firstLine = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0]

/**
 * Evaluates the config file with Vite's module runner, which compiles TypeScript and records the
 * import graph. The graph excludes the file itself, so it is prepended: a watcher needs it too.
 */
async function evaluateConfigModule (file: string, root: string): Promise<EvaluatedConfig> {
  let imported
  try {
    imported = await runnerImport<{ default?: unknown }>(file, { root, configFile: false, logLevel: 'error' })
  } catch (error) {
    throw singleIssueError('config/evaluation-failed', '', `${file} failed to evaluate: ${firstLine(error)}`, error)
  }
  const value = imported.module.default
  if (!isPlainObject(value)) {
    throw singleIssueError('config/not-an-object', '', `${file} must default-export a plain object`)
  }
  return { value, dependencies: [file, ...imported.dependencies] }
}

export { evaluateConfigModule }
export type { EvaluatedConfig }
