<script lang="ts">
  import { enhance } from '$app/forms'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { invalidateAll } from '$app/navigation'
  import { Button, Input, Modal } from '$lib/components/ui/index'

  let isModalOpen = $state(false)
  function toggleModal () {
    isModalOpen = !isModalOpen
  }
  function enhanceUpload () {
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

<button class="h-full flex items-center px-3" onclick={toggleModal} aria-label="Upload object">
    <i class="bi bi-upload text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Upload files" bind:open={isModalOpen}>
  <form enctype="multipart/form-data" action="?/uploadObject" method="post" use:enhance={enhanceUpload} class="flex flex-col space-y-3">
    <Input name="files[]" type="file" multiple required class="w-full"/>
    <Button preset="filled" class="w-full mt-4" type="submit">
      Upload
    </Button>
  </form>
</Modal>
