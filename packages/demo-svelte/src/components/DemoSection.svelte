<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'
  import type { ResolvedNode } from '@genoacms/sdk'
  import GenoaChildren from '../genoa/GenoaChildren.svelte'

  /** A titled region holding other components — what makes the tree nest. */
  const { heading, content }: { heading: string, content: readonly ResolvedNode[] } = $props()
</script>

<section class={ui.demoSection}>
  <h2 class={ui.demoSectionHeading}>{heading}</h2>
  <GenoaChildren nodes={content} />
</section>
