import { exec } from 'node:child_process'

function run () {
    process.chdir('node_modules/@genoacms/core')
    exec('npm run dev')

}

export default run
