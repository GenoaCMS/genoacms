<script lang="ts">
  import type {
    Attribute as AttributeT,
    ComponentEntry,
    ComponentEntryAttributes
  } from '$lib/script/components/componentEntry/component/types'
  import Attribute from './Attribute.svelte'
  import ComponentSchemaAttributeEditor from './AttributeEditor.svelte'
  import { Button, Input, Label, Modal } from 'flowbite-svelte'

  interface Props {
    attributes: ComponentEntryAttributes
  }
  const { attributes }: Props = $props()
  let isModalOpen = $state(false)

  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }

  const handleAttributeCreation = (event: CustomEvent) => {
    if (!event.detail) return
    const newAttribute: AttributeT = event.detail
    attributes[newAttribute.uid] = newAttribute
    isModalOpen = false
  }
  const handleAttributeUpdate = (event: CustomEvent) => {
    const attribute: AttributeT = event.detail
    attributes[attribute.uid] = attribute
  }
  const handleAttributeDeletion = (event: CustomEvent) => {
    if (!event.detail) return
    const attributeName = event.detail
    delete attributes[attributeName]
  }
</script>

<div class="flex-grow flex flex-col justify-center">
    <div class="w-full mb-3">
        <h2 class="text-xl">
            Attributes:
        </h2>
        <div class="py-1">
            {#each Object.values(attributes) as attribute (attribute.uid)}
                <Attribute {attribute} on:update={handleAttributeUpdate} on:delete={handleAttributeDeletion}/>
            {:else}
                <p class="w-auto m-auto text-lg text-center">No attributes</p>
            {/each}
        </div>
        <div class="w-auto mx-auto pt-4 text-center">
            <button type="button" onclick={toggleModal}>
                <i class="bi bi-plus-circle text-4xl"></i>
            </button>
        </div>
    </div>
</div>

<Modal title="New attribute" bind:open={isModalOpen}>
    <div class="m-auto w-2/3">
        <ComponentSchemaAttributeEditor on:save={handleAttributeCreation}/>
    </div>
</Modal>
