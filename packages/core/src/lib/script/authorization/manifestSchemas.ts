import type { Schema } from '@exodus/schemasafe'
import { permissions } from './permissions'
import { WILDCARD } from './grants'

/**
 * Schemas for the authorization manifests held in the primary private bucket.
 *
 * Manifest content is untrusted: it is JSON in a bucket, and an actor able to write to that
 * bucket out-of-band bypasses the CMS entirely. These schemas are the boundary at which that
 * content becomes typed, so they are deliberately closed — every object rejects properties it
 * does not declare, and every string that names a permission is checked against the permission
 * table rather than accepted as free text.
 */

/**
 * Derived from the permission table, so a permission added or removed there cannot leave a
 * manifest schema that accepts a permission the CMS no longer honours, or rejects one it does.
 */
const permissionSelectorSchema: Schema = {
  type: 'string',
  enum: [...permissions, WILDCARD]
}

const namedResourceSchema: Schema = {
  type: 'object',
  properties: {
    scope: { type: 'string', enum: ['bucket', 'collection'] },
    id: { type: 'string', minLength: 1 }
  },
  required: ['scope', 'id'],
  additionalProperties: false
}

const resourceSelectorSchema: Schema = {
  anyOf: [
    { type: 'string', const: WILDCARD },
    namedResourceSchema
  ]
}

/**
 * Which fields a grant covers: the wildcard, or exactly the names listed.
 *
 * Optional on the grant, because absence means every field — the meaning every grant written before
 * field selection existed already carries. Requiring it would make every stored manifest invalid at
 * once, which for authorization data means quarantined and replaced.
 */
const fieldSelectorSchema: Schema = {
  anyOf: [
    { type: 'string', const: WILDCARD },
    { type: 'array', items: { type: 'string', minLength: 1 } }
  ]
}

const grantSchema: Schema = {
  type: 'object',
  properties: {
    permission: permissionSelectorSchema,
    resource: resourceSelectorSchema,
    fields: fieldSelectorSchema
  },
  required: ['permission', 'resource'],
  additionalProperties: false
}

/**
 * Roles are keyed by name and users by subject. A keyed object rather than an array makes
 * duplicate keys structurally impossible: two records for one subject would raise the question of
 * which one wins, and any answer to that is a fail-open hazard.
 */
const rolesManifestSchema: Schema = {
  type: 'object',
  properties: {
    roles: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: grantSchema
      }
    }
  },
  required: ['roles'],
  additionalProperties: false
}

const usersManifestSchema: Schema = {
  type: 'object',
  properties: {
    users: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          roles: {
            type: 'array',
            items: { type: 'string', minLength: 1 }
          }
        },
        required: ['email', 'roles'],
        additionalProperties: false
      }
    }
  },
  required: ['users'],
  additionalProperties: false
}

export {
  permissionSelectorSchema,
  namedResourceSchema,
  resourceSelectorSchema,
  fieldSelectorSchema,
  grantSchema,
  rolesManifestSchema,
  usersManifestSchema
}
