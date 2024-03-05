import { exec } from 'node:child_process'

function deploy () {
    process.chdir('node_modules/@genoacms/core')
    exec('npm run build')
    // TODO: run custom deployment logic from deployment adapter

}

export default deploy
