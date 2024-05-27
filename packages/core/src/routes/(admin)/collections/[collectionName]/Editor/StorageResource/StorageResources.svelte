<script lang="ts">
  import StorageObject from './StorageObject.svelte'
  import EditSelection from './EditSelection.svelte'
  import { onDestroy } from 'svelte' 
  import { ITC } from '$lib/script/utils'

  export let allowMutliple: boolean = false
  export let resources: Array<object> = []
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)

  function canSelectMore(resources: Array<string>) {
    return allowMutliple || resources.length === 0
  }

  itc.on('storageReady', async () => {
    itc.send('parameters', {
      maxItems: 1,
      selection: resources
    })
    const selection = await itc.once('submit')
    if (selection.length < 1) return
    resources = selection
    itc.send('done')
    console.log(selection)
  })

  onDestroy(() => {
    itc.close()
  })
</script>

<div class="flex border p-2">
  {#each resources as resource}
    <StorageObject {resource} {allowMutliple} />
  {:else}
    <div class="w-auto m-auto">
      No files selected yet
    </div>
  {/each}
  <EditSelection {selectionId} />
</div>

