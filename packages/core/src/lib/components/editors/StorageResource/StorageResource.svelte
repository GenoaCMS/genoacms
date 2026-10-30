<script lang="ts">
  import type { ResourceValue, Errors } from '../types'
  import type { ObjectReference } from '@genoacms/contracts/storage'
  import { onDestroy } from 'svelte'
  import { resolve } from '$app/paths'
  import { ITC } from '$lib/script/utils'
  import StorageObject from './StorageObject.svelte'
  import PickerButton from '../PickerButton.svelte'
  import { Helper } from '$lib/components/ui/index'

  type Props = {
    value: ResourceValue,
    errors?: Errors,
    onvalue: (value: ResourceValue) => void
  }
  const { value, errors, onvalue }: Props = $props()
  let resource: ResourceValue = $state(value || null)
  const selectionId = crypto.randomUUID()
  const pickerHref = `${resolve('/storage')}?selectionId=${selectionId}`
  const itc = new ITC(selectionId)

  function deleteResource () {
    resource = null
    updateValue()
  }
  function updateValue () {
    onvalue(resource)
  }

  itc.on('selectionInit', async () => {
    const parameters = {
      maxItems: 1
    }
    const selectionInitData = {
      parameters,
      defaultValue: resource ? [$state.snapshot(resource)] : []
    }
    itc.send('selectionInitData', selectionInitData)
    const selection = await itc.once('selectionDone') as Array<ObjectReference>
    itc.send('selectionKill')
    if (selection.length < 1) return
    resource = selection[0]
    updateValue()
  })

  onDestroy(() => {
    itc.close()
  })
</script>

<div class="flex flex-col gap-2">
  {#if resource}
    <StorageObject {resource} {deleteResource}/>
  {:else}
    <PickerButton href={pickerHref} label="Choose a file from storage" icon="bi-folder2-open" />
  {/if}
  {#if errors}
    <Helper class="text-error-700-300">Invalid</Helper>
  {/if}
</div>
