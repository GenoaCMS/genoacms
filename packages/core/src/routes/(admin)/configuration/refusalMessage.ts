/**
 * A refusal reason, in words an administrator can act on.
 *
 * The service reports identifiers so a caller can branch on them; a person needs to be told what to
 * do instead. Anything unrecognized is passed through verbatim rather than flattened to "something
 * went wrong" — a reason nobody has translated yet is still more use than none.
 */
const explanations: Record<string, string> = {
  'administration/locked-by-configuration':
    'This instance sets authorization.lockRoles. Change roles in genoa.config and redeploy.',
  'role/declared-in-configuration':
    'That role is declared in genoa.config. Change it there, not here.',
  'user/declared-in-configuration':
    'That assignment is declared in genoa.config. Change it there, not here.',
  'role/already-exists': 'A role with that name already exists.',
  'role/super-admin-immutable': 'SuperAdmin cannot be changed.',
  'manifest/conflict':
    'Someone else changed this first. Reload to see the current state, then try again.'
}

/**
 * Reasons that name what they refer to, matched on their prefix.
 *
 * A key id or a role name belongs in the message — "that key" is no help when a screen lists six of
 * them — so these carry their subject and are rewritten rather than looked up whole.
 */
const prefixed: Array<[string, (detail: string) => string]> = [
  ['key/unknown', detail => `No key ${detail} is in the registry. Reload to see the current keys.`],
  ['key/already-revoked', detail => `Key ${detail} was already revoked.`],
  ['registry/unusable', () =>
    'The key registry does not verify and was left untouched. This needs an operator, not a retry.'],
  ['registry/cannot-revoke-current', () =>
    'That key is the one currently signing. Rotate first, then revoke it.']
]

function refusalMessage (reason: unknown, fallback: string): string {
  if (typeof reason !== 'string' || reason.length === 0) return fallback
  if (reason in explanations) return explanations[reason]

  for (const [prefix, explain] of prefixed) {
    if (reason.startsWith(prefix)) return explain(reason.slice(prefix.length).replace(/^:\s*/, '').trim())
  }
  // Reasons that name the offending entries, such as `role/in-use: held by s-1`.
  if (reason.startsWith('role/in-use')) {
    return `${reason.replace('role/in-use: held by', 'Still held by')}. Remove it from those accounts first.`
  }
  return reason
}

export { refusalMessage }
