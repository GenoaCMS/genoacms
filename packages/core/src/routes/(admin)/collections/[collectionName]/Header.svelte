<script lang="ts">
  import { SELECTION_GUTTER } from '#lib/script/selection/gutter.js'
  import { gridTemplate, isEndAligned, type Column } from './listing'

  interface Props {
    columns: Column[]
  }
  const { columns }: Props = $props()
</script>

<div class="flex bg-surface-100-900/40 border-b border-surface-200-800 font-medium text-xs">
  <div class="{SELECTION_GUTTER} shrink-0"></div>
  <!-- LST-1 -->
  <div data-testid="listing-header" class="grid grow min-w-0" style:grid-template-columns={gridTemplate(columns)}>
    {#each columns as column (column.name)}
      <span class="truncate px-3 py-2 {isEndAligned(column) ? 'text-end' : ''}" title={column.name}>{column.name}</span>
    {/each}
  </div>
</div>
