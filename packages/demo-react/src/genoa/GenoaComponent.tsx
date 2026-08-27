import { createElement, useEffect, useRef, type ReactNode, type ComponentType } from 'react'
import { renderResolved, isChildren, type ResolvedNode, type ResolvedValue } from '@genoacms/sdk'

/**
 * Rendering a GenoaCMS page as **React components**.
 *
 * This is the wrapper — the whole of what a React consumer writes, and the reason `resolvePage`
 * exists separately from `renderPage`. The SDK has already fetched every publication, verified every
 * signature, checked every pin and put each node's values into its component's parameter order.
 * What is left is turning that into elements, which is the only part React has an opinion about.
 *
 * ## Positional in, named out
 *
 * A GenoaCMS component's attributes are **positional** — the signed `attributeOrder` is what says
 * which value is which. React components take **named** props. So a consumer maps one to the other,
 * and that mapping is `componentFor` below: each component declares the names it wants, in order.
 *
 * Doing it any other way means guessing. The page's own keys are the attribute *titles*, which a
 * React component has no reason to be named after, and a wrapper that spread them as props would
 * hand `<Card Title=… body=…>` to a component expecting `title` and `text`.
 *
 * ## Dynamic components are not React components, and cannot be
 *
 * A component authored in the CMS is compiled to a function that returns a **DOM node** and takes its
 * slot as `Node[]`. It cannot receive React children and cannot be an element. So a node carrying an
 * `executable` is handed to the SDK's DOM renderer as a whole subtree, and the node that comes back
 * is placed in a `<div>` by `DomSubtree`.
 *
 * That is not a gap in this wrapper. It is what compiling a component for the web means, and every
 * framework wrapper does the same thing with it.
 */

/** A React component for a published one, and the prop names its values map onto, in order. */
interface Binding {
  component: ComponentType<Record<string, unknown>>
  /** The prop each positional value becomes. Must match the publication's `attributeOrder`. */
  props: readonly string[]
}

type Bindings = Record<string, Binding>

/**
 * A subtree the CMS compiled, rendered by the SDK and placed as it stands.
 *
 * `useRef` and an effect rather than `dangerouslySetInnerHTML`: the SDK produces a live node, and
 * serializing it to markup would throw away every event handler the component attached.
 */
const DomSubtree = ({ node }: { node: ResolvedNode }): ReactNode => {
  const host = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void renderResolved(node).then(rendered => {
      if (cancelled || host.current === null) return
      host.current.replaceChildren(rendered.ok ? rendered.value : document.createComment(rendered.reason))
    })
    return () => { cancelled = true }
  }, [node])

  return createElement('div', { ref: host })
}

/**
 * One resolved node as a React element.
 *
 * Recurses into slots first, so a parent is given its children already built — the same shape the
 * SDK's own renderer uses, expressed in React's terms.
 */
const GenoaComponent = ({ node, bindings }: { node: ResolvedNode, bindings: Bindings }): ReactNode => {
  if (node.executable !== undefined) return createElement(DomSubtree, { node })

  const binding = bindings[node.name]
  if (binding === undefined) {
    // Refused rather than skipped. A page naming a component this application does not have is a
    // page it cannot render; dropping the section would serve a page quietly missing part of itself.
    throw new Error(`component-not-supplied: this application has no component for '${node.name}'`)
  }

  const asProp = (value: ResolvedValue, index: number): [string, unknown] => {
    const name = binding.props[index] ?? `value${index}`
    if (!isChildren(value)) return [name, value]
    return [
      name,
      value.map((child, position) =>
        createElement(GenoaComponent, { node: child, bindings, key: `${child.name}-${position}` }))
    ]
  }

  const props = Object.fromEntries(node.values.map(asProp))
  return createElement(binding.component, props)
}

export { GenoaComponent, DomSubtree }
export type { Binding, Bindings }
