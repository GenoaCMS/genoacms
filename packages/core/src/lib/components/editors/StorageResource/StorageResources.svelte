<script lang="ts">
  import type { ResourcesValue, Errors } from '../types'
  import type { ObjectReference } from '@genoacms/contracts/storage'
  import type { SchemaObject } from '$lib/script/schema'
  import { onDestroy } from 'svelte'
  import { resolve } from '$app/paths'
  import { ITC } from '$lib/script/utils'
  import StorageObject from './StorageObject.svelte'
  import PickerButton from '../PickerButton.svelte'
  import { Helper } from '$lib/components/ui/index'

  type Props = {
    schema: SchemaObject;
    value: ResourcesValue;
    errors?: Errors;
    onvalue: (value: ResourcesValue) => void;
  }
  const { schema, value, errors, onvalue }: Props = $props()
  let resources: ResourcesValue = $state(value || [])
  const maxItems = $derived(schema.maxItems || 0)
  const selectionId = crypto.randomUUID()
  const pickerHref = `${resolve('/storage')}?selectionId=${selectionId}`
  const pickerLabel = $derived(resources.length === 0 ? 'Choose files from storage' : 'Edit selection')
  const itc = new ITC(selectionId)

  function deleteResource (resource: ObjectReference) {
    resources = resources.filter((r) => r !== resource)
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
      maxItems,
    }
    const selectionInitData = {
      parameters,
      defaultValue: $state.snapshot(resources),
    }
    itc.send('selectionInitData', selectionInitData)
    const selection = (await itc.once(
      'selectionDone'
    )) as Array<ObjectReference>
    itc.send('selectionKill')
    if (selection.length < 1) return
    resources = selection
    updateValue()
  })

  onDestroy(() => {
    itc.close()
  })
</script>

<div class="flex flex-col gap-2">
  {#each resources as resource, index (index)}
    <StorageObject {resource} {deleteResource} />
  {/each}
  <PickerButton
    href={pickerHref}
    label={pickerLabel}
    icon="bi-folder2-open"
    onclear={resources.length > 0 ? clearResources : undefined}
  />

  {#if errors}
    <Helper class="text-error-500">Invalid</Helper>
  {/if}
</div>
