<script lang="ts">
  import type { attributeValue } from '$lib/script/components/componentSchema/types'
  import ComponentSchemaAttributeEditor from './ComponentSchemaAttributeEditor.svelte'
  import { createEventDispatcher } from 'svelte'
  import { Modal } from 'flowbite-svelte'

  export let attribute: attributeValue
  const dispatch = createEventDispatcher()

  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const updateAttribute = (event: CustomEvent) => {
    if (!event.detail) return
    isModalOpen = false
    attribute = event.detail
  }
  const dispatchDelete = () => {
    dispatch('delete', attribute.name)
  }
</script>

<div class="border border-dark border-opacity-30 w-full p-3 flex">
    {attribute.type}
    {attribute.name}
    <div class="ms-auto">
        <button type="button" on:click={toggleModal}>
            <i class="bi bi-pencil-square"/>
        </button>
        <button type="button" class="ms-4" on:click={dispatchDelete}>
            <i class="bi bi-trash"/>
        </button>
    </div>
</div>

<Modal title="Edit attribute" bind:open={isModalOpen}>
    <div class="m-auto w-2/3">
        <ComponentSchemaAttributeEditor {attribute} on:save={updateAttribute}/>
    </div>
</Modal>
