import { exec } from 'node:child_process'
import { copyConfig } from './utils.js'

async function run () {
  await copyConfig()
  const child = exec('npm explore @genoacms/core -- npm run dev')
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
}

export default run
