import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import type { ComponentHeader, ComponentHeaderReference } from './component/types'
import {
  listOrCreateComponentHeaderList,
  getComponentHeader,
  deleteComponentHeader
} from './io.server'
import {
  saveComponentHeader,
  undoComponentHeader,
  redoComponentHeader,
  getComponentHeaderDepth
} from './editing.server'
import type { HistoryDepth } from './editing.server'

/**
 * Prebuilt component operations performed **by a user**.
 *
 * `io.server` is the primary service and stays unprivileged: `page/entry/index.ts` reads component
 * headers while deserializing page nodes, which happens during rendering rather than in response to
 * a user's action on the catalog.
 *
 * Content permissions are **instance-scoped** — the architecture defines no per-component grants —
 * so no resource is passed.
 *
 * ## This layer serves prebuilt components only
 *
 * A dynamic component has a header too, so the storage these operations read holds both kinds. They
 * are **not** interchangeable here. Deleting a dynamic component means removing its definition, its
 * commits and every published executable, and it is gated on `components:dynamic:manage`; removing
 * only its header leaves all of that orphaned in the bucket, still signed and still verifying, while
 * the component disappears from the editor that would have fixed it.
 *
 * The catalog used to list both, so `components:prebuilt:register` could destroy a dynamic component
 * without holding `components:dynamic:manage` at all. Filtering the listing is not the fix — a
 * request naming a dynamic component directly would still be served. So every operation here reads
 * the **stored** type and refuses anything that is not prebuilt.
 *
 * The upload primitive is an upsert, but the two capabilities it serves are not the same: adding a
 * component to the catalog and altering one already in it are separate permissions. Rather than
 * probing storage to find out which is happening, this layer exposes the *intent* and lets the call
 * site declare it. Registration has no route yet, so no wrapper for it exists.
 */

/** Raised when an operation for prebuilt components is aimed at a dynamic one. */
class NotAPrebuiltComponentError extends Error {
  constructor (readonly reference: ComponentHeaderReference) {
    super(
      `components/not-prebuilt: ${reference} is a dynamic component. It is created, edited and ` +
      'deleted through the component editor, which removes its definition, its commits and every ' +
      'executable it published along with it.'
    )
    this.name = 'NotAPrebuiltComponentError'
  }
}

/**
 * Refuses a reference that does not name a prebuilt component.
 *
 * Reads the **stored** header rather than trusting a type the caller supplied: an update carries a
 * whole header, and a client is free to put `prebuilt` in it.
 */
const requirePrebuilt = async (reference: ComponentHeaderReference): Promise<ComponentHeader> => {
  const entry = await getComponentHeader(reference)
  if (entry === null) throw new NotAPrebuiltComponentError(reference)
  if (entry.type !== 'prebuilt') throw new NotAPrebuiltComponentError(reference)
  return entry
}

const listUserComponentEntries = async (ctx: AuthContext): Promise<ComponentHeader[]> => {
  requirePermission(ctx, 'components:prebuilt:read')
  const entries = await listOrCreateComponentHeaderList()
  return entries.filter(entry => entry.type === 'prebuilt')
}

const getUserComponentHeader = async (
  ctx: AuthContext,
  reference: ComponentHeaderReference
): Promise<ComponentHeader | null> => {
  requirePermission(ctx, 'components:prebuilt:read')
  return await requirePrebuilt(reference)
}

const updateUserComponentHeader = async (ctx: AuthContext, entry: ComponentHeader) => {
  requirePermission(ctx, 'components:prebuilt:modify')
  await requirePrebuilt(entry.uid)
  return await saveComponentHeader(entry)
}

/**
 * How far a component can be undone and redone.
 *
 * Gated on `read`, not `modify`: knowing that an edit is reversible is part of seeing the component,
 * and the buttons it drives are already behind their own permission gate.
 */
const getUserComponentHeaderDepth = async (
  ctx: AuthContext,
  reference: ComponentHeaderReference
): Promise<HistoryDepth> => {
  requirePermission(ctx, 'components:prebuilt:read')
  await requirePrebuilt(reference)
  return await getComponentHeaderDepth(reference)
}

/**
 * Moving through a component's editing history.
 *
 * Gated on `modify`, because both change what the component is. Undo is not a lesser action than an
 * edit — it *is* an edit, expressed as the reverse of one.
 */
const undoUserComponentHeader = async (ctx: AuthContext, reference: ComponentHeaderReference) => {
  requirePermission(ctx, 'components:prebuilt:modify')
  await requirePrebuilt(reference)
  return await undoComponentHeader(reference)
}

const redoUserComponentHeader = async (ctx: AuthContext, reference: ComponentHeaderReference) => {
  requirePermission(ctx, 'components:prebuilt:modify')
  await requirePrebuilt(reference)
  return await redoComponentHeader(reference)
}

/**
 * Removes a component from the catalog.
 *
 * Gated on `register` rather than `modify`: removal is the inverse of registration, so a principal
 * who may not add a component may not delete one either. Letting `modify` cover it would mean a role
 * meant to edit attributes could destroy a component that pages depend on.
 */
const deleteUserComponentHeader = async (ctx: AuthContext, name: string) => {
  requirePermission(ctx, 'components:prebuilt:register')
  await requirePrebuilt(name)
  return await deleteComponentHeader(name)
}

export {
  NotAPrebuiltComponentError,
  listUserComponentEntries,
  getUserComponentHeader,
  updateUserComponentHeader,
  getUserComponentHeaderDepth,
  undoUserComponentHeader,
  redoUserComponentHeader,
  deleteUserComponentHeader
}
