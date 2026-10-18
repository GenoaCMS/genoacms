<script lang="ts">
  import type { ObjectReference } from '@genoacms/contracts/storage'
  import type { SelectActionRune } from '$lib/script/storage/SelectActionRune.svelte'
  import selection from '$lib/script/storage/SelectionRune.svelte'
  import { getContext } from 'svelte'

  type Props = {
    entries: ObjectReference[]
  }
  const { entries }: Props = $props()
  const selectAction: SelectActionRune = getContext('select')
  function selectAll () {
    selection.selectAll(entries)
  }
  function confirmSelection () {
    selectAction.submit()
  }
  function clearSelection () {
    selection.clear()
  }
</script>

<!-- BRW-5, BRW-12 -->
{#if selectAction.isActive && !selection.isEmpty}
    <button type="button" aria-label="Confirm selection" onclick={confirmSelection}
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
