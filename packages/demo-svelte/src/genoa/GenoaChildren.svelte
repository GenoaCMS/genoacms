<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import GenoaComponent from './GenoaComponent.svelte'

  /**
   * A slot's children, rendered.
   *
   * The one GenoaCMS-shaped thing a consumer's component imports. It exists because Svelte has no
   * value that means "already-rendered content" the way a React element or a Vue vnode does — so a
   * slot arrives as **data**, and this is what turns it back into components.
   *
   * It needs no bindings of its own: they come from context, set once at the root.
   */
  const { nodes }: { nodes: readonly ResolvedNode[] } = $props()
</script>

{#each nodes as node, index (index)}
  <GenoaComponent {node} />
{/each}
