import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveFromProject } from '@genoacms/config/load'

/** Core's own Vite, which is what its config and plugins were written against. */
function viteBin (coreDir) {
  const packageJson = resolveFromProject('vite/package.json', coreDir)
  const { bin } = JSON.parse(readFileSync(packageJson, 'utf-8'))
  return join(dirname(packageJson), typeof bin === 'string' ? bin : bin.vite)
}

/**
 * Runs core's Vite CLI with `cwd` = core. Never core's npm scripts: they build the monorepo's
 * adapters first and exist for development of core itself (R8).
 */
function spawnVite (coreDir, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteBin(coreDir), ...args], { cwd: coreDir, env: { ...process.env, ...env }, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => code === 0
      ? resolve()
      : reject(new Error(`cli/vite-failed: vite ${args.join(' ')} exited with ${code}`)))
  })
}

/**
 * Runs one of core's scripts with core's aliases (`$lib`, the virtual manifest), which is what
 * `vite-node` did. `vite-node` is a devDependency of core, so user installs do not have it.
 */
async function runCoreScript (coreDir, script, env) {
  Object.assign(process.env, env)
  const { createServer } = await import(pathToFileURL(resolveFromProject('vite', coreDir)).href)
  const server = await createServer({
    root: coreDir,
    configFile: join(coreDir, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error'
  })
  try {
    await server.ssrLoadModule(join(coreDir, script))
  } finally {
    await server.close()
  }
}

export { spawnVite, runCoreScript }
