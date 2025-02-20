<script lang="ts">
  import StorageObject from './StorageObject.svelte'
  import EditSelection from './EditSelection.svelte'
  import { onDestroy } from 'svelte'
  import { ITC } from '$lib/script/utils'
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

  type Props = {
    value: Array<ObjectReference>,
    onvalue: (value: Array<ObjectReference>) => void
  }
  const { value, onvalue }: Props = $props()
  let resources: Array<ObjectReference> = $state(value || [])
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)

  function deleteResource (resource: ObjectReference) {
    resources = resources.filter(r => r !== resource)
    updateValue()
  }
  function clearResources () {
    resources = []
    updateValue()
  }
  function updateValue () {
    onvalue(resources)
  }

  itc.on('selectionInit', async () => {
    const parameters = {
      maxItems: 0
    }
    const selectionInitData = {
      parameters,
      defaultValue: $state.snapshot(resources)
    }
    console.log(selectionInitData)
    itc.send('selectionInitData', selectionInitData)
    const selection = await itc.once('selectionDone') as Array<ObjectReference>
    itc.send('selectionKill')
    if (selection.length < 1) return
    resources = selection
    updateValue()
  })

  onDestroy(() => {
    itc.close()
  })
</script>

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
