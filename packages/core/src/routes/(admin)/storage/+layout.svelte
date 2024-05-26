<script lang="ts">
  import SelectionStore from '$lib/script/storage/SelectionStore'
  import { setContext } from 'svelte'

  export let data
  const selection = SelectionStore(data.selectionId)
  setContext('selection', selection)
</script>

<slot/>
