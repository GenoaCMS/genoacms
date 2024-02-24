<script lang="ts">
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { invalidateAll } from '$app/navigation'
  import ComponentSchemaEditor from './ComponentSchemaEditor.svelte'
  import { Modal } from 'flowbite-svelte'

  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const enhanceCreation = () => {
    const alert = alertPending('Creating')
    return async ({ result }) => {
      alert.close()
      console.log(result)
      if (result.type !== 'success') {
        toastError('Creation failed')
        return
      }
      toastSuccess('Creation successful')
      isModalOpen = false
      invalidateAll()
    }
  }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
    <i class="bi bi-file-plus text-2xl hover:text-warning transition-all"/>
</button>

<Modal title="Create a new component schema" bind:open={isModalOpen}>
    <div class="flex w-3/4 mx-auto">
        <ComponentSchemaEditor enhanceForm={enhanceCreation}/>
    </div>
</Modal>
