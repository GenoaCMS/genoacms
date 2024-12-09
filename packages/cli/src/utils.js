import { rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'

async function copyBuild () {
  const buildPath = join(process.cwd(), 'node_modules/@genoacms/core/build')
  const symlinkPath = join(process.cwd(), '.genoacms/build')

  await rm(symlinkPath, { recursive: true, force: true })
  await symlink(buildPath, symlinkPath)
}

export {
  copyConfig,
  copyBuild
}
