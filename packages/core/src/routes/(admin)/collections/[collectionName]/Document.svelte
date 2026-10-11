<script lang="ts">
  import type { CollectionReference, DocumentReference } from '@genoacms/contracts/database'
  import Selectable from './Selectable.svelte'
  import Cell from './Cell.svelte'
  import { gridTemplate, isEndAligned, type Cell as CellValue, type Column } from './listing'

  interface Props {
    reference: DocumentReference<CollectionReference>
    columns: Column[]
    cells: CellValue[]
  }
  const { reference, columns, cells }: Props = $props()
</script>

<Selectable id={reference.id}>
  <!-- LST-1 -->
  <a href="{reference.collection.name}/{reference.id}"
    class="grid items-center border-b border-surface-200-800 text-sm hover:bg-surface-100-900/60"
    style:grid-template-columns={gridTemplate(columns)}>
    {#each columns as column, index (column.name)}
      <Cell cell={cells[index]} isLead={column.isLead} isEndAligned={isEndAligned(column)} />
    {/each}
  </a>
</Selectable>
