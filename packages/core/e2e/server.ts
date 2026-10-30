import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { inject } from 'vitest'
import { CORE, withoutVitest } from './build'

export interface User { subject: string, email: string, password: string }

export interface Providers { primary?: User[], secondary?: User[] }

export interface RunningServer {
  origin: string
  output: () => string
  stop: () => Promise<void>
}

const SERVER_ENTRY = join(CORE, '.genoacms', 'build', 'index.js')
const STARTUP_TIMEOUT_MS = 60_000
// OF20
const STOP_TIMEOUT_MS = 5_000

function usersOf (providers: Providers): Record<string, string> {
  return {
    ...(providers.primary === undefined ? {} : { GENOACMS_E2E_PRIMARY_USERS: JSON.stringify(providers.primary) }),
    ...(providers.secondary === undefined ? {} : { GENOACMS_E2E_SECONDARY_USERS: JSON.stringify(providers.secondary) })
  }
}

/** Serves the build with the given users; a provider left out has no credentials and fails to construct. */
export async function startServer (providers: Providers): Promise<RunningServer> {
  const origin = inject('origin')
  const port = new URL(origin).port
  const environment = withoutVitest(process.env)
  delete environment.GENOACMS_E2E_PRIMARY_USERS
  delete environment.GENOACMS_E2E_SECONDARY_USERS
  const agentToken = environment.GENOACMS_E2E_AGENT_TOKEN ?? randomBytes(32).toString('base64url')
  const child = spawn('node', [SERVER_ENTRY], { cwd: CORE, env: { ...environment, ...usersOf(providers), GENOACMS_E2E_AGENT_TOKEN: agentToken, PORT: port } })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(`the server did not start:\n${output}`)) }, STARTUP_TIMEOUT_MS)
    const ready = (): void => {
      if (!output.includes('Listening on')) return
      clearTimeout(timer)
      resolve()
    }
    child.stdout.on('data', ready)
    child.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`the server exited with ${String(code)}:\n${output}`))
    })
  })

  return {
    origin,
    output: () => output,
    stop: async () => {
      if (child.exitCode !== null) return
      await new Promise<void>(resolve => {
        const kill = setTimeout(() => { child.kill('SIGKILL') }, STOP_TIMEOUT_MS)
        child.once('exit', () => {
          clearTimeout(kill)
          resolve()
        })
        child.kill('SIGTERM')
      })
    }
  }
}
