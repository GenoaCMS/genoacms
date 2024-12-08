<script lang="ts">
  import StorageObject from './StorageObject.svelte'
  import EditSelection from './EditSelection.svelte'
  import { onDestroy } from 'svelte'
  import { ITC } from '$lib/script/utils'
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

  type Props = {
    name: string
    value: Array<ObjectReference>
  }
  let { name = '', value = $bindable() }: Props = $props()
  let resources: Array<ObjectReference> = $state(value || [])
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)

  function deleteResource (resource: ObjectReference) {
    resources = resources.filter(r => r !== resource)
    value = resources
  }
  function clearResources () {
    resources = []
    value = resources
  }

  itc.on('selectionInit', async () => {
    const parameters = {
      maxItems: 0
    }
    const selectionInitData = {
      parameters,
      defaultValue: $state.snapshot(resources)
    }
    itc.send('selectionInitData', selectionInitData)
    const selection = await itc.once('selectionDone') as Array<ObjectReference>
    itc.send('selectionKill')
    if (selection.length < 1) return
    resources = selection
    value = resources
  })

  onDestroy(() => {
    itc.close()
  })
</script>

<input type="hidden" {name} value={JSON.stringify(resources)}>
<div class="flex flex-col">
  {#each resources as resource, index (resources, index)}
    <StorageObject {resource} {deleteResource}/>
  {:else}
    <div class="text-center text-xl w-auto m-auto pb-3 pt-2">
      No files selected yet
    </div>
  {/each}
  <EditSelection {selectionId} clear={clearResources}/>
</div>
