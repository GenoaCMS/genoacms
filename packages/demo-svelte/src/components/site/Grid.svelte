<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import { columnsOf } from '@genoacms/demo-support/site'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { columns, items }: { columns: number, items: readonly ResolvedNode[] } = $props()
</script>

<div class="site-grid" style:--site-columns={columnsOf(columns)}><GenoaChildren nodes={items} /></div>
