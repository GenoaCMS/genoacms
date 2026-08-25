import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import type { ComponentHeader, ComponentHeaderCreation, ComponentHeaderReference } from './component/types'
import { createComponentHeader } from './component.server'
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
 * ## Reading serves both kinds; writing serves prebuilt components only
 *
 * A dynamic component has a header too, so the storage these operations read holds both kinds. They
 * are **not** interchangeable here. Deleting a dynamic component means removing its definition, its
 * commits and every published executable, and it is gated on `components:register`; removing
 * only its header leaves all of that orphaned in the bucket, still signed and still verifying, while
 * the component disappears from the editor that would have fixed it.
 *
 * The catalog used to list both, so `components:register` could destroy a dynamic component
 * without holding `components:register` at all. Filtering the listing is not the fix — a
 * request naming a dynamic component directly would still be served. So every operation here reads
 * the **stored** type and refuses anything that is not prebuilt.
 *
 * The upload primitive is an upsert, but the two capabilities it serves are not the same: adding a
 * component to the catalog and altering one already in it are separate permissions. Rather than
 * probing storage to find out which is happening, this layer exposes the *intent* and lets the call
 * site declare it.
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

/**
 * Adds a prebuilt component to the catalog.
 *
 * `register` rather than `modify`, and the same permission deletion demands: a principal who may
 * adjust an existing component's attributes is not thereby allowed to add components to the catalog
 * that pages can then be built on.
 *
 * **Prebuilt only.** A dynamic component is registered through `registration.server.ts`, which
 * routes it to the editor's service so that its source definition is created too and
 * `components:register` is what decides it. Creating a dynamic component here would write a
 * header with no definition behind it — a component the editor cannot open and the catalog still
 * lists.
 */
const registerUserComponentHeader = async (
  ctx: AuthContext,
  creation: ComponentHeaderCreation
): Promise<ComponentHeader> => {
  requirePermission(ctx, 'components:register')
  if (creation.type !== 'prebuilt') throw new NotAPrebuiltComponentError(creation.name)
  return await createComponentHeader(creation)
}

/**
 * Every component in the registrar, of either kind.
 *
 * **The listing is not filtered.** It was narrowed to prebuilt components when the catalog could
 * destroy a dynamic one through the wrong service; the answer to that is the refusal on each write
 * below, not a shorter list. Filtering hid components that exist, and it hid them from every reader
 * of this function — including the page editor's component picker, where it meant **no page could be
 * rooted in a component authored in the CMS at all**.
 *
 * Describing both kinds in one place is the point of the registrar: a component's kind decides what
 * the CMS stores for it, not whether it can be seen.
 */
const listUserComponentHeaders = async (ctx: AuthContext): Promise<ComponentHeader[]> => {
  requirePermission(ctx, 'components:read')
  return await listOrCreateComponentHeaderList()
}

/**
 * One component's header, of either kind.
 *
 * Reading is not refused for a dynamic component: the registrar shows its shape like any other, and
 * a reader that refused would leave the registrar listing something it cannot open. What a dynamic
 * component's header does not yet accept is an **edit** — see `updateUserComponentHeader`.
 */
const getUserComponentHeader = async (
  ctx: AuthContext,
  reference: ComponentHeaderReference
): Promise<ComponentHeader | null> => {
  requirePermission(ctx, 'components:read')
  return await getComponentHeader(reference)
}

/**
 * Rewrites a component's description.
 *
 * **Prebuilt only, and this is temporary.** A dynamic component's attributes are still derived from
 * its source every time it is published, so an edit saved here would be silently overwritten by the
 * next publication — the author would describe a shape, publish, and find their description gone
 * with nothing to say why. Refusing is the honest behavior until the shape is authored rather than
 * analyzed, at which point this refusal goes and the registrar edits both kinds alike.
 */
const updateUserComponentHeader = async (ctx: AuthContext, entry: ComponentHeader) => {
  requirePermission(ctx, 'components:modify')
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
  requirePermission(ctx, 'components:read')
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
  requirePermission(ctx, 'components:modify')
  await requirePrebuilt(reference)
  return await undoComponentHeader(reference)
}

const redoUserComponentHeader = async (ctx: AuthContext, reference: ComponentHeaderReference) => {
  requirePermission(ctx, 'components:modify')
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
  requirePermission(ctx, 'components:register')
  await requirePrebuilt(name)
  return await deleteComponentHeader(name)
}

export {
  NotAPrebuiltComponentError,
  registerUserComponentHeader,
  listUserComponentHeaders,
  getUserComponentHeader,
  updateUserComponentHeader,
  getUserComponentHeaderDepth,
  undoUserComponentHeader,
  redoUserComponentHeader,
  deleteUserComponentHeader
}
