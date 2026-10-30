import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface BuiltCore { secretsFile: string, origin: string }

export const CORE = fileURLToPath(new URL('..', import.meta.url))

export function withoutVitest (environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith('VITEST')))
}

function freshSecretsFile (): string {
  const path = join(mkdtempSync(join(tmpdir(), 'genoacms-e2e-')), 'secrets.env')
  writeFileSync(path, '', { mode: 0o600 })
  return path
}

/** Builds core with `genoa.config/e2e.ts` into `.genoacms/build/`, with a secrets file of its own and the origin it is served at (build.md F30). */
export async function buildCore (): Promise<BuiltCore> {
  const secretsFile = freshSecretsFile()
  const origin = `http://localhost:${await freePort()}`
  const environment = {
    ...withoutVitest(process.env),
    GENOA_MODE: 'development',
    GENOA_CONFIG: join(CORE, 'genoa.config', 'e2e.ts'),
    GENOACMS_E2E_SECRETS: secretsFile,
    GENOACMS_E2E_ORIGIN: origin
  }
  const result = spawnSync('pnpm', ['exec', 'vite', 'build'], { cwd: CORE, env: environment, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`core's build failed:\n${result.stdout}\n${result.stderr}`)
  return { secretsFile, origin }
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
