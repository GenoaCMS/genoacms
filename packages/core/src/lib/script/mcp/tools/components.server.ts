import { validator } from '@exodus/schemasafe'
import type { AuthContext } from '$lib/script/authorization/context'
import { requirePermission } from '$lib/script/authorization/enforce'
import { componentHeaderSchema } from '$lib/script/components/componentHeader/component/schemas'
import type { Attribute, ComponentHeader } from '$lib/script/components/componentHeader/component/types'
import { getComponentHeaderVersioned } from '$lib/script/components/componentHeader/io.server'
import {
  getUserComponentHeaderVersioned,
  listUserComponentHeaders,
  updateUserComponentHeader
} from '$lib/script/components/componentHeader/user.server'
import { getComponent } from '$lib/script/components/editor/index'
import { NoSuchComponentError } from '$lib/script/components/editor/errors'
import {
  getUserComponentDefinitionVersioned,
  getUserComponentSignature,
  saveUserComponentBody
} from '$lib/script/components/editor/user.server'
import { getUserPublishedComponent, publishUserComponent } from '$lib/script/components/publication/user.server'
import { deleteUserComponentByReference, registerUserComponent } from '$lib/script/components/registration.server'

type Args = Record<string, unknown>

interface AttributeInput {
  uid?: string
  type: Attribute['type']
  schema: Attribute['schema']
}

const validateHeader = validator(componentHeaderSchema, { includeErrors: true })

const absent = (uid: string): NoSuchComponentError =>
  new NoSuchComponentError(uid, `components/no-such-component: ${uid} does not exist.`)

const publicationOf = async (ctx: AuthContext, uid: string) => {
  const pointer = await getUserPublishedComponent(ctx, uid)
  return pointer === null ? null : { publicationId: pointer.publicationId, publishedAt: pointer.publishedAt }
}

/** TOL-2 */
async function listComponents (ctx: AuthContext) {
  const headers = await listUserComponentHeaders(ctx)
  return await Promise.all(headers.map(async header => ({
    uid: header.uid,
    name: header.name,
    type: header.type,
    publication: await publicationOf(ctx, header.uid)
  })))
}

/** TOL-2 */
async function getComponentTool (ctx: AuthContext, { uid }: Args) {
  const read = await getUserComponentHeaderVersioned(ctx, uid as string)
  if (read === null) throw absent(uid as string)
  const { header, version } = read
  return {
    uid: header.uid,
    name: header.name,
    type: header.type,
    attributes: header.attributeOrder.map(key => header.attributes[key]),
    publication: await publicationOf(ctx, header.uid),
    version
  }
}

/** TOL-3 */
async function createComponent (ctx: AuthContext, { name, type }: Args) {
  const uid = await registerUserComponent(ctx, { name: name as string, type: type as ComponentHeader['type'] })
  return { uid, version: (await getComponentHeaderVersioned(uid))?.version }
}

function attributeOf (input: AttributeInput, existing: ComponentHeader, taken: Set<string>): Attribute {
  const uid = input.uid ?? crypto.randomUUID()
  const unknown = input.uid !== undefined && (!Object.hasOwn(existing.attributes, uid) || taken.has(uid))
  if (unknown) throw new Error(`components/unknown-attribute: ${uid}`)
  taken.add(uid)
  return { uid, name: input.schema.title, type: input.type, schema: input.schema } as Attribute
}

function headerWith (existing: ComponentHeader, name: string, inputs: AttributeInput[]): ComponentHeader {
  const taken = new Set<string>()
  const attributes = inputs.map(input => attributeOf(input, existing, taken))
  return {
    ...existing,
    name,
    attributes: Object.fromEntries(attributes.map(attribute => [attribute.uid, attribute])),
    attributeOrder: attributes.map(attribute => attribute.uid)
  }
}

/** TOL-4 */
async function updateComponent (ctx: AuthContext, { uid, version, name, attributes }: Args) {
  requirePermission(ctx, 'components:modify')
  const existing = (await getComponentHeaderVersioned(uid as string))?.header
  if (existing === undefined) throw absent(uid as string)
  const header = headerWith(existing, name as string, attributes as AttributeInput[])
  if (!validateHeader(header as never)) throw new Error(`components/invalid-header: ${JSON.stringify(validateHeader.errors ?? [])}`)
  const saved = await updateUserComponentHeader(ctx, header, version as string)
  return { version: saved.version }
}

/** TOL-5 */
async function getComponentSource (ctx: AuthContext, { uid }: Args) {
  requirePermission(ctx, 'components:code')
  await getComponent(uid as string)
  const { definition, version } = await getUserComponentDefinitionVersioned(ctx, uid as string)
  return {
    language: definition.language,
    body: definition.body,
    signature: await getUserComponentSignature(ctx, uid as string),
    version
  }
}

/** TOL-5 */
async function saveComponentSource (ctx: AuthContext, { uid, version, body }: Args) {
  requirePermission(ctx, 'components:code')
  await getComponent(uid as string)
  const saved = await saveUserComponentBody(ctx, uid as string, body as string, version as string)
  return { version: saved.version, signature: await getUserComponentSignature(ctx, uid as string) }
}

/** TOL-6 */
async function publishComponent (ctx: AuthContext, { uid, note }: Args) {
  const { record, warnings } = await publishUserComponent(ctx, { componentId: uid as string, note: note as string })
  return { publicationId: record.publicationId, publishedAt: record.publishedAt, warnings }
}

/** TOL-7 */
async function deleteComponent (ctx: AuthContext, { uid }: Args) {
  requirePermission(ctx, 'components:register')
  await deleteUserComponentByReference(ctx, uid as string)
  return { deleted: uid }
}

export {
  listComponents,
  getComponentTool as getComponent,
  createComponent,
  updateComponent,
  getComponentSource,
  saveComponentSource,
  publishComponent,
  deleteComponent
}
