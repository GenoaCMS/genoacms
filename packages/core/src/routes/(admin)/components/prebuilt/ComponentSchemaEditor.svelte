<script lang="ts">
  import type { Attribute, PrebuiltComponentEntry } from '$lib/script/components/componentEntry/component/types'
  import { enhance } from '$app/forms'
  import ComponentSchemaAttribute from './ComponentSchemaAttribute.svelte'
  import ComponentSchemaAttributeEditor from './ComponentSchemaAttributeEditor.svelte'
  import { Button, Input, Label, Modal } from 'flowbite-svelte'
  import { validatePrebuiltComponentEntry } from '$lib/script/components/componentEntry/component/validators'

  const currentDateString = Date.now().toString()
  export let schema: PrebuiltComponentEntry = {
    uid: crypto.randomUUID(),
    name: '',
    versions: {
      [currentDateString]: {
        version: currentDateString,
        attributes: {}
      }
    },
    currentVersion: currentDateString
  }
  export let enhanceForm = () => {
  }
  let isModalOpen = false

  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const handleAttributeCreation = (event: CustomEvent) => {
    if (!event.detail) return
    const newAttribute: Attribute = event.detail
    schema.versions[schema.currentVersion].attributes[newAttribute.uid] = newAttribute
    isModalOpen = false
  }
  const handleAttributeDeletion = (event: CustomEvent) => {
    if (!event.detail) return
    const attributeName = event.detail
    delete schema.versions[schema.currentVersion].attributes[attributeName]
  }
  const serializeComponentSchema = (componentSchema: PrebuiltComponentEntry) => {
    const isValid = validatePrebuiltComponentEntry(componentSchema)
    if (!isValid) {
      console.warn('Invalid component schema', validatePrebuiltComponentEntry.errors, componentSchema)
      return ''
    }
    return JSON.stringify(componentSchema)
  }
  $: serializeComponentSchema(schema)
  $: attributeArray = Object.values(schema.versions[schema.currentVersion].attributes)
</script>

<div class="flex-grow flex flex-col justify-center">
    <div class="w-full mb-3">
        <Label class="text-xl">
            Schema name:
            <Input type="text" class="w-full" bind:value={schema.name}/>
        </Label>
        <h2 class="text-xl">
            Attributes:
        </h2>
        <div class="py-1">
            {#each attributeArray as attribute}
                <ComponentSchemaAttribute {attribute} on:delete={handleAttributeDeletion}/>
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
    <div class="my-auto">
        <form action="?/uploadComponentSchema" method="post" use:enhance={enhanceForm}>
            <input type="hidden" name="componentSchema" value={serializeComponentSchema(schema)}/>
            <Button type="submit" color="light" class="w-full">
                Create
            </Button>
        </form>
    </div>
</div>

<Modal title="New attribute" bind:open={isModalOpen}>
    <div class="m-auto w-2/3">
        <ComponentSchemaAttributeEditor on:save={handleAttributeCreation}/>
    </div>
</Modal>
