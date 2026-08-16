import { rotateRootKey } from '../src/lib/script/signing/rootRotation.server'

/**
 * Run by `genoacms rotate-root`. Kept a thin shell around the mechanism so the operator-facing
 * output — which is the only record of the new anchor — lives in one obvious place.
 *
 * **Refuses to act without explicit confirmation.** Every other script in this package is safe to
 * run to see what it does; this one replaces the trust anchor and cannot be undone, because the
 * previous root seed is overwritten rather than archived. Requiring a flag means an unattended
 * invocation — a CI job running every script, a shell-history mistake, someone checking whether the
 * command works — aborts instead of stranding every deployed consumer.
 */

const CONFIRM_FLAG = '--yes'
const CONFIRM_ENV = 'GENOACMS_CONFIRM_ROOT_ROTATION'

const confirmed = process.argv.includes(CONFIRM_FLAG) || process.env[CONFIRM_ENV] === '1'

if (!confirmed) {
  console.log('')
  console.log('  Refusing to rotate the root trust anchor without explicit confirmation.')
  console.log('')
  console.log('  Doing so would:')
  console.log('    - replace the root key, overwriting the current seed irrecoverably')
  console.log('    - invalidate the anchor every deployed consumer SDK has embedded')
  console.log('    - discard the existing subordinate keys, so the authorization manifests')
  console.log('      stop verifying and are replaced empty, returning the instance to')
  console.log('      seed-administrator-only until roles are rebuilt')
  console.log('')
  console.log(`  To proceed:  npm run rotate-root -- ${CONFIRM_FLAG}`)
  console.log(`         or:   ${CONFIRM_ENV}=1 npm run rotate-root`)
  console.log('')
  process.exit(1)
}

const result = await rotateRootKey()

console.log('')
console.log('  Root trust anchor rotated.')
console.log('')
console.log(`    keyId              ${result.keyId}`)
console.log(`    publicKey (base64) ${result.publicKey}`)
console.log(`    new subordinate    ${result.subordinateKeyId}`)
console.log(`    registry sequence  ${result.sequence}`)
console.log('')
console.log('  Every consumer SDK must embed the public key above before it will verify anything')
console.log('  signed by this instance. Until they are redeployed, they will reject all artifacts.')
console.log('')
console.log('  Authorization manifests signed by the previous subordinate keys no longer verify.')
console.log('  They will be quarantined to .genoacms/security/rejected/ and replaced with empty')
console.log('  ones on next start; roles must be rebuilt by the seed administrator.')
console.log('')
