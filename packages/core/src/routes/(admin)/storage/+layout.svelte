<script lang="ts">
  import SelectionStore from '$lib/script/storage/SelectionStore'
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import { setContext } from 'svelte'

  const { data } = $props()
  const selection = SelectionStore<ObjectReference>(data.selectionId)
  setContext('selection', selection)
</script>

<slot/>
