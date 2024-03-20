import { exec } from 'node:child_process'

function run () {
    const child = exec('npm explore @genoacms/core -- npm run dev')
    child.stdout.pipe(process.stdout)
}

export default run
