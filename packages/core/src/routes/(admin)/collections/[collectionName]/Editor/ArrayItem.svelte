<script lang="ts">
  import type { Snippet } from 'svelte'
  import { dragHandle } from 'svelte-dnd-action'

  interface Props {
    position: number
    summary: string
    variant: string
    isCollapsible: boolean
    onremove: () => void
    children: Snippet
  }
  const { position, summary, variant, isCollapsible, onremove, children }: Props = $props()
  const bodyId = $props.id()
  let isOpen = $state(true)

  function toggle () {
    isOpen = !isOpen
  }
</script>

{#snippet handle ()}
  <div
    use:dragHandle
    aria-label="Drag item {position} to reorder"
    class="btn-icon btn-icon-sm text-surface-500 hover:text-surface-950-50 cursor-grab active:cursor-grabbing"
  >
    <i class="bi bi-grip-vertical text-lg"></i>
  </div>
{/snippet}

{#snippet remove ()}
  <button
    type="button"
    onclick={onremove}
    aria-label="Remove item {position}"
    title="Remove item"
    class="btn-icon btn-icon-sm text-surface-500 hover:preset-tonal-error"
  >
    <i class="bi bi-trash3"></i>
  </button>
{/snippet}

{#if isCollapsible}
  <div class="rounded-container border border-surface-200-800 bg-surface-50-950">
    <div class="flex items-center gap-1 ps-1 pe-2 py-1 {isOpen ? 'border-b border-surface-200-800' : ''}">
      {@render handle()}
      <button
        type="button"
        onclick={toggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        class="flex flex-1 min-w-0 items-center gap-2 py-1.5 text-start text-sm"
      >
        <i class="bi bi-chevron-right text-xs text-surface-500 transition-transform {isOpen ? 'rotate-90' : ''}"></i>
        <span class="text-surface-500 tabular-nums">#{position}</span>
        {#if variant}
          <span class="badge preset-tonal-primary">{variant}</span>
        {/if}
        <span class="truncate font-medium {summary ? '' : 'text-surface-500 italic font-normal'}">
          {summary || 'Untitled'}
        </span>
      </button>
      {@render remove()}
    </div>
    <div id={bodyId} hidden={!isOpen} class="p-4">
      {@render children()}
    </div>
  </div>
{:else}
  <div class="flex items-center gap-1">
    {@render handle()}
    <div class="flex-1 min-w-0">
      {@render children()}
    </div>
    {@render remove()}
  </div>
{/if}
