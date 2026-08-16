import { exec } from 'node:child_process'
import { confirm, isCancel, log, outro } from '@clack/prompts'

/**
 * Rotating the root trust anchor strands every deployed consumer until it is rebuilt with the new
 * public key, so this is a command an operator runs rather than an action in the CMS — the one
 * operation whose blast radius is every consumer should not sit behind a session that can be
 * hijacked.
 */
async function rotateRoot () {
  log.warn('Rotating the root trust anchor will:')
  log.message('  - invalidate the key every deployed consumer SDK has embedded')
  log.message('  - discard the existing subordinate keys, since a compromised root could have signed them')
  log.message('  - stop the authorization manifests verifying, returning the instance to')
  log.message('    seed-administrator-only until roles are rebuilt')

  const proceed = await confirm({ message: 'Rotate the root trust anchor?', initialValue: false })
  if (isCancel(proceed) || proceed !== true) {
    outro('Cancelled. Nothing was changed.')
    return
  }

  // Passed as an environment variable rather than a flag: the command reaches the script through
  // `npm explore` and then `npm run`, and argument forwarding across both is fragile enough that a
  // dropped flag would look like the script simply refusing.
  const child = exec('npm explore @genoacms/core -- npm run rotate-root', {
    env: { ...process.env, GENOA_BUILD: 'true', GENOACMS_CONFIRM_ROOT_ROTATION: '1' }
  })
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
}

export default rotateRoot
