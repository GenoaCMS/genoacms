<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import GenoaChildren from '../genoa/GenoaChildren.svelte'

  /** A titled region holding other components — what makes the tree nest. */
  const { heading, content }: { heading: string, content: readonly ResolvedNode[] } = $props()
</script>

<section class="section">
  <h2 class="section-heading">{heading}</h2>
  <GenoaChildren nodes={content} />
</section>
