import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface User { subject: string, email: string, password: string }

export interface Providers { primary?: User[], secondary?: User[] }

export interface RunningServer {
  origin: string
  output: () => string
  stop: () => Promise<void>
}

const CORE = fileURLToPath(new URL('..', import.meta.url))
const SERVER_ENTRY = join(CORE, '.genoacms', 'build', 'index.js')
const STARTUP_TIMEOUT_MS = 60_000

function withoutVitest (environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith('VITEST')))
}

function freshSecretsFile (): string {
  const path = join(mkdtempSync(join(tmpdir(), 'genoacms-e2e-')), 'secrets.env')
  writeFileSync(path, '', { mode: 0o600 })
  return path
}

/** Builds core with `genoa.config/e2e.ts` into `.genoacms/build/`, with a secrets file of its own. */
export function buildCore (): void {
  const environment = {
    ...withoutVitest(process.env),
    GENOA_MODE: 'development',
    GENOA_CONFIG: join(CORE, 'genoa.config', 'e2e.ts'),
    GENOACMS_E2E_SECRETS: freshSecretsFile()
  }
  const result = spawnSync('pnpm', ['exec', 'vite', 'build'], { cwd: CORE, env: environment, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`core's build failed:\n${result.stdout}\n${result.stderr}`)
}

async function freePort (): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, () => {
      const address = probe.address()
      probe.close(() => { resolve(typeof address === 'object' && address !== null ? address.port : 0) })
    })
  })
}

function usersOf (providers: Providers): Record<string, string> {
  return {
    ...(providers.primary === undefined ? {} : { GENOACMS_E2E_PRIMARY_USERS: JSON.stringify(providers.primary) }),
    ...(providers.secondary === undefined ? {} : { GENOACMS_E2E_SECONDARY_USERS: JSON.stringify(providers.secondary) })
  }
}

/** Serves the build with the given users; a provider left out has no credentials and fails to construct. */
export async function startServer (providers: Providers): Promise<RunningServer> {
  const port = await freePort()
  const origin = `http://localhost:${port}`
  const environment = withoutVitest(process.env)
  delete environment.GENOACMS_E2E_PRIMARY_USERS
  delete environment.GENOACMS_E2E_SECONDARY_USERS
  const child = spawn('node', [SERVER_ENTRY], { cwd: CORE, env: { ...environment, ...usersOf(providers), PORT: String(port), ORIGIN: origin } })
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
        child.once('exit', () => { resolve() })
        child.kill('SIGTERM')
      })
    }
  }
}
