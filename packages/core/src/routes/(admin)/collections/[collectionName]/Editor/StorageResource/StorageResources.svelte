<script lang="ts">
  import StorageObject from './StorageObject.svelte'
  import EditSelection from './EditSelection.svelte'
  import { onDestroy } from 'svelte'
  import { ITC } from '$lib/script/utils'
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

  export let resources: Array<ObjectReference> = []
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)

  itc.on('selectionInit', async () => {
    const parameters = {
      maxItems: 0
    }
    const selectionInitData = {
      parameters,
      defaultValue: resources
    }
    itc.send('selectionInitData', selectionInitData)
    const selection = await itc.once('selectionDone') as Array<ObjectReference>
    itc.send('selectionKill')
    if (selection.length < 1) return
    resources = selection
  })

  onDestroy(() => {
    itc.close()
  })
</script>

<div class="flex flex-col border p-2">
  {#each resources as reference (reference)}
    <StorageObject {reference} />
  {:else}
    <div class="text-center w-auto m-auto m-5">
      No files selected yet
    </div>
  {/each}
  <EditSelection {selectionId} />
</div>
