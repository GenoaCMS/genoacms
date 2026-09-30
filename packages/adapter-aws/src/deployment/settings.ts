export const SETTING_KEYS: readonly string[] = []

export function validateSettings (_options: unknown): string[] {
  throw new Error('not implemented')
}

export function functionEnvironment (_options: { origin?: string }): Record<string, string> {
  throw new Error('not implemented')
}
