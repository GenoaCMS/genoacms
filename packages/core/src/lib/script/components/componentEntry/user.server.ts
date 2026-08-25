import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import type { ComponentEntry, ComponentEntryReference } from './component/types'
import {
  listOrCreateComponentEntryList,
  getComponentEntry,
  deleteComponentEntry
} from './io.server'
import {
  saveComponentEntry,
  undoComponentEntry,
  redoComponentEntry,
  getComponentEntryDepth
} from './editing.server'
import type { HistoryDepth } from './editing.server'

/**
 * Prebuilt component operations performed **by a user**.
 *
 * `io.server` is the primary service and stays unprivileged: `page/entry/index.ts` reads component
 * entries while deserializing page nodes, which happens during rendering rather than in response to
 * a user's action on the catalog.
 *
 * Content permissions are **instance-scoped** — the architecture defines no per-component grants —
 * so no resource is passed.
 *
 * The upload primitive is an upsert, but the two capabilities it serves are not the same: adding a
 * component to the catalog and altering one already in it are separate permissions. Rather than
 * probing storage to find out which is happening, this layer exposes the *intent* and lets the call
 * site declare it. Registration has no route yet, so no wrapper for it exists.
 */

const listUserComponentEntries = async (ctx: AuthContext): Promise<ComponentEntry[]> => {
  requirePermission(ctx, 'components:prebuilt:read')
  return await listOrCreateComponentEntryList()
}

const getUserComponentEntry = async (
  ctx: AuthContext,
  reference: ComponentEntryReference
): Promise<ComponentEntry | null> => {
  requirePermission(ctx, 'components:prebuilt:read')
  return await getComponentEntry(reference)
}

const updateUserComponentEntry = async (ctx: AuthContext, entry: ComponentEntry) => {
  requirePermission(ctx, 'components:prebuilt:modify')
  return await saveComponentEntry(entry)
}

/**
 * How far a component can be undone and redone.
 *
 * Gated on `read`, not `modify`: knowing that an edit is reversible is part of seeing the component,
 * and the buttons it drives are already behind their own permission gate.
 */
const getUserComponentEntryDepth = async (
  ctx: AuthContext,
  reference: ComponentEntryReference
): Promise<HistoryDepth> => {
  requirePermission(ctx, 'components:prebuilt:read')
  return await getComponentEntryDepth(reference)
}

/**
 * Moving through a component's editing history.
 *
 * Gated on `modify`, because both change what the component is. Undo is not a lesser action than an
 * edit — it *is* an edit, expressed as the reverse of one.
 */
const undoUserComponentEntry = async (ctx: AuthContext, reference: ComponentEntryReference) => {
  requirePermission(ctx, 'components:prebuilt:modify')
  return await undoComponentEntry(reference)
}

const redoUserComponentEntry = async (ctx: AuthContext, reference: ComponentEntryReference) => {
  requirePermission(ctx, 'components:prebuilt:modify')
  return await redoComponentEntry(reference)
}

/**
 * Removes a component from the catalog.
 *
 * Gated on `register` rather than `modify`: removal is the inverse of registration, so a principal
 * who may not add a component may not delete one either. Letting `modify` cover it would mean a role
 * meant to edit attributes could destroy a component that pages depend on.
 */
const deleteUserComponentEntry = async (ctx: AuthContext, name: string) => {
  requirePermission(ctx, 'components:prebuilt:register')
  return await deleteComponentEntry(name)
}

export {
  listUserComponentEntries,
  getUserComponentEntry,
  updateUserComponentEntry,
  getUserComponentEntryDepth,
  undoUserComponentEntry,
  redoUserComponentEntry,
  deleteUserComponentEntry
}
