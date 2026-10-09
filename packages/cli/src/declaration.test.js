import { test, describe } from 'vitest'
import assert from 'node:assert/strict'
import { permissionOptions, render, renderKey } from './declaration.js'
import { permissions, isPermission } from '@genoacms/internal/authorization'

/**
 * The pure half of `genoacms roles`.
 *
 * The command's entire output is a snippet an operator pastes into `genoa.config`, so the property
 * worth asserting is that the snippet is valid JavaScript meaning exactly what was chosen. A printer
 * that emitted JSON-ish text would look right in a terminal and fail at import time.
 */

/** Evaluates a printed snippet the way pasting it into an object literal would. */
const evaluate = (snippet) => new Function(`return ({${snippet}})`)()

describe('the permissions offered', () => {
  test('CLI-11: are the whole vocabulary, and nothing invented', () => {
    const offered = permissionOptions().map(option => option.value)

    assert.deepEqual(new Set(offered), new Set(permissions))
    assert.ok(offered.every(permission => isPermission(permission)))
  })

  test('CLI-11: are grouped by domain, so the list is a choice rather than a scan', () => {
    const hints = permissionOptions().map(option => option.hint)
    assert.ok(hints.every(hint => typeof hint === 'string' && hint.length > 0))

    // Storage comes before configuration: the order is by domain, not the declaration order of the
    // table, which is what makes the list navigable.
    const offered = permissionOptions().map(option => option.value)
    assert.ok(offered.indexOf('storage:bucket:read') < offered.indexOf('config:roles:manage'))
  })

  test('CLI-11: say which resource kind a scoped permission needs', () => {
    const bucketOption = permissionOptions().find(option => option.value === 'storage:bucket:read')
    const instanceOption = permissionOptions().find(option => option.value === 'pages:read')

    assert.match(bucketOption.hint, /per bucket/)
    assert.doesNotMatch(instanceOption.hint, /per /)
  })
})

describe('the printed declaration', () => {
  const grants = [
    { permission: 'storage:bucket:read', resource: { scope: 'bucket', id: 'media' } },
    {
      permission: 'db:collection:read',
      resource: { scope: 'collection', id: 'products' },
      fields: ['name', 'price']
    },
    { permission: 'pages:publish', resource: '*' }
  ]

  test('CLI-11: is valid JavaScript that means what was composed', () => {
    const snippet = `roles: {\n  Copywriter: ${render(grants, 2)}\n}`
    const evaluated = evaluate(snippet)

    assert.deepEqual(evaluated.roles.Copywriter, grants)
  })

  test('CLI-11: quotes a subject that is not a valid identifier', () => {
    // Subjects are provider-issued and routinely contain characters an unquoted key cannot.
    const snippet = `assignments: {\n  ${JSON.stringify('e0d5a1c4-5a0f-4a4e')}: ${render(['Administrator'], 2)}\n}`
    const evaluated = evaluate(snippet)

    assert.deepEqual(evaluated.assignments['e0d5a1c4-5a0f-4a4e'], ['Administrator'])
  })

  test('CLI-11: renders the wildcard resource as a string, not an object', () => {
    // `resource: '*'` and `resource: { ... }` mean different things; printing one as the other would
    // silently widen or narrow the grant.
    const snippet = `roles: {\n  Admin: ${render([{ permission: 'pages:read', resource: '*' }], 2)}\n}`
    assert.equal(evaluate(snippet).roles.Admin[0].resource, '*')
  })

  test('CLI-11: omits fields when the grant carries none', () => {
    // Absence means every field; printing an empty list would mean the opposite.
    const snippet = `roles: {\n  Reader: ${render([grants[0]], 2)}\n}`
    assert.ok(!Object.hasOwn(evaluate(snippet).roles.Reader[0], 'fields'))
  })

  test('CLI-11: renders an empty grant list without breaking', () => {
    assert.equal(render([]), '[]')
  })

  test('CLI-11: a key is bare only when it is an identifier, and is otherwise a JSON string', () => {
    for (const key of ['Copywriter', '_editor', '$admin', 'Editor2']) assert.equal(renderKey(key), key)
    for (const key of ['2nd', '2nd-line', 'content-editor', 'Content editor', 'say "hi"', 'back\\slash', 'line\nbreak', '']) {
      assert.equal(renderKey(key), JSON.stringify(key))
      assert.deepEqual(new Function(`return ({ ${renderKey(key)}: 1 })`)(), { [key]: 1 })
    }
  })
})
