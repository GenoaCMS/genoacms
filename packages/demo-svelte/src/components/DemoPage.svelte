<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'
  import type { ResolvedNode } from '@genoacms/sdk'
  import GenoaChildren from '../genoa/GenoaChildren.svelte'

  /** The page root: a slot and nothing else. An ordinary Svelte component that knows no GenoaCMS. */
  const { body }: { body: readonly ResolvedNode[] } = $props()
</script>

<main class={ui.demoPage}><GenoaChildren nodes={body} /></main>
