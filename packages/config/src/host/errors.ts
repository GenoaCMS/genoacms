/**
 * A failure to construct or reach a provider.
 *
 * A message may name config paths, provider names and reference names. Never a resolved value.
 */
class HostError extends Error {
  readonly code: string

  constructor (code: string, message: string, options?: { cause?: unknown }) {
    super(`${code}: ${message}`, options)
    this.name = 'HostError'
    this.code = code
  }
}

export { HostError }
