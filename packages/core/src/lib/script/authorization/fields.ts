import { WILDCARD, grantSatisfies, type FieldSelector } from './grants'
import type { AuthContext } from './context'
import type { Permission } from './permissions'

/**
 * Field-level masking: which fields of a collection a principal may see or change, and
 * how a document is narrowed to them.
 *
 * Pure, so the rules can be tested without a database, and shared by the read and write paths so
 * the two cannot come to disagree about what a field list means.
 *
 * **Masking applies only where a restriction was expressed.** A grant with no field list, or the
 * explicit wildcard, covers every field — including fields added to the collection later. That is
 * what every grant written before field selection existed already meant, and reading absence as "no
 * fields" would revoke access retroactively on nothing but a format change.
 */

/** Fields a principal may act on: every field, or exactly the ones named. */
type PermittedFields = FieldSelector

const isUnrestricted = (permitted: PermittedFields): permitted is typeof WILDCARD =>
  permitted === WILDCARD

/**
 * The fields a principal may read, or write, on one collection.
 *
 * The union across every grant that satisfies the demand: holding two grants over the same
 * collection permits the fields of both, which is the only reading under which adding a grant
 * cannot take access away. One unrestricted grant makes the whole result unrestricted, for the same
 * reason.
 *
 * Returns an empty list when nothing satisfies the demand. That case does not arise through the
 * service layer — `requirePermission` has already refused — but returning "no fields" rather than
 * "every field" keeps the function fail-closed if it is ever called on its own.
 */
function permittedFields (
  context: AuthContext,
  permission: Permission,
  collection: string
): PermittedFields {
  const applicable = context.grants.filter(grant => grantSatisfies(grant, permission, collection))
  if (applicable.length === 0) return []

  const named = new Set<string>()
  for (const grant of applicable) {
    const fields = grant.fields ?? WILDCARD
    if (fields === WILDCARD) return WILDCARD
    for (const field of fields) named.add(field)
  }
  return [...named]
}

/**
 * A document with unreadable fields removed.
 *
 * Post-fetch projection: not every database adapter supports server-side field selection, so the
 * narrowing happens here, uniformly, after retrieval. The cost is that restricted data transits the
 * CMS process; the benefit is that the guarantee does not vary by adapter.
 */
function projectDocument<T extends object> (document: T, permitted: PermittedFields): Partial<T> {
  if (isUnrestricted(permitted)) return document

  const projected: Partial<T> = {}
  for (const field of permitted) {
    if (Object.hasOwn(document, field)) projected[field as keyof T] = document[field as keyof T]
  }
  return projected
}

/**
 * The document to store, given what was submitted and what is already there.
 *
 * **Merge, never replace.** Only fields the principal may write are taken from the submission;
 * every other field keeps its stored value. Without this, an editor who cannot read
 * `wholesale_price` could erase it simply by submitting a record without it — the submission would
 * look like an instruction to clear the field rather than the absence of permission to see it.
 *
 * An unrestricted principal's submission passes through unchanged, so masking changes nothing for
 * anyone who was not restricted in the first place.
 */
function mergeDocument<T extends object> (
  stored: T,
  submitted: Partial<T>,
  permitted: PermittedFields
): Partial<T> {
  if (isUnrestricted(permitted)) return submitted

  const merged: Partial<T> = { ...stored }
  for (const field of permitted) {
    if (Object.hasOwn(submitted, field)) merged[field as keyof T] = submitted[field as keyof T]
  }
  return merged
}

/**
 * The fields of a submission a principal may set when there is nothing stored yet.
 *
 * Creation has no record to merge against, so a field the principal may not write is simply not
 * theirs to set: it is dropped rather than refused, matching the merge path, where an unwritable
 * field in a submission is ignored instead of failing the whole write.
 */
function writableDocument<T extends object> (submitted: Partial<T>, permitted: PermittedFields): Partial<T> {
  if (isUnrestricted(permitted)) return submitted
  return projectDocument(submitted as T, permitted)
}

export {
  permittedFields,
  projectDocument,
  mergeDocument,
  writableDocument
}

export type {
  PermittedFields
}
