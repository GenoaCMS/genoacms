<script lang="ts">
  import type {
    Attribute as AttributeT,
    ComponentEntry,
    ComponentEntryAttributes
  } from '$lib/script/components/componentEntry/component/types'
  import { enhance } from '$app/forms'
  import Attribute from './Attribute.svelte'
  import ComponentSchemaAttributeEditor from './AttributeEditor.svelte'
  import { Button, Input, Label, Modal } from 'flowbite-svelte'
  import { validateComponentEntryAttributes } from '$lib/script/components/componentEntry/component/validators'
  import diff from 'deep-diff'
  import { duplicateObject } from '$lib/script/utils'

  export let entry: ComponentEntry = {
    uid: crypto.randomUUID(),
    name: '',
    attributes: {},
    history: [],
    future: []
  }
  export let enhanceForm = () => {
  }
  let isModalOpen = false

  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const pushEntryState = (oldAttributes: ComponentEntryAttributes, entry: ComponentEntry) => {
    const differences = diff.diff(oldAttributes, entry.attributes)
    if (differences) {
      entry.history.push(differences)
      entry.future = []
    }
  }
  const undo = () => {
    const lastChange = entry.history.pop()
    if (!lastChange) return
    for (const changeDiff of lastChange) {
      diff.revertChange(entry.attributes, entry.attributes, changeDiff)
    }
    entry.future = [
      ...entry.future,
      lastChange
    ]
  }
  const redo = () => {
    const lastChange = entry.future.pop()
    if (!lastChange) return
    for (const changeDiff of lastChange) {
      diff.applyChange(entry.attributes, entry.attributes, changeDiff)
    }
    entry.history = [
      ...entry.history,
      lastChange
    ]
  }
  const handleAttributeCreation = (event: CustomEvent) => {
    if (!event.detail) return
    const newAttribute: AttributeT = event.detail
    const oldEntry = duplicateObject(entry)
    entry.attributes[newAttribute.uid] = newAttribute
    pushEntryState(oldEntry.attributes, entry)
    isModalOpen = false
  }
  const handleAttributeUpdate = (event: CustomEvent) => {
    const attribute: AttributeT = event.detail
    const oldEntry = duplicateObject(entry)
    entry.attributes[attribute.uid] = attribute
    pushEntryState(oldEntry.attributes, entry)
  }
  const handleAttributeDeletion = (event: CustomEvent) => {
    if (!event.detail) return
    const oldEntry = duplicateObject(entry)
    const attributeName = event.detail
    delete entry.attributes[attributeName]
    pushEntryState(oldEntry.attributes, entry)
  }
  const serializeComponentSchema = (componentSchema: ComponentEntry) => {
    const isValid = validateComponentEntryAttributes(componentSchema.attributes)
    if (!isValid) {
      console.warn('Invalid component schema', validateComponentEntryAttributes.errors, componentSchema)
      return ''
    }
    return JSON.stringify(componentSchema)
  }
  $: serializeComponentSchema(entry)
  $: attributeArray = Object.values(entry.attributes)
</script>

<div class="flex-grow flex flex-col justify-center">
    <div class="w-full mb-3">
        <Label class="text-xl">
            Schema name:
            <Input type="text" class="w-full" bind:value={entry.name}/>
        </Label>
        <h2 class="text-xl">
            Attributes:
        </h2>
        <div class="py-1">
            {#each attributeArray as attribute (attribute.uid)}
                <Attribute {attribute} on:update={handleAttributeUpdate} on:delete={handleAttributeDeletion}/>
            {:else}
                <p class="w-auto m-auto text-lg text-center">No attributes</p>
            {/each}
        </div>
        <div class="w-auto mx-auto pt-4 text-center">
            <button type="button" on:click={toggleModal}>
                <i class="bi bi-plus-circle text-4xl"/>
            </button>
        </div>
    </div>
    <div class="w-full flex justify-between">
        <button on:click={undo} disabled={!entry.history.length} class="h-full flex items-center px-3">
            <i class="bi bi-arrow-counterclockwise text-2xl transition-all"/>
        </button>
        <form action="?/uploadComponentEntry" method="post" use:enhance={enhanceForm} class="w-1/2">
            <input type="hidden" name="componentEntry" value={serializeComponentSchema(entry)}/>
            <Button type="submit" color="light" class="w-full">
                Save
            </Button>
        </form>
        <button on:click={redo} disabled={!entry.future.length} class="h-full flex items-center px-3">
            <i class="bi bi-arrow-clockwise text-2xl transition-all"/>
        </button>
    </div>
</div>

<Modal title="New attribute" bind:open={isModalOpen}>
    <div class="m-auto w-2/3">
        <ComponentSchemaAttributeEditor on:save={handleAttributeCreation}/>
    </div>
</Modal>
