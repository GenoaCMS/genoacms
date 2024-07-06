import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { config } from '@genoacms/cloudabstraction'
import { copyConfig } from './utils.js'
import buildConfig from '@genoacms/cloudabstraction/configBuilder'
import { spinner } from '@clack/prompts'

const isProd = !process.argv.includes('--dev')
const exec = promisify(execCb)

async function deploy () {
  const { deployProcedure } = await config.deployment.adapter
  const preparingPaths = spinner()
  const buildingCMS = spinner()
  const buildingConfig = spinner()
  const deploying = spinner()

  if (isProd) {
    preparingPaths.start('Preparing build paths')

    await copyConfig()
    process.chdir('node_modules/@genoacms/core')

    preparingPaths.stop('Build paths prepared')
  }

  buildingCMS.start('Building CMS code')
  await exec('npm run build')
  buildingCMS.stop('CMS code built')

  buildingConfig.start('Building config')
  await buildConfig()
  buildingConfig.stop('Config built')

  deploying.start('Deploying code')
  await deployProcedure()
  deploying.stop('Code deployed')
}

export default deploy
