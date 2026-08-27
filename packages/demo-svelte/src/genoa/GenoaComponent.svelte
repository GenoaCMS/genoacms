<script lang="ts">
  import { isChildren, type ResolvedNode } from '@genoacms/sdk'
  import DomSubtree from './DomSubtree.svelte'
  import { bindingsOf } from './context'

  /**
   * Rendering a GenoaCMS page as **Svelte components**.
   *
   * By the time this runs the SDK has fetched every publication, verified every signature, checked
   * every pin, and put each node's values into its component's parameter order — none of it
   * framework-shaped. What is left is turning that into components.
   *
   * ## Positional in, named out
   *
   * A GenoaCMS component's attributes are positional; a Svelte component takes named props.
   * `bindings` says which becomes which, in the signed order. Spreading the page's own keys instead
   * would spread the attribute *titles*, which a Svelte component has no reason to be named after.
   *
   * ## A slot arrives as its children, and a component renders them with `<GenoaChildren>`
   *
   * **Not as a snippet.** A snippet was the first thing tried and it does not work: a snippet cannot
   * be built here and handed over as a prop to be called — `{@render}` needs a real snippet, and
   * wrapping one in an arrow produced a component that rendered nothing at all, silently and with no
   * error. Passing the children as data and giving consumers one component to render them with is
   * both simpler and the thing that works.
   *
   * `bindings` still travels by **context**, so a consumer's component never receives the wrapper's
   * machinery — only its values and a list of children.
   *
   * ## A dynamic component is a DOM node
   *
   * Code authored in the CMS compiles to a function returning a DOM node whose slot is `Node[]`. It
   * cannot be a Svelte component, so that subtree goes to the SDK's DOM renderer — `DomSubtree`.
   */
  const { node }: { node: ResolvedNode } = $props()

  const bindings = bindingsOf()
  const binding = $derived(bindings[node.name])

  /**
   * Each positional value under the prop name this consumer gave it.
   *
   * Not called `props`: a local of that name collides with the `$props` rune in the code Svelte
   * generates, and the error it produces — "`$props` used before its declaration" — points at the
   * rune rather than at the variable shadowing it.
   */
  const attributes = $derived(
    binding === undefined
      ? {}
      : Object.fromEntries(node.values.map((value, index) =>
          [binding.props[index] ?? `value${index}`, value]))
  )

  const Component = $derived(binding?.component)
</script>

{#if node.executable !== undefined}
  <DomSubtree {node} />
{:else if Component === undefined}
  <!--
    Refused rather than skipped. A page naming a component this application does not have is a page
    it cannot render, and a gap would serve a page quietly missing part of itself.
  -->
  <div class="refusal">
    <h2>component-not-supplied</h2>
    <pre>This application has no component for '{node.name}'.</pre>
  </div>
{:else}
  <Component {...attributes} />
{/if}
