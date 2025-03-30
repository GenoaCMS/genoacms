import { join } from 'node:path'
import { cp } from 'node:fs/promises'


async function deploy () {
  const workDir = process.cwd()
  const kitBuildDir = join(workDir, 'node_modules', '@genoacms', 'core', 'build')
  const genoaBuildDir = join(workDir, 'build', 'cms')
  await cp(kitBuildDir, genoaBuildDir, {
    recursive: true,
    force: true
  })
}

export default deploy
