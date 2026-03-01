<script lang="ts">
  import type { ResourcesValue, Errors } from '../types'
  import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
  import type { JSONSchemaType } from 'ajv'
  import { onDestroy } from 'svelte'
  import { ITC } from '$lib/script/utils'
  import StorageObject from './StorageObject.svelte'
  import EditSelection from './EditSelection.svelte'
  import { Helper } from '$lib/components/ui/index'

  type Props = {
    schema: JSONSchemaType<ResourcesValue>,
    value: ResourcesValue,
    errors: Errors,
    onvalue: (value: ResourcesValue) => void
  }
  const { schema, value, errors, onvalue }: Props = $props()
  let resources: ResourcesValue = $state(value || [])
  const minItems = $derived(schema.minItems || 0)
  const maxItems = $derived(schema.maxItems || 0)
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
      maxItems
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
  <div class="pt-1">
    {resources.length} / {maxItems || '∞'}
  </div>

  {#if errors}
    <Helper color="red">
      Invalid
    </Helper>
  {/if}
</div>
