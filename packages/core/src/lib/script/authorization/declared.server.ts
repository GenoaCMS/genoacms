import { config } from '@genoacms/cloudabstraction'
import { parseDeclarations, type Declarations } from './declared'

/**
 * The Tier-1 declarations, read from configuration.
 *
 * Shared by resolution, which merges them to answer what a principal may do, and by administration,
 * which needs to know which entries are declared in order to refuse changing them. Reading
 * configuration in one place keeps those two from disagreeing about what was declared.
 *
 * A malformed declaration throws rather than being skipped: it is configuration an operator wrote
 * deliberately, and ignoring it would leave an instance with less authority than its configuration
 * describes, with nothing to say so.
 */
function readDeclarations (): Declarations {
  const parsed = parseDeclarations(config.security.roles, config.security.assignments)
  if (!parsed.ok) throw new Error(`security/invalid-declarations: ${parsed.reason}`)
  return parsed.value
}

/** Whether runtime role and assignment administration is disabled for this instance. */
const isAdministrationLocked = (): boolean => config.security.lockRoles === true

export {
  readDeclarations,
  isAdministrationLocked
}
