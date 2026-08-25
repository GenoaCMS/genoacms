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
 * module directly, so **every operation here was unenforced** while the component permissions sat
 * in the taxonomy consumed by nothing — a permission that decides nothing looks like a control and
 * is not one.
 *
 * ## The two permissions, and why they are two
 *
 * - `components:register` — a component's **existence**: creating one, and deleting it. Deleting
 *   destroys the source and every publication outright, which no amount of authoring should imply,
 *   and creating brings a component into the catalog that pages can then be built on. It is the same
 *   permission that registers a component whose code lives in the consuming application, because
 *   existence is the same act for both kinds.
 * - `components:code` — **everything a component's source is**: reading it, writing the draft, and
 *   publishing it. The highest-value permission in the system, since publishing runs static
 *   analysis, compiles, signs with the key hierarchy and produces an executable that consumers will
 *   run.
 *
 * Reading and writing and publishing used to be three permissions — `view_code`, `edit` and
 * `commit` — which allowed a reviewer who could not write and a publisher who could not author.
 * **Those arrangements are no longer expressible**, deliberately: one permission reaches source at
 * all, and anything holding it holds all three.
 *
 * The catalog of *names* is `components:read`, which the listing demands, and which is not implied
 * by holding the source permission: seeing what a component does and seeing that it exists are
 * different questions.
 */

/**
 * The coded components this instance has.
 *
 * Names and ids only, so it demands the catalog permission rather than the source one. A
 * principal who may see that a component exists is not thereby permitted to read what it does.
 */
const listUserComponents = async (ctx: AuthContext): Promise<Component[]> => {
  requirePermission(ctx, 'components:read')
  return await listOrCreateComponentList()
}

const getUserComponent = async (ctx: AuthContext, uid: string): Promise<Component> => {
  requirePermission(ctx, 'components:read')
  return await getComponent(uid)
}

const getUserComponentDefinition = async (
  ctx: AuthContext,
  reference: ComponentReference
): Promise<ComponentDefinition> => {
  requirePermission(ctx, 'components:code')
  return await getComponentDefiniton(reference)
}

const createUserComponent = async (ctx: AuthContext, name: string): Promise<string> => {
  requirePermission(ctx, 'components:register')
  return await createComponent(name)
}

const updateUserComponentDefinition = async (
  ctx: AuthContext,
  reference: ComponentReference,
  updater: (definition: ComponentDefinition) => ComponentDefinition
): Promise<void> => {
  requirePermission(ctx, 'components:code')
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
  requirePermission(ctx, 'components:code')
  await commitComponentDefinition(order, ctx.subject)
}

const deleteUserComponent = async (ctx: AuthContext, component: Component): Promise<void> => {
  requirePermission(ctx, 'components:register')
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
