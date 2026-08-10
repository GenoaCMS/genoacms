import { rm, symlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

async function copyBuild () {
  const buildPath = join(process.cwd(), 'node_modules/@genoacms/core/build')
  const genoaPath = join(process.cwd(), '.genoacms')
  const symlinkPath = join(genoaPath, 'build')

  await rm(symlinkPath, { recursive: true, force: true })
  await mkdir(genoaPath, { recursive: true })
  await symlink(buildPath, symlinkPath)
}

export {
  copyBuild
}
