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

<Button class="text-dark" on:click={toggleModal}>
    Upload file
</Button>

<Modal isOpen={isModalOpen}>
    <form enctype="multipart/form-data" action="?/uploadObject" method="post" use:enhance={enhanceUpload}>
        <Input name="files[]" type="file" multiple required/>
        <Button type="submit" class="text-dark">
            Upload
        </Button>
    </form>
</Modal>
