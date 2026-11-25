<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { stats }: { stats: readonly ResolvedNode[] } = $props()
</script>

<section class="site-stats">
  <div class="site-container site-stats__inner"><GenoaChildren nodes={stats} /></div>
</section>
