<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import { columnsOf } from '@genoacms/demo-support/site'
  import { ui } from '@genoacms/demo-support/ui'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { columns, items }: { columns: number, items: readonly ResolvedNode[] } = $props()
</script>

<div class={ui.grid} style:--grid-columns={columnsOf(columns)}><GenoaChildren nodes={items} /></div>
