import type { AuthContext } from '$lib/script/authorization/context'
import type { ComponentPublicationOrder, PublishedComponent } from './types'

import { requirePermission } from '$lib/script/authorization/enforce'
import { getComponentHeader } from '../componentHeader/io.server'
import { NoSuchComponentError } from '../editor/errors'
import { publishComponent, getPublishedComponent } from './index'

/**
 * Publishing, performed **by a user**.
 *
 * Every export takes an `AuthContext` first and checks a permission before delegating, so omitting
 * the context is a type error and the check lives with the operation rather than at the route.
 *
 * ## Two permissions, and the second one only sometimes
 *
 * Publishing always demands **`components:modify`** — R5's decision, and the only permission that
 * can gate an act a *prebuilt* component performs, since `components:code` names something a
 * prebuilt component does not have.
 *
 * A **dynamic** component additionally demands `components:code`, because publishing one compiles
 * its source and signs an executable that consumers will run. Without it, a principal holding only
 * `components:modify` — the curator who edits descriptions and cannot read a line of source — could
 * release code they are not permitted to see. That is precisely the "publisher who releases what
 * others wrote" arrangement **R11** recorded as deliberately given up, and it should not return by
 * accident through a surface that publishes both kinds.
 *
 * The extra demand is **dispatched on the component's stored type**, never on anything a caller
 * supplies, and it tracks exactly the thing the two kinds differ by. So it is the governing idea
 * rather than an exception to it: a component with executable code needs the permission that reaches
 * executable code.
 *
 * **This is my call rather than a decision on record**, and it is the strict reading. R5 says
 * `modify` is enough for publishing; it was written when only dynamic components could be published
 * and `modify` did not reach them. If the intent is that `modify` alone should release code, this is
 * the line to relax.
 */
const publishUserComponent = async (
  ctx: AuthContext,
  order: ComponentPublicationOrder
): Promise<PublishedComponent> => {
  requirePermission(ctx, 'components:modify')

  const header = await getComponentHeader(order.componentId)
  if (header === null) {
    throw new NoSuchComponentError(
      order.componentId,
      `components/no-such-component: ${order.componentId} does not exist.`
    )
  }
  if (header.type === 'dynamic') requirePermission(ctx, 'components:code')

  return await publishComponent(order, ctx.subject)
}

/**
 * What a component last published, for the registrar to show a status.
 *
 * Gated on the **catalog** permission rather than on `modify`. That a component has been published,
 * by whom and when, is the same order of fact as its name — and a principal who may see the catalog
 * but not change it still needs to know which components are actually usable on a page.
 */
const getUserPublishedComponent = async (
  ctx: AuthContext,
  uid: string
): Promise<PublishedComponent | null> => {
  requirePermission(ctx, 'components:read')
  return await getPublishedComponent(uid)
}

export { publishUserComponent, getUserPublishedComponent }
