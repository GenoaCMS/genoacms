<script lang="ts">
  import { enhance } from '$app/forms'
  import Modal from '$lib/components/Modal.svelte'
  import Button from '$lib/components/Button.svelte'
  import Input from '$lib/components/Input.svelte'
  import { alertPending, Toast } from '$lib/script/alert'
  import { invalidateAll } from '$app/navigation'

  let isDirectoryCreationModalOpen = false
  const toggleDirectoryCreationModal = () => {
    isDirectoryCreationModalOpen = !isDirectoryCreationModalOpen
  }
  const enhanceCreation = () => {
    const alert = alertPending('Creating')
    isDirectoryCreationModalOpen = false
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        Toast.fire({
          icon: 'error',
          title: 'Failed to create directory'
        })
        return
      }
      Toast.fire({
        icon: 'success',
        title: 'Directory created'
      })
      invalidateAll()
    }
  }
</script>

<button class="h-full flex items-center px-3" on:click={toggleDirectoryCreationModal}>
    <i class="bi bi-folder-plus text-2xl text-white hover:text-warning transition-all"/>
</button>

<Modal bind:isOpen={isDirectoryCreationModalOpen}>
    <svelte:fragment slot="header">
        <h1 class="text-2xl">
            Create directory
        </h1>
    </svelte:fragment>
    <form enctype="multipart/form-data" action="?/createDirectory" method="post" use:enhance={enhanceCreation} class="flex flex-col p-4">
        <div class="flex py-2">
            <label for="directoryName" class="p-2">
                Name:
            </label>
            <Input id="directoryName" name="directoryName" class="w-full"/>
        </div>
        <Button type="submit">
            Create
        </Button>
    </form>
</Modal>
