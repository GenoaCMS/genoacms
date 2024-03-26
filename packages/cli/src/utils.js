import { rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'

async function copyConfig () {
  const configPath = join(process.cwd(), 'genoa.config')
  const symlinkPath = join(process.cwd(), 'node_modules/@genoacms/core/genoa.config')

  await rm(symlinkPath, { recursive: true, force: true })
  await symlink(configPath, symlinkPath)
}

export {
  copyConfig
}
