import { exec } from 'node:child_process'
import { config } from '@genoacms/cloudabstraction'

const { deployProcedure } = await config.deployment.adapter

function deploy () {
    process.chdir('node_modules/@genoacms/core')
    exec('npm run build')
    deployProcedure()
}

export default deploy
