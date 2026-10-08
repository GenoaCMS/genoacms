<script lang="ts">
  import SelectActionRune from '$lib/script/storage/SelectActionRune.svelte'
  import { setContext, untrack } from 'svelte'

  const { data, children } = $props()
  const select = new SelectActionRune(untrack(() => data.selectionId))
  setContext('select', select)
</script>

{@render children()}
