<script lang="ts">
  import StorageObject from './StorageObject.svelte'
  import EditSelection from './EditSelection.svelte'
  import { onDestroy } from 'svelte'
  import { ITC } from '$lib/script/utils'
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

  //type Props = {
  //  name: string
  //  resources: Array<ObjectReference>
  //}
  //let { name = '', resources = $bindable([]) }: Props = $props()
  export let name: string
  export let resources: Array<ObjectReference>
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)

  function deleteResource (resource: ObjectReference) {
    resources = resources.filter(r => r !== resource)
    resources = [...resources]
  }
  function clearResources () {
    resources = []
  }

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

<input type="hidden" {name} value={JSON.stringify(resources)}>
<div class="flex flex-col border p-2">
  {#each resources as resource, index (resources, index)}
    <StorageObject {resource} {deleteResource}/>
  {:else}
    <div class="text-center text-xl w-auto m-auto pb-3 pt-2">
      No files selected yet
    </div>
  {/each}
  <EditSelection {selectionId} clear={clearResources}/>
</div>
