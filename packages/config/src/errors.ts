interface ConfigIssue {
  /** Stable identifier, e.g. 'config/bare-secret'. Tests and callers match on it. */
  readonly code: string
  /** Dotted path into the config, e.g. 'storage.providers.gcs.options.credentials'. '' for file-level issues. */
  readonly path: string
  readonly message: string
}

const formatIssue = (issue: ConfigIssue): string =>
  `  - ${issue.path === '' ? '' : `${issue.path}: `}${issue.message}`

/**
 * Thrown by loadConfig. `issues` lists every problem found, never only the first.
 *
 * A message names config paths and reference names, never an option's value: a credential written
 * inline must not reach a terminal or a CI log through an error.
 */
class ConfigError extends Error {
  readonly code: string
  readonly issues: readonly ConfigIssue[]

  constructor (code: string, issues: readonly ConfigIssue[], options?: { cause?: unknown }) {
    super(`${code}:\n${issues.map(formatIssue).join('\n')}`, options)
    this.name = 'ConfigError'
    this.code = code
    this.issues = issues
  }
}

/** A ConfigError carrying one issue under its own code. */
const singleIssueError = (code: string, path: string, message: string, cause?: unknown): ConfigError =>
  new ConfigError(code, [{ code, path, message }], cause === undefined ? undefined : { cause })

export { ConfigError, singleIssueError }
export type { ConfigIssue }
