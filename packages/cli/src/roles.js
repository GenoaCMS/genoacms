import { select, text, confirm, isCancel, note, intro, outro, log } from '@clack/prompts'
import { isResourceScoped, getPermissionScope } from '@genoacms/cloudabstraction/authorization'
import { permissionOptions, render } from './declaration.js'

/**
 * Composes Tier-1 role declarations and prints them to paste into `genoa.config`.
 *
 * ## Why it prints rather than writes
 *
 * `genoa.config/index.js` is hand-written JavaScript: `import()` expressions, credentials, comments
 * an operator put there on purpose. Rewriting it programmatically would buy some convenience at the
 * price of a tool that can corrupt the file holding an instance's adapters. Printing keeps the whole
 * value of the tool — knowing that what you paste is *valid* — and none of that risk.
 *
 * ## What it is actually for
 *
 * A permission is a fixed string, and a typo in one is not an error anywhere: the grant is stored,
 * the role looks right, and the check it was meant to satisfy simply never matches. The same is true
 * of a bucket that does not exist. Both are chosen from a list here, so neither is expressible.
 */

/** Resource names offered for a scope, read from the project's own configuration. */
async function loadCatalogue () {
  try {
    const { config } = await import('@genoacms/cloudabstraction')
    return {
      available: true,
      bucket: (config.storage?.buckets ?? []).map(bucket => bucket.name),
      collection: (config.database?.databases ?? [])
        .flatMap(database => database.collections ?? [])
        .map(collection => collection.name)
    }
  } catch (error) {
    // Composing roles is otherwise an offline, local editing task. A project that cannot load its
    // config yet — no credentials, first run — should still be able to write a declaration.
    return { available: false, reason: error.message, bucket: [], collection: [] }
  }
}

const cancelled = (value) => {
  if (isCancel(value)) {
    outro('Nothing composed.')
    return true
  }
  return false
}

/**
 * Names a resource for a resource-scoped permission.
 *
 * Offers what the configuration declares, plus the wildcard. Free text is available only when the
 * catalogue could not be read — otherwise a name that does not exist is not offered, which is the
 * point.
 */
async function chooseResource (permission, catalogue) {
  const scope = getPermissionScope(permission)
  const names = catalogue[scope] ?? []

  if (!catalogue.available || names.length === 0) {
    const typed = await text({
      message: `Which ${scope}? (its name, or * for every ${scope})`,
      placeholder: '*',
      initialValue: '*'
    })
    if (cancelled(typed)) return undefined
    return typed === '*' ? '*' : { scope, id: typed }
  }

  const chosen = await select({
    message: `Which ${scope}?`,
    options: [
      ...names.map(name => ({ value: name, label: name })),
      { value: '*', label: `Every ${scope}`, hint: 'including ones added later' }
    ]
  })
  if (cancelled(chosen)) return undefined
  return chosen === '*' ? '*' : { scope, id: chosen }
}

/** Fields a database read or write grant covers, when the operator wants to narrow it. */
async function chooseFields (permission) {
  if (permission !== 'db:collection:read' && permission !== 'db:collection:write') return undefined

  const narrow = await confirm({
    message: 'Restrict this grant to particular fields?',
    initialValue: false
  })
  if (cancelled(narrow) || narrow !== true) return undefined

  const typed = await text({
    message: 'Which fields? (comma separated)',
    placeholder: 'title, body',
    validate: (value) => value.trim().length === 0 ? 'Name at least one field, or decline the restriction.' : undefined
  })
  if (cancelled(typed)) return undefined

  return typed.split(',').map(field => field.trim()).filter(field => field.length > 0)
}

async function composeGrant (catalogue) {
  const permission = await select({
    message: 'Which permission?',
    options: permissionOptions(),
    maxItems: 12
  })
  if (cancelled(permission)) return undefined

  const grant = { permission, resource: '*' }

  if (isResourceScoped(permission)) {
    const resource = await chooseResource(permission, catalogue)
    if (resource === undefined) return undefined
    grant.resource = resource

    const fields = await chooseFields(permission)
    if (fields !== undefined) grant.fields = fields
  }

  return grant
}

async function composeRole (catalogue) {
  const name = await text({
    message: 'Role name',
    placeholder: 'Copywriter',
    validate: (value) => value.trim().length === 0 ? 'A role needs a name.' : undefined
  })
  if (cancelled(name)) return

  const grants = []
  for (;;) {
    const grant = await composeGrant(catalogue)
    if (grant === undefined) return
    grants.push(grant)

    const more = await confirm({ message: 'Add another grant?', initialValue: false })
    if (cancelled(more)) return
    if (more !== true) break
  }

  note(
    `roles: {\n  ${name.trim()}: ${render(grants, 2)}\n}`,
    'Paste into authorization in genoa.config'
  )
  log.info('Declared roles are authoritative: immutable at runtime, and removed from the instance when removed from here.')
  outro('Composed.')
}

async function composeAssignment (catalogue) {
  const subject = await text({
    message: 'Subject (as issued by your authentication provider, never an email address)',
    placeholder: 'e0d5a1c4-5a0f-4a4e-9b3a-6d1c8f2b7a01',
    validate: (value) => value.trim().length === 0 ? 'An assignment needs a subject.' : undefined
  })
  if (cancelled(subject)) return

  const declared = catalogue.available ? Object.keys(catalogue.roles ?? {}) : []
  const roles = await text({
    message: declared.length > 0
      ? `Which roles? (comma separated; declared today: ${declared.join(', ')})`
      : 'Which roles? (comma separated)',
    placeholder: 'Administrator',
    validate: (value) => value.trim().length === 0 ? 'Name at least one role.' : undefined
  })
  if (cancelled(roles)) return

  const names = roles.split(',').map(role => role.trim()).filter(role => role.length > 0)

  note(
    `assignments: {\n  ${JSON.stringify(subject.trim())}: ${render(names, 2)}\n}`,
    'Paste into authorization in genoa.config'
  )
  outro('Composed.')
}

async function roles () {
  intro('Compose a role declaration')

  const catalogue = await loadCatalogue()
  if (!catalogue.available) {
    log.warn(`Could not read genoa.config, so bucket and collection names are not offered: ${catalogue.reason}`)
  }

  const what = await select({
    message: 'What would you like to compose?',
    options: [
      { value: 'role', label: 'A role', hint: 'a named set of grants' },
      { value: 'assignment', label: 'An assignment', hint: 'which roles a subject holds' }
    ]
  })
  if (cancelled(what)) return

  if (what === 'role') await composeRole(catalogue)
  else await composeAssignment(catalogue)
}

export default roles
