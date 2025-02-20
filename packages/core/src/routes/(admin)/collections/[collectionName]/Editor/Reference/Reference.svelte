<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { onDestroy } from 'svelte'
  import { ITC } from '$lib/script/utils'
  import EditSelection from './EditSelection.svelte'
  import DocumentReference from './DocumentReference.svelte'

  type T = string | number | boolean
  type Props = {
    schema: JSONSchemaType<T>
    value: T | null,
    onvalue: (value: T | null) => void
  }
  const { schema, value, onvalue }: Props = $props()
  let reference: T | null = $state(value)
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)
  const collectionId = getReferenceCollectionId(schema)

  function deleteReference () {
    reference = null
    updateValue()
  }
  function getReferenceCollectionId (schema: JSONSchemaType<T>) {
    if (!schema.description) throw new Error('For reference use helper function')
    const collection = schema.description
    return collection
  }
  function updateValue () {
    onvalue(reference)
  }

  itc.on('selectionInit', async () => {
    const parameters = {
      maxItems: 1
    }
    const selectionInitData = {
      parameters,
      defaultValue: reference ? [$state.snapshot(reference)] : []
    }
    itc.send('selectionInitData', selectionInitData)
    const selection = await itc.once('selectionDone') as Array<T>
    itc.send('selectionKill')
    if (selection.length < 1) return
    reference = selection[0]
    updateValue()
  })

  onDestroy(() => {
    itc.close()
  })
</script>

<div class="flex flex-col">
  {#if reference}
    <DocumentReference {reference} {deleteReference}/>
  {:else}
    <EditSelection {selectionId} {collectionId} hideDeleteButton/>
  {/if}
</div>
