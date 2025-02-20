<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { onDestroy } from 'svelte'
  import { ITC } from '$lib/script/utils'
  import EditSelection from './EditSelection.svelte'
  import DocumentReference from './DocumentReference.svelte'

  type T = string | number | boolean
  type Props = {
    schema: JSONSchemaType<T>
    value: Array<T> | undefined,
    onvalue: (value: Array<T>) => void
  }
  const { schema, value, onvalue }: Props = $props()
  let references: Array<T> = $state(value || [])
  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)
  const collectionId = getReferenceCollectionId(schema)

  function deleteReference (reference: T) {
    references = references.filter((item) => item !== reference)
    updateValue()
  }
  function clearReferences () {
    references = []
    updateValue()
  }
  function getReferenceCollectionId (schema: JSONSchemaType<T>) {
    if (!schema.description) throw new Error('For reference use helper function')
    const collection = schema.description
    return collection
  }
  function updateValue () {
    onvalue(references)
  }

  itc.on('selectionInit', async () => {
    const parameters = {
      maxItems: 0
    }
    const selectionInitData = {
      parameters,
      defaultValue: $state.snapshot(references)
    }
    itc.send('selectionInitData', selectionInitData)
    const selection = await itc.once('selectionDone') as Array<T>
    itc.send('selectionKill')
    if (selection.length < 1) return
    references = selection
    updateValue()
  })

  onDestroy(() => {
    itc.close()
  })
</script>

<div class="flex flex-col">
  {#each references as reference, index (index)}
    <DocumentReference {reference} {deleteReference}/>
  {:else}
    <div class="text-center text-xl w-auto m-auto pb-3 pt-2">
      No documents selected yet
    </div>
  {/each}
  <EditSelection {selectionId} {collectionId} hideDeleteButton clear={clearReferences}/>
</div>
