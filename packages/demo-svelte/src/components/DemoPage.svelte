<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import GenoaChildren from '../genoa/GenoaChildren.svelte'

  /** The page root: a slot and nothing else. An ordinary Svelte component that knows no GenoaCMS. */
  const { body }: { body: readonly ResolvedNode[] } = $props()
</script>

<main class="page"><GenoaChildren nodes={body} /></main>
