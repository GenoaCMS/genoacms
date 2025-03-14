<script lang="ts">
  import SelectActionRune from '$lib/script/storage/SelectActionRune.svelte'
  import { setContext } from 'svelte'

  const { data, children } = $props()
  const selection = new SelectActionRune(data.selectionId)
  setContext('select', selection)
</script>

{@render children?.()}
