<script lang="ts">
  import type { attributeValue } from '$lib/script/components/types'
  import ComponentSchemaAttributeEditor from './ComponentSchemaAttributeEditor.svelte'
  import Modal from '$lib/components/Modal.svelte'

  export let attribute: attributeValue

  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const updateAttribute = (event: CustomEvent) => {
    if (!event.detail) return
    isModalOpen = false
    attribute = event.detail
  }
</script>

<button on:click={toggleModal} class="border border-dark border-opacity-30 w-full p-3">
    {attribute.type}
    {attribute.name}
</button>

<Modal bind:isOpen={isModalOpen}>
    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            Edit attribute
        </h1>
    </svelte:fragment>
    <div class="m-auto w-2/3">
        <ComponentSchemaAttributeEditor {attribute} on:save={updateAttribute}/>
    </div>
</Modal>
