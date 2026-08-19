import {
  permissions,
  getPermissionDomain,
  getPermissionScope
} from '@genoacms/cloudabstraction/authorization'

/**
 * The pure parts of composing a declaration: what to offer, and how to print it.
 *
 * Separate from the prompts so both can be tested without a terminal — the printed snippet is the
 * command's entire output, so "is it valid JavaScript that means what was chosen" is the thing worth
 * asserting.
 */

/** Permission options, grouped by domain so the list is a choice rather than a scan. */
function permissionOptions () {
  const domains = ['storage', 'database', 'content', 'configuration']
  return domains.flatMap(domain =>
    permissions
      .filter(permission => getPermissionDomain(permission) === domain)
      .map(permission => ({
        value: permission,
        label: permission,
        hint: getPermissionScope(permission) === 'instance' ? domain : `${domain}, per ${getPermissionScope(permission)}`
      }))
  )
}

/** Renders a value as the JavaScript an operator pastes, rather than as JSON. */
function render (value, indent = 0) {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map(item => `${pad}  ${render(item, indent + 2)}`)
    return `[\n${items.join(',\n')}\n${pad}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) =>
      `${pad}  ${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${render(item, indent + 2)}`)
    return `{\n${entries.join(',\n')}\n${pad}}`
  }
  return JSON.stringify(value)
}

export {
  permissionOptions,
  render
}
