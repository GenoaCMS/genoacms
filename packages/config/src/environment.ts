import { isAbsolute } from 'node:path'

type Mode = 'development' | 'production'

/** The facts the CLI passes across the process boundary into Vite and SvelteKit. */
interface GenoaEnvironment {
  /** GENOA_PROJECT: absolute project root. Fallback: process.cwd() (the monorepo's `pnpm dev` in packages/core). */
  root: string
  /** GENOA_CONFIG: absolute config file. Fallback: the default lookup. */
  file?: string
  /** GENOA_TARGET: deployment target name. Build only. */
  target?: string
  /** GENOA_MODE, else `fallbackMode`. */
  mode: Mode
}

function absolute (name: string, value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  if (!isAbsolute(value)) throw new Error(`genoa/relative-path: ${name} must be absolute`)
  return value
}

function mode (value: string | undefined, fallbackMode: Mode): Mode {
  if (value === undefined || value === '') return fallbackMode
  if (value !== 'development' && value !== 'production') throw new Error(`genoa/invalid-mode: GENOA_MODE must be development or production, not ${value}`)
  return value
}

/**
 * `fallbackMode` applies only when GENOA_MODE is unset:
 * - the plugin passes `command === 'serve' ? 'development' : 'production'`;
 * - svelte.config.js, which cannot know Vite's command, passes 'development'.
 * The CLI and core's `build` script always set GENOA_MODE, so the fallbacks matter only for the
 * monorepo's `pnpm dev` and tooling such as vite-node and vitest.
 *
 * Vite's own `mode` is never read: one SvelteKit build resolves the Vite config several times, and
 * not all of those resolutions agree on it.
 */
function readGenoaEnvironment (fallbackMode: Mode, env: NodeJS.ProcessEnv = process.env): GenoaEnvironment {
  const file = absolute('GENOA_CONFIG', env.GENOA_CONFIG)
  const target = env.GENOA_TARGET === '' ? undefined : env.GENOA_TARGET
  return {
    root: absolute('GENOA_PROJECT', env.GENOA_PROJECT) ?? process.cwd(),
    ...(file === undefined ? {} : { file }),
    ...(target === undefined ? {} : { target }),
    mode: mode(env.GENOA_MODE, fallbackMode)
  }
}

export { readGenoaEnvironment }
export type { GenoaEnvironment }
