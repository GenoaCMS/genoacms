<script lang="ts">
  import type { SelectActionRune } from '$lib/script/storage/SelectActionRune.svelte'
  import selection from '$lib/script/storage/SelectionRune.svelte'
  import { getContext } from 'svelte'

  type Props = {
    selectAll: () => void
  }
  const { selectAll }: Props = $props()
  const selectAction: SelectActionRune = getContext('select')
  function submitSelectAction () {
    selectAction.submit()
  }
  function clearSelection () {
    selection.clear()
  }
</script>

{#if selectAction.isActive && !selection.isEmpty}
    <button type="button" aria-label="Select all" onclick={submitSelectAction}
    class="h-full flex items-center px-3">
     <i class="bi bi-check-all text-2xl hover:text-warning transition-all"></i>
    </button>
  {:else if !selection.isEmpty}
    <button type="button" aria-label="Unselect all" onclick={clearSelection}
    class="h-full flex items-center px-3">
     <i class="bi bi-slash-square text-2xl hover:text-warning transition-all"></i>
    </button>
{:else}
    <button type="button" aria-label="Select all" onclick={selectAll}
    class="h-full flex items-center px-3">
     <i class="bi bi-square text-2xl hover:text-warning transition-all"></i>
    </button>
{/if}
