import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import type { Component, ComponentDefinition, ComponentReference } from './types'
import type { SignaturePreview } from '@genoacms/internal/languageAdapter'
import { getComponentHeader } from '../componentHeader/io.server'
import { NoSuchComponentError } from './errors'
import { signatureFor } from './compilation'
import {
  createComponent,
  listOrCreateComponentList,
  getComponent,
  getComponentDefiniton,
  deleteComponent
} from './index'
import {
  saveComponentBody,
  undoComponentBody,
  redoComponentBody,
  getComponentDefinitionDepth,
  type HistoryDepth
} from './editing.server'

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
 *   stepping that draft backwards and forwards through its history. It is also the second permission
 *   publishing a *dynamic* component demands, on top of `components:modify` — see
 *   `publication/user.server.ts`, which owns that act now.
 *
 * Reading and writing used to be separate from publishing — `view_code`, `edit` and `commit` — which
 * allowed a reviewer who could not write. **That arrangement is no longer expressible**,
 * deliberately: one permission reaches source at all, and anything holding it holds both.
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

/**
 * The signature the component's body is wrapped in.
 *
 * Gated with the source rather than with the catalog: it is derived from the shape, which is public
 * enough, but it is only ever shown beside the code and a principal who may not read the code has no
 * page to show it on.
 */
const getUserComponentSignature = async (
  ctx: AuthContext,
  reference: ComponentReference
): Promise<SignaturePreview> => {
  requirePermission(ctx, 'components:code')
  const [definition, header] = await Promise.all([
    getComponentDefiniton(reference),
    getComponentHeader(reference)
  ])
  if (header === null) throw new NoSuchComponentError(reference, `components/no-such-component: ${reference} does not exist.`)
  return await signatureFor(definition.language, {
    attributes: header.attributes,
    attributeOrder: header.attributeOrder
  })
}

const getUserComponentDefinition = async (
  ctx: AuthContext,
  reference: ComponentReference
): Promise<ComponentDefinition> => {
  requirePermission(ctx, 'components:code')
  return await getComponentDefiniton(reference)
}

/**
 * Brings a coded component into existence.
 *
 * **A component's name is unconstrained**, and that is new. It used to have to be an identifier,
 * because it was the entry function the author's source had to declare and export — so a component
 * called `my-hero` could be created and never published, and the only error it could ever produce
 * was that no such function existed. The CMS emits the entry function now, under a fixed name of
 * its own, so a component's name is a label a person reads and nothing else.
 */
const createUserComponent = async (ctx: AuthContext, name: string): Promise<string> => {
  requirePermission(ctx, 'components:register')
  return await createComponent(name)
}

/**
 * Writes the draft, and records a step that can be undone.
 *
 * Takes a **body** rather than an updater. The updater form let a caller rewrite any member of the
 * stored definition — including `publishedBody` and `lastPublicationId`, which say what a component
 * has released — through a permission meant for authoring. Narrowing it to the one member an author
 * edits makes the reachable set of writes the same as the intended one.
 */
const saveUserComponentBody = async (
  ctx: AuthContext,
  reference: ComponentReference,
  body: string
): Promise<HistoryDepth> => {
  requirePermission(ctx, 'components:code')
  return await saveComponentBody(reference, body)
}

/**
 * Steps the draft backwards or forwards.
 *
 * Gated with writing rather than with reading: both rewrite the stored body, and a principal
 * permitted only to read source must not be able to move it.
 */
const undoUserComponentBody = async (
  ctx: AuthContext,
  reference: ComponentReference
): Promise<ComponentDefinition> => {
  requirePermission(ctx, 'components:code')
  return await undoComponentBody(reference)
}

const redoUserComponentBody = async (
  ctx: AuthContext,
  reference: ComponentReference
): Promise<ComponentDefinition> => {
  requirePermission(ctx, 'components:code')
  return await redoComponentBody(reference)
}

/**
 * How far the history runs in each direction, which is what enables or disables the two controls.
 *
 * Gated with the source, because it is only ever shown beside the code: a principal who may not read
 * a component's body has no page for it to appear on.
 */
const getUserComponentDefinitionDepth = async (
  ctx: AuthContext,
  reference: ComponentReference
): Promise<HistoryDepth> => {
  requirePermission(ctx, 'components:code')
  return await getComponentDefinitionDepth(reference)
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
  getUserComponentSignature,
  saveUserComponentBody,
  undoUserComponentBody,
  redoUserComponentBody,
  getUserComponentDefinitionDepth,
  deleteUserComponent
}
