<script lang="ts">
  import SelectionStore from '$lib/script/storage/SelectionStore'
  import { setContext } from 'svelte'

  const { data } = $props()
  const selection = SelectionStore(data.selectionId)
  setContext('selection', selection)
</script>

<slot/>
