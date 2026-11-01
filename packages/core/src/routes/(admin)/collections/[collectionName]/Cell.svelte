<script lang="ts">
  import type { Cell, CellLook } from './listing'
  import { AFTER_SELECTION_GUTTER } from '#lib/script/selection/gutter.js'

  interface Props {
    cell: Cell
    isLead?: boolean
    isEndAligned?: boolean
    isPinned?: boolean
  }
  const { cell, isLead = false, isEndAligned = false, isPinned = false }: Props = $props()

  const LOOKS: Record<CellLook, string> = {
    text: '',
    mono: 'font-mono text-xs',
    number: 'text-end tabular-nums',
    check: 'text-success-800-200',
    muted: 'text-surface-600-400'
  }
</script>

<!-- LST-1, LST-8 -->
<span title={cell.title} class="truncate px-3 py-3 md:py-2 {LOOKS[cell.look]} {isLead ? 'font-medium' : ''} {isEndAligned ? 'text-end' : ''} {isPinned ? `sticky ${AFTER_SELECTION_GUTTER} self-stretch bg-surface-50-950 group-hover:bg-surface-100-900` : ''}">
  {#if cell.look === 'check'}
    <i class="bi bi-check-lg" aria-hidden="true"></i><span class="sr-only">{cell.title}</span>
  {:else}
    {cell.text}
  {/if}
</span>
