<script lang="ts">
  import ComponentForm from './ComponentForm.svelte'
  import { Modal } from 'flowbite-svelte'

  const { createForm } = $props()
  let isModalOpen = $state(false)
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
    <i class="bi bi-file-plus text-2xl hover:text-warning transition-all"/>
</button>

<Modal title="Create a new component" bind:open={isModalOpen}>
    <div class="flex w-3/4 mx-auto">
        <ComponentForm {createForm} />
    </div>
</Modal>
