import type { AuthContext } from '$lib/script/authorization/context'
import type { ComponentHeaderCreation, ComponentHeaderReference } from './componentHeader/component/types'
import { getComponentHeader } from './componentHeader/io.server'
import { deleteUserComponentHeader, registerUserComponentHeader } from './componentHeader/user.server'
import { createUserComponent, deleteUserComponent } from './editor/user.server'

/**
 * Registering a component, of either kind.
 *
 * Both kinds are created here, in one act, because the registrar is the one place a component is
 * born. They used to be created in two: a prebuilt component through the catalog's own remote
 * function, a dynamic one through the editor's create action — two surfaces, two vocabularies, and
 * the same document at the end of both.
 *
 * ## What the type decides, and what it does not
 *
 * **It does not decide the permission.** Registering is `components:register` whichever kind is
 * chosen, because both produce a component the CMS describes the same way and lists in the same
 * catalog. Reaching a component's *source* is `components:code`, which is a capability a dynamic
 * component has and a prebuilt one has no use for — so the line the permissions draw is between
 * describing a component and writing its code, not between the two kinds.
 *
 * What the type decides is **what gets stored**: a prebuilt component is a header, and a dynamic one
 * is a header and a source definition. Creating a dynamic component through the header service alone
 * would write a description with nothing behind it — a component the editor cannot open while the
 * catalog goes on listing it — so the branch exists to reach the service that creates both.
 *
 * ## Why this sits above the two services rather than inside either
 *
 * The editor already imports the header module, so the reverse would be a cycle. This module knows
 * about both and neither knows about it. Nothing is checked here directly: each branch delegates to
 * a `*User*` service that performs its own check, so this stays a router and the permission lives
 * with the operation.
 */
const registerUserComponent = async (
  ctx: AuthContext,
  creation: ComponentHeaderCreation
): Promise<ComponentHeaderReference> => {
  if (creation.type === 'dynamic') return await createUserComponent(ctx, creation.name)

  const header = await registerUserComponentHeader(ctx, creation)
  return header.uid
}

/**
 * Removes a component, of either kind, with everything it owns.
 *
 * The counterpart to registering, and it dispatches for the same reason: what a component *is*
 * differs by kind even though what it looks like does not. A prebuilt component is a header. A
 * dynamic one is a header, a source definition, every commit under it, and every executable it ever
 * published — each of those signed and independently verifiable, so an artifact left behind goes on
 * verifying for a component that no longer exists.
 *
 * **Reads the stored kind**, never one the caller supplies: the request names a component, and a
 * client free to say what kind it is could delete a dynamic component through the header path and
 * strand the rest. That was a real defect — the catalog listed both kinds and deleting there removed
 * only the header — and it was answered by hiding dynamic components from the catalog. Routing the
 * deletion is the answer that lets the registrar show them again.
 *
 * A reference naming nothing is left to the header service, which reports it the way every other
 * missing component is reported.
 */
const deleteUserComponentByReference = async (
  ctx: AuthContext,
  reference: ComponentHeaderReference
): Promise<void> => {
  const header = await getComponentHeader(reference)
  if (header?.type === 'dynamic') {
    // Deleting needs the component's name as well as its uid, and the header is where it lives.
    await deleteUserComponent(ctx, { uid: header.uid, name: header.name })
    return
  }
  await deleteUserComponentHeader(ctx, reference)
}

export {
  registerUserComponent,
  deleteUserComponentByReference
}
