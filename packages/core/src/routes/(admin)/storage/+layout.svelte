<script lang="ts">
  import SelectActionRune from '$lib/script/storage/SelectActionRune.svelte'
  import { setContext } from 'svelte'

  const { data, children } = $props()
  const select = new SelectActionRune(data.selectionId)
  setContext('select', select)
</script>

{@render children()}
