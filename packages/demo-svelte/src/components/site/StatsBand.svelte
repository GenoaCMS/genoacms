<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import { ui } from '@genoacms/demo-support/ui'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { stats }: { stats: readonly ResolvedNode[] } = $props()
</script>

<section class={ui.stats}><div class={ui.statsInner}><GenoaChildren nodes={stats} /></div></section>
