import { exec } from 'node:child_process'

async function run () {
  const child = exec('npm explore @genoacms/core -- npm run dev', { env: { GENOA_CONFIG_PATH: '../../../genoa.config'}})
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
}

export default run
