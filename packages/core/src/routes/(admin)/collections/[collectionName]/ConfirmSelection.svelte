<script lang="ts">
  import type { SelectActionRune } from '$lib/script/database/SelectActionRune.svelte'
  import { getContext } from 'svelte'
  import selection from '$lib/script/database/SelectionRune.svelte'

  const selectAction: SelectActionRune = getContext('select')
  function confirmSelection () {
    selectAction.submit()
  }
</script>

{#if selectAction.isActive && !selection.isEmpty}
    <button
    type="button"
    onclick={confirmSelection}
    aria-label="Confirm selection"
    class="h-full flex items-center px-3">
     <i class="bi bi-check-all text-2xl hover:text-warning transition-all"></i>
    </button>
{/if}
