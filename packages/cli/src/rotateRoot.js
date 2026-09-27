import { confirm, isCancel, log, outro } from '@clack/prompts'
import { runCoreScript } from './vite.js'
import { genoaEnvironment } from './environment.js'

/**
 * Rotating the root trust anchor strands every deployed consumer until it is rebuilt with the new
 * public key, so this is a command an operator runs rather than an action in the CMS — the one
 * operation whose blast radius is every consumer should not sit behind a session that can be
 * hijacked.
 */
async function rotateRoot ({ root, file, coreDir, mode }) {
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

  // Confirmed through the environment rather than `--yes`: the script reads either, and the script
  // runs in this process, where the environment reaches it without forwarding any argument.
  await runCoreScript(coreDir, 'scripts/rotate-root.ts', { ...genoaEnvironment({ root, file, mode }), GENOACMS_CONFIRM_ROOT_ROTATION: '1' })
}

export default rotateRoot
