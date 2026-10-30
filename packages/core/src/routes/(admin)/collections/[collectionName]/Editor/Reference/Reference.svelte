<script lang="ts">
  import type { SchemaObject } from '#lib/script/schema.js'
  import { onDestroy } from 'svelte'
  import { resolve } from '$app/paths'
  import { ITC } from '#lib/script/utils.js'
  import PickerButton from '#lib/components/editors/PickerButton.svelte'
  import DocumentReference from './DocumentReference.svelte'

  type T = string | number | boolean
  type Props = {
    schema: SchemaObject;
    value: T | null;
    onvalue: (value: T | null) => void;
  }
  const { schema, value, onvalue }: Props = $props()
  let reference: T | null = $state(value)
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)
  const collectionId = getReferenceCollectionId(schema)
  const pickerHref = `${resolve('/(admin)/collections/[collectionName]', { collectionName: collectionId })}?selectionId=${selectionId}`

  function deleteReference () {
    reference = null
    updateValue()
  }
  function getReferenceCollectionId (schema: SchemaObject) {
    if (!schema.description) { throw new Error('For reference use helper function') }
    const collection = schema.description
    return collection
  }
  function updateValue () {
    onvalue(reference)
  }

  itc.on('selectionInit', async () => {
    const parameters = {
      maxItems: 1,
    }
    const selectionInitData = {
      parameters,
      defaultValue: reference ? [$state.snapshot(reference)] : [],
    }
    itc.send('selectionInitData', selectionInitData)
    const selection = (await itc.once('selectionDone')) as Array<T>
    itc.send('selectionKill')
    if (selection.length < 1) return
    reference = selection[0]
    updateValue()
  })

  onDestroy(() => {
    itc.close()
  })
</script>

<div class="flex flex-col gap-2">
  {#if reference}
    <DocumentReference {reference} {collectionId} {deleteReference} />
  {:else}
    <PickerButton href={pickerHref} label="Choose from {collectionId}" icon="bi-collection" />
  {/if}
</div>
