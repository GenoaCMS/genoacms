import { command, getRequestEvent } from '$app/server'
import { validator } from '@exodus/schemasafe'
import type { Json } from '@exodus/schemasafe'
import { componentHeaderCreationSchema } from '$lib/script/components/componentHeader/component/schemas'
import { registerUserComponent } from '$lib/script/components/registration.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { ComponentCodeError } from '$lib/script/components/editor/errors'

const validate = validator(componentHeaderCreationSchema)

/**
 * Registers a component of either kind.
 *
 * The type arrives from the switch on the form, and is validated as one of the two the schema names
 * before anything reads it — an unrecognized value would otherwise be stored as a component's type
 * and decide, for the rest of its life, how a page resolves it.
 *
 * **The permission is not checked here.** `registerUserComponent` dispatches on the type and each
 * branch demands its own, so a principal who may register a prebuilt component cannot obtain a
 * dynamic one by flipping the switch. Checking here as well would put the decision in two places,
 * and the one nearer the storage is the one that cannot be bypassed.
 *
 * A refusal is returned rather than thrown so the modal can report it, and that includes a **name
 * the source of a coded component could never declare** — the name is its entry function, so
 * `my-hero` would create a component that can never be published. It is a form error like any other
 * and the author fixes it by typing a different name.
 *
 * The permission check does throw, which is the correct shape for it: an unauthorized creation is
 * not a form error to be corrected, and the route's error boundary answers it.
 */
export const createComponent = command('unchecked', async (data: unknown) => {
  if (!validate(data as Json)) return { status: 'fail', text: 'Invalid data' }

  const ctx = requireAuthContext(getRequestEvent().locals)
  try {
    const uid = await registerUserComponent(ctx, data as { name: string, type: 'prebuilt' | 'dynamic' })
    return { status: 'success', text: 'Component created', uid }
  } catch (error) {
    if (error instanceof ComponentCodeError) return { status: 'fail', text: error.message }
    throw error
  }
})
