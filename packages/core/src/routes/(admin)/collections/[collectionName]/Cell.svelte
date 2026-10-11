<script lang="ts">
  import type { Cell, CellLook } from './listing'

  interface Props {
    cell: Cell
    isLead?: boolean
    isEndAligned?: boolean
  }
  const { cell, isLead = false, isEndAligned = false }: Props = $props()

  const LOOKS: Record<CellLook, string> = {
    text: '',
    mono: 'font-mono text-xs',
    number: 'text-end tabular-nums',
    check: 'text-success-600-400',
    muted: 'text-surface-500'
  }
</script>

<!-- LST-1, LST-8 -->
<span title={cell.title} class="truncate px-3 py-2 {LOOKS[cell.look]} {isLead ? 'font-medium' : ''} {isEndAligned ? 'text-end' : ''}">
  {#if cell.look === 'check'}
    <i class="bi bi-check-lg" aria-hidden="true"></i><span class="sr-only">{cell.title}</span>
  {:else}
    {cell.text}
  {/if}
</span>
