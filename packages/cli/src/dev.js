import { spawnVite } from './vite.js'
import { genoaEnvironment } from './environment.js'

/** `--host` keeps parity with core's `dev` script, which `genoa run` used to reach through npm. */
async function dev ({ root, file, coreDir, mode }) {
  await spawnVite(coreDir, ['dev', '--host'], genoaEnvironment({ root, file, mode }))
}

export default dev
