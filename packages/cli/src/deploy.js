import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { config, getDeploymentProvider } from '@genoacms/cloudabstraction'
import { copyBuild } from './utils.js'
import buildConfig from '@genoacms/cloudabstraction/configBuilder'
import { spinner } from '@clack/prompts'

const isProd = !process.argv.includes('--dev')
const exec = promisify(execCb)

async function deploy (reqiestedProviderName) {
  const providerName = reqiestedProviderName || config.deployment.providers[0].name
  const provider = await getDeploymentProvider(providerName)
  const { deployProcedure } = await provider.adapter
  const buildingCMS = spinner()
  const buildingConfig = spinner()
  const deploying = spinner()

  buildingCMS.start('Building CMS code')
  if (isProd) {
    await exec('npm explore @genoacms/core -- npm run build', { env: {
        ...process.env,
        GENOA_BUILD: 'true',
        DEPLOYMENT_PROVIDER: providerName
    }})
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
