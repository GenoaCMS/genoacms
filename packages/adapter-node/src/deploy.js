import { join } from 'node:path'
import { cp } from 'node:fs/promises'


async function deploy () {
  const workDir = process.cwd()
  const buildDir = join(workDir, '.genoacms', 'build/')
  const configBuildDir = join(workDir, '.genoacms', 'genoa.config')
  const outputBuildDir = join(workDir, 'build/')
  const outputConfigDir = join(workDir, 'build', 'genoa.config')
  const buildMove = cp(buildDir, outputBuildDir, {
    recursive: true,
    force: true
  })
  const configMove = cp(configBuildDir, outputConfigDir, {
    recursive: true,
    force: true
  })
  await Promise.all([buildMove, configMove])
}

export default deploy

