import { getContext, setContext } from 'svelte'
import type { Component } from 'svelte'
import type { RenderOptions } from '@genoacms/sdk'

/**
 * How the wrapper reaches its bindings without every component passing them on.
 *
 * A slot's children are rendered by the wrapper recursing into itself, and the recursion needs to
 * know which Svelte component each published name maps to. Threading that through as a prop would
 * make it part of every consumer component's signature — for no reason of theirs — so it travels by
 * context, set once at the root.
 */

/**
 * A Svelte component for a published one, and the prop names its values map onto, in order.
 *
 * `Component<Record<string, unknown>>` rather than a precise prop type: a binding holds components
 * with *different* prop shapes in one map, and the wrapper builds their props from a signed
 * publication rather than from anything the type system can see. Narrowing this would be claiming a
 * guarantee that the CMS, not TypeScript, is the one making.
 */
interface Binding {
  component: Component<Record<string, unknown>>
  /** The prop each positional value becomes. Must match the publication's `attributeOrder`. */
  props: readonly string[]
}

type Bindings = Record<string, Binding>

const KEY = Symbol('genoacms.bindings')
const OPTIONS_KEY = Symbol('genoacms.renderOptions')

const provideBindings = (bindings: Bindings): void => { setContext(KEY, bindings) }

const bindingsOf = (): Bindings => getContext<Bindings>(KEY) ?? {}

/** What the application grants dynamic components: `passthrough`, `document`, `fetch`. */
const provideRenderOptions = (options: RenderOptions): void => { setContext(OPTIONS_KEY, options) }

const renderOptionsOf = (): RenderOptions => getContext<RenderOptions>(OPTIONS_KEY) ?? {}

export { provideBindings, bindingsOf, provideRenderOptions, renderOptionsOf }
export type { Binding, Bindings }
