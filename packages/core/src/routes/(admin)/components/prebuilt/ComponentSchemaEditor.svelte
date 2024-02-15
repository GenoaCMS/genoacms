<script lang="ts">
  import type { attributeValue, ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
  import { componentSchemaFileSchema } from '$lib/script/components/componentSchema/schemas'
  import { enhance } from '$app/forms'
  import Ajv from 'ajv'
  import Modal from '$lib/components/Modal.svelte'
  import ComponentSchemaAttribute from './ComponentSchemaAttribute.svelte'
  import ComponentSchemaAttributeEditor from './ComponentSchemaAttributeEditor.svelte'
  import Button from '$lib/components/Button.svelte'
  import { Input, Label } from 'flowbite-svelte'

  const currentDateString = Date.now().toString()
  export let schema: ComponentSchemaFile = {
    name: '',
    versions: {
      [currentDateString]: {
        version: currentDateString,
        attributes: []
      }
    },
    currentVersion: currentDateString
  }
  export let enhanceForm = () => {
  }
  let isModalOpen = false
  const ajv = new Ajv()
  const validate = ajv.compile(componentSchemaFileSchema)

  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const handleAttributeCreation = (event: CustomEvent) => {
    if (!event.detail) return
    const newAttribute: attributeValue = event.detail
    schema.versions[schema.currentVersion].attributes = [
      ...schema.versions[schema.currentVersion].attributes,
      newAttribute]
    isModalOpen = false
  }
  const handleAttributeDeletion = (event: CustomEvent) => {
    if (!event.detail) return
    const attributeName = event.detail
    schema.versions[schema.currentVersion].attributes = schema.versions[schema.currentVersion].attributes
      .filter((attribute) => attribute.name !== attributeName)
  }
  const serializeComponentSchema = (componentSchema: ComponentSchemaFile) => {
    const isValid = validate(componentSchema)
    if (!isValid) {
      console.warn('Invalid component schema', validate.errors, componentSchema)
      return ''
    }
    return JSON.stringify(componentSchema)
  }
  $: serializeComponentSchema(schema)
</script>

<div class="flex-grow flex flex-col justify-center">
    <div class="w-full my-auto">
        <Label class="text-xl">
            Schema name:
            <Input type="text" class="w-full" bind:value={schema.name}/>
        </Label>
        <h2 class="text-xl">
            Attributes:
        </h2>
        <div class="py-1">
            {#each schema.versions[schema.currentVersion].attributes as attribute}
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
            <Button type="submit" class="w-full bg-dark">
                Create
            </Button>
        </form>
    </div>
</div>

<Modal bind:isOpen={isModalOpen}>
    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            New attribute
        </h1>
    </svelte:fragment>
    <div class="m-auto w-2/3">
        <ComponentSchemaAttributeEditor on:save={handleAttributeCreation}/>
    </div>
</Modal>
