<script lang="ts">
  import SelectActionRune from '$lib/script/database/SelectActionRune.svelte'
  import { setContext, untrack } from 'svelte'

  const { data, children } = $props()
  const selection = new SelectActionRune(untrack(() => data.selectionId))
  setContext('select', selection)
</script>

{@render children?.()}
