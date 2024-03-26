import { exec } from 'node:child_process'
import { config } from '@genoacms/cloudabstraction'
import { copyConfig } from './utils.js'

async function deploy () {
  const { deployProcedure } = await config.deployment.adapter
  await copyConfig()
  process.chdir('node_modules/@genoacms/core')
  exec('npm run build')
  deployProcedure()
}

export default deploy
