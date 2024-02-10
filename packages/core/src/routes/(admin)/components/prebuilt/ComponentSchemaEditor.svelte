<script lang="ts">
  import type { attributeValue, ComponentSchema } from '$lib/script/components/types'
  import { componentSchemaFileSchema } from '$lib/script/components/schemas'
  import Ajv from 'ajv'
  import Modal from '$lib/components/Modal.svelte'
  import ComponentSchemaAttribute from './ComponentSchemaAttribute.svelte'
  import ComponentSchemaAttributeEditor from './ComponentSchemaAttributeEditor.svelte'
  import Button from '$lib/components/Button.svelte'
  import { Input, Label } from 'flowbite-svelte'

  const componentSchema: ComponentSchema = {
    version: Date.now().toString(),
    name: '',
    attributes: []
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
    componentSchema.attributes = [...componentSchema.attributes, newAttribute]
    isModalOpen = false
  }
  const handleAttributeDeletion = (event: CustomEvent) => {
    if (!event.detail) return
    const attributeName = event.detail
    componentSchema.attributes = componentSchema.attributes.filter((attribute) => attribute.name !== attributeName)
  }
  const serializeComponentSchema = (componentSchema: ComponentSchema) => {
    const isValid = validate(componentSchema)
    if (!isValid) {
      return ''
    }
    return JSON.stringify(componentSchema)
  }
  $: serializeComponentSchema(componentSchema)
</script>

<div class="flex-grow flex flex-col justify-center">
    <div class="w-full my-auto">
        <Label class="text-xl">
            Schema name:
            <Input type="text" class="w-full" bind:value={componentSchema.name}/>
        </Label>
        <h2 class="text-xl">
            Attributes:
        </h2>
        <div class="py-1">
            {#each componentSchema.attributes as attribute}
                <ComponentSchemaAttribute {attribute}/>
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
        <input type="hidden" name="componentSchema" value={serializeComponentSchema(componentSchema)}/>
        <Button type="submit" class="w-full bg-dark">
            Create
        </Button>
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
