<script lang="ts">
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { invalidateAll } from '$app/navigation'
  import { enhance } from '$app/forms'
  import Modal from '$lib/components/Modal.svelte'
  import ComponentSchemaEditor from './ComponentSchemaEditor.svelte'

  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const enhanceUpload = () => {
    const alert = alertPending('Creating')
    return async ({ result }) => {
      alert.close()
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

<Modal isOpen={isModalOpen}>

    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            Create a new component schema
        </h1>
    </svelte:fragment>
    <form enctype="multipart/form-data" action="?/uploadObject" method="post" use:enhance={enhanceUpload} class="flex flex-col p-4">
    </form>
    <ComponentSchemaEditor />
</Modal>
