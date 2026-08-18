/**
 * A refusal reason, in words an administrator can act on.
 *
 * The service reports identifiers so a caller can branch on them; a person needs to be told what to
 * do instead. Anything unrecognised is passed through verbatim rather than flattened to "something
 * went wrong" — a reason nobody has translated yet is still more use than none.
 */
const explanations: Record<string, string> = {
  'administration/locked-by-configuration':
    'This instance sets security.lockRoles. Change roles in genoa.config and redeploy.',
  'role/declared-in-configuration':
    'That role is declared in genoa.config. Change it there, not here.',
  'user/declared-in-configuration':
    'That assignment is declared in genoa.config. Change it there, not here.',
  'role/already-exists': 'A role with that name already exists.',
  'role/super-admin-immutable': 'SuperAdmin cannot be changed.',
  'manifest/conflict':
    'Someone else changed this first. Reload to see the current state, then try again.'
}

function refusalMessage (reason: unknown, fallback: string): string {
  if (typeof reason !== 'string' || reason.length === 0) return fallback
  if (reason in explanations) return explanations[reason]
  // Reasons that name the offending entries, such as `role/in-use: held by s-1`.
  if (reason.startsWith('role/in-use')) {
    return `${reason.replace('role/in-use: held by', 'Still held by')}. Remove it from those accounts first.`
  }
  return reason
}

export { refusalMessage }
