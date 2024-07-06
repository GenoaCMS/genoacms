import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { config } from '@genoacms/cloudabstraction'
import { copyConfig } from './utils.js'
import buildConfig from '@genoacms/cloudabstraction/configBuilder'

const isProd = !process.argv.includes('--dev')
const exec = promisify(execCb)

async function deploy () {
  const { deployProcedure } = await config.deployment.adapter
  if (isProd) {
    await copyConfig()
    process.chdir('node_modules/@genoacms/core')
  }
  await exec('npm run build')
  await buildConfig()
  deployProcedure()
}

export default deploy
