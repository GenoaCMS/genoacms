import { exec } from 'node:child_process'
import { config } from '@genoacms/cloudabstraction'
import { copyConfig } from './utils.js'
import buildConfig from '@genoacms/cloudabstraction/configBuilder'

const isProd = !process.argv.includes('--dev')

async function deploy () {
  const { deployProcedure } = await config.deployment.adapter
  if (isProd) {
    await copyConfig()
    process.chdir('node_modules/@genoacms/core')
  }
  exec('npm run build')
  await buildConfig()
  deployProcedure()
}

export default deploy
