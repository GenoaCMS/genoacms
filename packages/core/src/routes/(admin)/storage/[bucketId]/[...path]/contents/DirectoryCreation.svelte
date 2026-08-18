<script lang="ts">
  import { enhance } from '$app/forms'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { invalidateAll } from '$app/navigation'
  import { Button, Input, Label, Modal } from '$lib/components/ui/index'

  let isDirectoryCreationModalOpen = $state(false)
  function toggleDirectoryCreationModal () {
    isDirectoryCreationModalOpen = !isDirectoryCreationModalOpen
  }
  function enhanceCreation () {
    const alert = alertPending('Creating')
    isDirectoryCreationModalOpen = false
    return async ({ result }) => {
      alert.close()
      if (result.type !== 'success') {
        toastError('Failed to create directory')
        return
      }
      toastSuccess('Directory created')
      invalidateAll()
    }
  }
</script>

<button class="h-full flex items-center px-3" onclick={toggleDirectoryCreationModal} aria-label="Create directory">
    <i class="bi bi-folder-plus text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Create directory" bind:open={isDirectoryCreationModalOpen}>
  <form enctype="multipart/form-data" action="?/createDirectory" method="post" use:enhance={enhanceCreation} class="flex flex-col space-y-3">
    <Label for="directoryName">
      Directory name:
      <Input id="directoryName" name="directoryName" class="w-full mt-1" required/>
    </Label>
    <Button preset="filled" class="w-full mt-4" type="submit">
      Create
    </Button>
  </form>
</Modal>
