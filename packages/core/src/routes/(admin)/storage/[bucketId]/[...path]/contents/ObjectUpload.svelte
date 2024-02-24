<script lang="ts">
  import { enhance } from '$app/forms'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'
  import { invalidateAll } from '$app/navigation'
  import { Button, Input, Modal } from 'flowbite-svelte'

  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
  const enhanceUpload = () => {
    const alert = alertPending('Uploading')
    isModalOpen = false
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Upload failed')
        return
      }
      toastSuccess('Upload successful')
      invalidateAll()
    }
  }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
    <i class="bi bi-upload text-2xl hover:text-warning transition-all"/>
</button>

<Modal title="Upload files" bind:open={isModalOpen}>
    <form enctype="multipart/form-data" action="?/uploadObject" method="post" use:enhance={enhanceUpload} class="flex flex-col p-4">
        <Input name="files[]" type="file" multiple required class="w-full my-2"/>
        <Button type="submit" color="light" class="w-full">
            Upload
        </Button>
    </form>
</Modal>
