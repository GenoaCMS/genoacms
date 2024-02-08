<script lang="ts">
  import { enhance } from '$app/forms'
  import Button from '$lib/components/Button.svelte'
  import Modal from '$lib/components/Modal.svelte'
  import Input from '$lib/components/Input.svelte'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'

  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const enhanceUpload = () => {
    const alert = alertPending('Uploading')
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Upload failed')
        return
      }
      isModalOpen = false
      toastSuccess('Upload successful')
    }
  }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
    <i class="bi bi-upload text-2xl hover:text-warning transition-all"/>
</button>

<Modal isOpen={isModalOpen}>

    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            Upload files
        </h1>
    </svelte:fragment>
    <form enctype="multipart/form-data" action="?/uploadObject" method="post" use:enhance={enhanceUpload} class="flex flex-col p-4">
        <Input name="files[]" type="file" multiple required class="w-full my-2"/>
        <Button type="submit" class="w-full text-dark">
            Upload
        </Button>
    </form>
</Modal>
