import type { AuthContext } from '$lib/script/authorization/context'
import type { ComponentHeaderCreation, ComponentHeaderReference } from './componentHeader/component/types'
import { registerUserComponentHeader } from './componentHeader/user.server'
import { createUserComponent } from './editor/user.server'

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

export {
  registerUserComponent
}
