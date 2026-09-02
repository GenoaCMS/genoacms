import { defineComponent, h, onMounted, ref, type Component, type VNode } from 'vue'
import { renderResolved, isChildren, type ResolvedNode, type ResolvedValue } from '@genoacms/sdk'

/**
 * Rendering a GenoaCMS page as **Vue components**.
 *
 * The Vue half of what `resolvePage` makes possible. By the time anything here runs, the SDK has
 * fetched every publication, verified every signature, checked every pin and put each node's values
 * into its component's parameter order — none of which is framework-shaped. What is left is turning
 * that into vnodes.
 *
 * ## Positional in, named out
 *
 * A GenoaCMS component's attributes are positional; a Vue component takes named props. `bindings`
 * says which becomes which, in the order the publication signed. A wrapper that spread the page's own
 * keys as props would be spreading the attribute *titles*, which a Vue component has no reason to be
 * named after.
 *
 * ## Slots arrive as vnodes, not as a slot function
 *
 * Passed as a **prop** rather than through `v-slot`. A GenoaCMS slot is a list of children in a fixed
 * order with no name and no scope, which is a prop; routing it through Vue's slot machinery would add
 * a naming convention that neither the CMS nor the SDK has.
 *
 * ## A dynamic component is a DOM node
 *
 * Code authored in the CMS compiles to a function returning a DOM node whose slot is `Node[]`. It
 * cannot take vnodes and cannot be a Vue component, so that subtree goes to the SDK's DOM renderer
 * and the node it returns is placed. Every framework wrapper does the same with one.
 */

/** A Vue component for a published one, and the prop names its values map onto, in order. */
interface Binding {
  component: Component
  /** The prop each positional value becomes. Must match the publication's `attributeOrder`. */
  props: readonly string[]
}

type Bindings = Record<string, Binding>

/**
 * A subtree the CMS compiled, rendered by the SDK and placed as it stands.
 *
 * A ref and `onMounted` rather than `v-html`: the SDK produces a live node, and serializing it to
 * markup would discard every handler the component attached.
 */
const DomSubtree = defineComponent({
  name: 'GenoaDomSubtree',
  props: { node: { type: Object as () => ResolvedNode, required: true } },
  setup (props) {
    const host = ref<HTMLElement | null>(null)
    onMounted(() => {
      void renderResolved(props.node).then(rendered => {
        host.value?.replaceChildren(
          rendered.ok ? rendered.value : document.createComment(rendered.reason)
        )
      })
    })
    return () => h('div', { ref: host })
  }
})

/**
 * One resolved node as a vnode.
 *
 * Recurses into slots first, so a parent is given its children already built.
 */
const GenoaComponent = defineComponent({
  name: 'GenoaComponent',
  props: {
    node: { type: Object as () => ResolvedNode, required: true },
    bindings: { type: Object as () => Bindings, required: true }
  },
  setup (props) {
    return (): VNode => {
      const { node, bindings } = props
      if (node.executable !== undefined) return h(DomSubtree, { node })

      const binding = bindings[node.name]
      if (binding === undefined) {
        // Refused rather than skipped: a page naming a component this application does not have is a
        // page it cannot render, and a gap would serve a page quietly missing part of itself.
        throw new Error(`component-not-supplied: this application has no component for '${node.name}'`)
      }

      const asProp = (value: ResolvedValue, index: number): [string, unknown] => {
        const name = binding.props[index] ?? `value${index}`
        if (!isChildren(value)) return [name, value]
        return [name, value.map((child, position) =>
          h(GenoaComponent, { node: child, bindings, key: `${child.name}-${position}` }))]
      }

      return h(binding.component, Object.fromEntries(node.values.map(asProp)))
    }
  }
})

export { GenoaComponent, DomSubtree }
export type { Binding, Bindings }
