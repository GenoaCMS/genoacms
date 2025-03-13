import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { config } from '@genoacms/cloudabstraction'
import { copyBuild } from './utils.js'
import buildConfig from '@genoacms/cloudabstraction/configBuilder'
import { spinner } from '@clack/prompts'

const exec = promisify(execCb)

async function deploy () {
  const { deployProcedure } = await config.deployment.adapter
  const buildingCMS = spinner()
  const buildingConfig = spinner()
  const deploying = spinner()

  buildingCMS.start('Building CMS code')
  if (isProd) {
    await exec('npm explore @genoacms/core -- npm run build')
    await copyBuild()
  } else {
    await exec('npm run build')
  }
  buildingCMS.stop('CMS code built')

  buildingConfig.start('Building config')
  await buildConfig()
  buildingConfig.stop('Config built')

  deploying.start('Deploying code')
  await deployProcedure()
  deploying.stop('Code deployed')
}

export default deploy
