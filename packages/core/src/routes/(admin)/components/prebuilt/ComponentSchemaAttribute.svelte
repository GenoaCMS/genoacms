<script lang="ts">
  import type { attributeValue } from '$lib/script/components/types'
  import ComponentSchemaAttributeEditor from './ComponentSchemaAttributeEditor.svelte'
  import Modal from '$lib/components/Modal.svelte'

  export let attribute: attributeValue

  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
</script>

<button on:click={toggleModal} class="border border-dark border-opacity-30">
    {attribute.name}
    {attribute.type}
</button>

<Modal isOpen={isModalOpen}>
    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            New attribute
        </h1>
    </svelte:fragment>
    <ComponentSchemaAttributeEditor bind:attribute />
</Modal>
