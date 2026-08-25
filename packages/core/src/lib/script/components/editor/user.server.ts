import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import type { Component, ComponentDefinition, ComponentReference } from './types'
import {
  createComponent,
  listOrCreateComponentList,
  getComponent,
  getComponentDefiniton,
  updateComponentDefinition,
  commitComponentDefinition,
  deleteComponent
} from './index'

/**
 * Dynamic component operations performed **by a user**.
 *
 * The module beside this one is the primary service and stays unprivileged, matching the split used
 * by storage, database, prebuilt components and pages: the CMS reads and writes its own component
 * state during bootstrap and compilation, before any principal exists.
 *
 * Every export here takes an `AuthContext` first and checks a permission before delegating, so
 * omitting the context is a *type error* and the check lives with the operation rather than at the
 * route. Each function is its primary counterpart with `User` in the name.
 *
 * ## Why this layer arrived late
 *
 * It did not exist at all until now: the editor's routes and remote functions called the primary
 * module directly, so **every dynamic-component operation was unenforced** while
 * `components:dynamic:*` sat in the taxonomy consumed by nothing — a permission that decides
 * nothing looks like a control and is not one.
 *
 * ## The permissions, and why each is the one demanded
 *
 * - `components:dynamic:manage` — a component's **existence**: creating one, and deleting it.
 *   Deleting destroys the source outright, which no amount of `edit` should imply, and creating
 *   also registers a header in the prebuilt catalog.
 * - `components:dynamic:view_code` — reading a definition. Source is the thing worth restricting
 *   here; the catalog of *names* is `components:prebuilt:read`, which the listing demands.
 * - `components:dynamic:edit` — writing the draft. The editor saves as it is typed, so this is the
 *   permission the autosave path demands on every keystroke that lands.
 * - `components:dynamic:commit` — the highest-value permission in the system: it runs static
 *   analysis, compiles, signs with the key hierarchy and publishes an executable that consumers
 *   will run.
 *
 * Creating and deleting also touch the prebuilt catalog, but they are **not** additionally gated
 * on `components:prebuilt:register`: a coded component's header is how the CMS stores it, not a
 * separate thing an operator registers, and demanding both would make authoring impossible without
 * a permission whose own description is about plugins and packages.
 */

/**
 * The coded components this instance has.
 *
 * Names and ids only, so it demands the catalog permission rather than the source one. A
 * principal who may see that a component exists is not thereby permitted to read what it does.
 */
const listUserComponents = async (ctx: AuthContext): Promise<Component[]> => {
  requirePermission(ctx, 'components:prebuilt:read')
  return await listOrCreateComponentList()
}

const getUserComponent = async (ctx: AuthContext, uid: string): Promise<Component> => {
  requirePermission(ctx, 'components:prebuilt:read')
  return await getComponent(uid)
}

const getUserComponentDefinition = async (
  ctx: AuthContext,
  reference: ComponentReference
): Promise<ComponentDefinition> => {
  requirePermission(ctx, 'components:dynamic:view_code')
  return await getComponentDefiniton(reference)
}

const createUserComponent = async (ctx: AuthContext, name: string): Promise<string> => {
  requirePermission(ctx, 'components:dynamic:manage')
  return await createComponent(name)
}

const updateUserComponentDefinition = async (
  ctx: AuthContext,
  reference: ComponentReference,
  updater: (definition: ComponentDefinition) => ComponentDefinition
): Promise<void> => {
  requirePermission(ctx, 'components:dynamic:edit')
  await updateComponentDefinition(reference, updater)
}

/**
 * Commits the draft: analyze, compile, sign, publish.
 *
 * Gated on `commit` alone rather than on `edit` as well. Committing does write the definition, but
 * demanding `edit` too would prevent the arrangement the taxonomy exists to allow — a small trusted
 * set that may publish what others have authored without being able to alter it first.
 *
 * **The author comes from here, not from the order.** `ctx.subject` is what the session established;
 * the order is what the browser sent. The commit is attributed to the principal who was permitted to
 * make it, and the signed executable built from it carries that name, so a client able to supply it
 * could attribute its own publication to someone else.
 */
const commitUserComponentDefinition = async (
  ctx: AuthContext,
  order: Parameters<typeof commitComponentDefinition>[0]
): Promise<void> => {
  requirePermission(ctx, 'components:dynamic:commit')
  await commitComponentDefinition(order, ctx.subject)
}

const deleteUserComponent = async (ctx: AuthContext, component: Component): Promise<void> => {
  requirePermission(ctx, 'components:dynamic:manage')
  await deleteComponent(component)
}

export {
  listUserComponents,
  getUserComponent,
  getUserComponentDefinition,
  createUserComponent,
  updateUserComponentDefinition,
  commitUserComponentDefinition,
  deleteUserComponent
}
